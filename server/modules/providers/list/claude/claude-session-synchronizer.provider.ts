import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { sessionsDb } from '@/modules/database/index.js';
import {
  buildLookupMap,
  extractFirstValidJsonlData,
  findFilesRecursivelyCreatedAfter,
  normalizeSessionName,
  readFileTimestamps,
} from '@/shared/utils.js';
import type { IProviderSessionSynchronizer } from '@/shared/interfaces.js';

type ParsedSession = {
  sessionId: string;
  projectPath: string;
  sessionName?: string;
};

/**
 * Session indexer for Claude transcript artifacts.
 */
export class ClaudeSessionSynchronizer implements IProviderSessionSynchronizer {
  private readonly provider = 'claude' as const;
  private readonly claudeHome = path.join(os.homedir(), '.claude');

  /**
   * Returns true when a JSONL file is a subagent transcript rather than a
   * top-level session.
   *
   * Claude stores subagent transcripts under a `subagents/` directory, e.g.
   * `~/.claude/projects/<encoded-cwd>/<session-id>/subagents/agent-<id>.jsonl`.
   * Those files repeat the parent session's `sessionId`, so indexing them as
   * standalone sessions overwrites the parent row's `jsonl_path` and corrupts
   * the main session record. The recursive scan in `synchronize()` reaches
   * them, so both entry points must skip them.
   */
  private isSubagentTranscript(filePath: string): boolean {
    return path.normalize(filePath).split(path.sep).includes('subagents');
  }

  /**
   * Scans ~/.claude/projects and upserts discovered sessions into DB.
   */
  async synchronize(since?: Date): Promise<number> {
    const nameMap = await buildLookupMap(path.join(this.claudeHome, 'history.jsonl'), 'sessionId', 'display');
    const files = await findFilesRecursivelyCreatedAfter(
      path.join(this.claudeHome, 'projects'),
      '.jsonl',
      since ?? null
    );

    let processed = 0;
    for (const filePath of files) {
      if (this.isSubagentTranscript(filePath)) {
        continue;
      }

      const parsed = await this.processSessionFile(filePath, nameMap);
      if (!parsed) {
        continue;
      }

      const timestamps = await readFileTimestamps(filePath);
      sessionsDb.createSession(
        parsed.sessionId,
        this.provider,
        parsed.projectPath,
        parsed.sessionName,
        timestamps.createdAt,
        timestamps.updatedAt,
        filePath
      );
      processed += 1;
    }

    return processed;
  }

  /**
   * Parses and upserts one Claude session JSONL file.
   */
  async synchronizeFile(filePath: string): Promise<string | null> {
    if (!filePath.endsWith('.jsonl')) {
      return null;
    }
    if (this.isSubagentTranscript(filePath)) {
      return null;
    }

    const nameMap = await buildLookupMap(path.join(this.claudeHome, 'history.jsonl'), 'sessionId', 'display');
    const parsed = await this.processSessionFile(filePath, nameMap);
    if (!parsed) {
      return null;
    }

    const timestamps = await readFileTimestamps(filePath);
    return sessionsDb.createSession(
      parsed.sessionId,
      this.provider,
      parsed.projectPath,
      parsed.sessionName,
      timestamps.createdAt,
      timestamps.updatedAt,
      filePath
    );
  }

  /**
   * Resolve Anthropic API key AND config from settings.json env block.
   */
  private async resolveAnthropicConfig(): Promise<{ key: string; baseUrl: string; model: string } | null> {
    let key: string | null = null;
    let baseUrl = 'https://api.anthropic.com';
    let model = 'claude-haiku-4-20250915';

    // process.env first
    if (process.env.ANTHROPIC_API_KEY?.trim()) key = process.env.ANTHROPIC_API_KEY.trim();
    if (process.env.ANTHROPIC_AUTH_TOKEN?.trim()) key = process.env.ANTHROPIC_AUTH_TOKEN.trim();
    if (process.env.ANTHROPIC_BASE_URL?.trim()) baseUrl = process.env.ANTHROPIC_BASE_URL.trim();

    // Read from ~/.claude/settings.json env block
    try {
      const settingsPath = path.join(this.claudeHome, 'settings.json');
      const content = await readFile(settingsPath, 'utf8');
      const settings: any = JSON.parse(content);
      const env = settings?.env;
      if (typeof env === 'object' && env) {
        if (typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.trim()) key = env.ANTHROPIC_API_KEY.trim();
        if (typeof env.ANTHROPIC_AUTH_TOKEN === 'string' && env.ANTHROPIC_AUTH_TOKEN.trim()) key = env.ANTHROPIC_AUTH_TOKEN.trim();
        if (typeof env.ANTHROPIC_BASE_URL === 'string' && env.ANTHROPIC_BASE_URL.trim()) baseUrl = env.ANTHROPIC_BASE_URL.trim();
        if (typeof env.ANTHROPIC_DEFAULT_HAIKU_MODEL === 'string' && env.ANTHROPIC_DEFAULT_HAIKU_MODEL.trim()) model = env.ANTHROPIC_DEFAULT_HAIKU_MODEL.trim();
      }
    } catch { /* no settings.json */ }

    // Read OAuth access token from ~/.claude/.credentials.json
    if (!key) {
      try {
        const credPath = path.join(this.claudeHome, '.credentials.json');
        const content = await readFile(credPath, 'utf8');
        const creds: any = JSON.parse(content);
        const oauth = creds?.claudeAiOauth;
        if (oauth && typeof oauth.accessToken === 'string') {
          const expiresAt = typeof oauth.expiresAt === 'number' ? oauth.expiresAt : null;
          if (!expiresAt || Date.now() < expiresAt) {
            key = oauth.accessToken;
          }
        }
      } catch { /* no credentials.json */ }
    }

    if (!key) return null;
    return { key, baseUrl, model };
  }

  /**
   * Generate a concise session title via AI.
   * Uses a strongly-constrained prompt so the model returns a proper title directly.
   * Falls back to smart truncation of the user prompt if AI call fails.
   */
  private async generateAiTitle(userPrompt: string): Promise<string | undefined> {
    const config = await this.resolveAnthropicConfig();
    if (!config) return this.truncateToTitle(userPrompt);

    const url = `${config.baseUrl.replace(/\/+$/, '')}/v1/messages`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.key}`,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 128,
          messages: [
            {
              role: 'user',
              content: `You are a session titler. Generate a 2-10 word title that captures the TOPIC of the user's message.
Rules:
- Use the same language as the user's message (Chinese→Chinese, English→English, mixed→match the dominant language)
- Do NOT repeat the user's exact words verbatim — summarize the intent or topic
- For greetings ("hello", "你好", "hi"), use a domain-agnostic title like "General Chat" / "日常闲聊"
- For questions, summarize the subject (e.g. "天气查询", "Weather Query", "李白简介")
- For URLs/sharing, name the topic discussed (e.g. "DeepSeek对话启发", "Code Review")
- Max 30 characters. NO newlines, NO lists, NO explanations.
- Output ONLY the title text, nothing else.

User message:\n${userPrompt.slice(0, 500)}`,
            },
          ],
        }),
      });

      if (!res.ok) return this.truncateToTitle(userPrompt);
      const data: any = await res.json();

      // Extract title from the first text block
      for (const block of data?.content || []) {
        if (block?.type === 'text' && typeof block.text === 'string') {
          let title = block.text.replace(/<[^>]+>/g, '').trim();
          if (title.length === 0) continue;
          if (title.includes('\n') || title.includes('\r')) continue;
          if (title.length > 60) title = title.slice(0, 60);
          return title;
        }
      }

      return this.truncateToTitle(userPrompt);
    } catch {
      return this.truncateToTitle(userPrompt);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Detect if a string looks like an AI response fragment rather than a
   * human-readable session title. Used for custom-title events from Claude CLI.
   */
  private looksLikeAIFragment(title: string): boolean {
    const t = title.trim();
    if (t.includes('\n') || t.includes('\r')) return true;
    if (/[-*•]\s/.test(t)) return true;
    const stripped = t.replace(/[\s\(\)\[\],.\u201c\u201d\u2018\u2019\u00b7—-]+/, '').trim();
    if (!stripped) return true;
    const fillerRegex = /\b(is also|is indeed|is a |here is |thank you|i will|i can|i think|i should|let me|sure,|of course,|certainly,|absolutely|i'll use|yes,)/i;
    if (fillerRegex.test(t) || fillerRegex.test(stripped)) return true;
    if (/potential titles|title for|title:|here are/gi.test(t)) return true;
    if (t.length > 80) return true;
    if (/^\(.*\)[\s:]*[.?!]?\s*$/.test(t)) return true;
    return false;
  }

  /**
   * Smart truncation of user prompt to a readable session title.
   * - Strip common prefixes ("帮我", "你看下", "你帮我看下", etc.)
   * - Truncate to max 60 chars at a sentence boundary or whitespace
   */
  private truncateToTitle(prompt: string): string {
    const maxLen = 60;
    let title = prompt.trim();

    // Strip common Chinese conversational prefixes (order matters: longest first)
    title = title.replace(/^(\s*?(你帮[我忙]?[下看查]+|你看[下查]+|你帮[下看查]+|你给我|你(帮)?[下看查]+|请帮[我忙]?[下看查]+|请[下看查]+|帮[我忙]?[下看查]+|查[一下]?|调查[一下]?|看[一下一眼]?|我先了解下?|我先了解[下查]+|你先[了解下查]+)[\s：:]*)/, '');

    if (title.length <= maxLen) {
      return title;
    }
    // Truncate at a sentence boundary or whitespace near maxLen
    const cut = title.slice(0, maxLen);
    const sentenceBreak = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('.'), cut.lastIndexOf('！'), cut.lastIndexOf('!'));
    if (sentenceBreak > maxLen * 0.5) {
      return cut.slice(0, sentenceBreak + 1);
    }
    // Truncate at last whitespace
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > maxLen * 0.5) {
      return cut.slice(0, lastSpace);
    }
    return cut;
  }
  private async processSessionFile(
    filePath: string,
    nameMap: Map<string, string>
  ): Promise<ParsedSession | null> {
    const parsed = await extractFirstValidJsonlData(filePath, (rawData) => {
      const data = rawData as Record<string, unknown>;
      const sessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;
      const projectPath = typeof data.cwd === 'string' ? data.cwd : undefined;

      if (!sessionId || !projectPath) {
        return null;
      }

      return {
        sessionId,
        projectPath,
      };
    });

    if (!parsed) {
      return null;
    }

    // App-created sessions are keyed by an app id, so disk-discovered provider
    // ids must be resolved through the provider-id mapping first.
    const existingSession = sessionsDb.getSessionByProviderSessionId(parsed.sessionId)
      ?? sessionsDb.getSessionById(parsed.sessionId);
    const existingSessionName = existingSession?.custom_name;
    // Only skip title generation if the session already has a real custom name.
    // We must not skip when:
    // 1. It is the default 'Untitled Claude Session' placeholder
    // 2. It is a long truncated prompt (>60 chars)
    // 3. It matches the first user prompt (meaning it was set from truncateToTitle, not AI)
    let shouldSkip = false;
    if (existingSessionName && existingSessionName !== 'Untitled Claude Session') {
      // Check if the existing name is just the raw prompt or a prefix of it
      const lastPrompt = await this.extractLastPrompt(filePath);
      const trimmedPrompt = lastPrompt?.trim();
      const trimmedExistingName = existingSessionName.trim();
      if (
        trimmedPrompt
        && (
          trimmedExistingName === trimmedPrompt
          || (trimmedExistingName.length >= 60 && trimmedPrompt.startsWith(trimmedExistingName))
        )
      ) {
        // Existing name is derived from the prompt, not AI generated — regenerate
        shouldSkip = false;
      } else {
        shouldSkip = true;
      }
    }
    if (shouldSkip) {
      return {
        ...parsed,
        sessionName: normalizeSessionName(existingSessionName ?? undefined, 'Untitled Claude Session'),
      };
    }

    let sessionName = nameMap.get(parsed.sessionId);
    if (!sessionName) {
      sessionName = (await this.extractSessionAiTitleFromEnd(filePath))?.title;
    }

    // If title from custom-title/ai-title is too long (>60 chars), truncate it.
    // Claude CLI writes the full user prompt as custom-title, which can be 120+ chars.
    if (sessionName && sessionName.length > 60) {
      sessionName = this.truncateToTitle(sessionName);
    }

    // If still no title from custom-title/ai-title events, try AI generation
    // using the last user prompt from the JSONL file.
    let lastPrompt: string | undefined;
    if (!sessionName) {
      lastPrompt = await this.extractLastPrompt(filePath);
      if (lastPrompt) {
        console.debug(`[AutoTitle] Generating AI title for session ${parsed.sessionId}`);
        sessionName = await this.generateAiTitle(lastPrompt);
        console.debug(`[AutoTitle] Generated AI title`, { sessionId: parsed.sessionId, hasTitle: Boolean(sessionName) });
      }
    }

    // ponytail: strip leaked thinking/xml tags from any title source, then reject AI fragments
    if (sessionName) {
      // ponytail: strip ALL xml tags (thinking, answer, etc.), not just Thinking — shortest regex covers every leaked tag
      sessionName = sessionName.replace(/<[^>]+>/g, '').trim();
      if (this.looksLikeAIFragment(sessionName)) {
        // AI generated a garbage title — fall back to user prompt truncation instead of 'Untitled'
        sessionName = lastPrompt ? this.truncateToTitle(lastPrompt) : undefined;
      }
    }

    return {
      ...parsed,
      sessionName: normalizeSessionName(sessionName, 'Untitled Claude Session'),
    };
  }

  /**
   * Extract the last user prompt from the JSONL file for AI title generation.
   * ponytail: prioritize type="user" events over last-prompt, because Ponytail hooks
   * can inject massive system instructions into last-prompt that shadow the real user message.
   */
  private async extractLastPrompt(filePath: string): Promise<string | undefined> {
    try {
      const content = await readFile(filePath, 'utf8');
      const lines = content.split(/\r?\n/);

      // Primary: find the last type="user" event — this is the actual user message
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index]?.trim();
        if (!line) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(line); } catch { continue; }
        const data = parsed as Record<string, unknown>;
        if (data.type === 'user') {
          const msg = (data as any).message;
          if (msg?.role === 'user' && Array.isArray(msg.content)) {
            const textBlock = msg.content.find((b: any) => b.type === 'text');
            if (textBlock?.text?.trim()) return textBlock.text.trim();
          }
        }
      }

      // Fallback: scan for last-prompt event (may contain Ponytail/injected instructions)
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index]?.trim();
        if (!line) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(line); } catch { continue; }
        const data = parsed as Record<string, unknown>;
        if (data.type === 'last-prompt') {
          const lastPrompt = typeof data.lastPrompt === 'string' ? data.lastPrompt : undefined;
          if (lastPrompt?.trim()) return lastPrompt.trim();
        }
      }
    } catch { /* ignore */ }
    return undefined;
  }

  private async extractSessionAiTitleFromEnd(
    filePath: string,
  ): Promise<{ title: string; kind: 'custom-title' | 'ai-title' } | undefined> {
    try {
      const content = await readFile(filePath, 'utf8');
      const lines = content.split(/\r?\n/);

      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index]?.trim();
        if (!line) {
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }

        const data = parsed as Record<string, unknown>;
        const eventType = typeof data.type === 'string' ? data.type : undefined;
        const aiTitle = typeof data.aiTitle === 'string' ? data.aiTitle : undefined;
        const claudeRenamedTitle = typeof data.customTitle === 'string' ? data.customTitle : undefined;

        // Only return custom-title and ai-title; last-prompt is raw user text
        // and should be sent through the AI title generator instead.
        if (eventType === 'custom-title' && claudeRenamedTitle?.trim()) {
          // Ignore the default "Untitled Claude Session" placeholder — treat it
          // as if there was no title at all so AI generation kicks in.
          const trimmedTitle = claudeRenamedTitle.trim();
          if (trimmedTitle === 'Untitled Claude Session') {
            return undefined;
          }
          // Reject titles that look like AI response fragments: parenthesized
          // phrases, lowercase starts, or sentences that don't look like names.
          if (this.looksLikeAIFragment(trimmedTitle)) {
            return undefined;
          }
          return { title: trimmedTitle, kind: 'custom-title' };
        }
        if (eventType === 'ai-title' && aiTitle?.trim()) {
          // Also reject ai-title that looks like an AI fragment.
          if (this.looksLikeAIFragment(aiTitle.trim())) {
            return undefined;
          }
          return { title: aiTitle.trim(), kind: 'ai-title' };
        }
      }
    } catch {
      // Ignore missing/unreadable files so sync can continue.
    }

    return undefined;
  }
}
