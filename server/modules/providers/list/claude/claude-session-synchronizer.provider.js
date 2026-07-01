import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { sessionsDb } from '../../../../modules/database/index.js';
import { buildLookupMap, extractFirstValidJsonlData, findFilesRecursivelyCreatedAfter, normalizeSessionName, readFileTimestamps, } from '../../../../shared/utils.js';
/**
 * Session indexer for Claude transcript artifacts.
 */
export class ClaudeSessionSynchronizer {
    provider = 'claude';
    claudeHome = path.join(os.homedir(), '.claude');
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
    isSubagentTranscript(filePath) {
        return path.normalize(filePath).split(path.sep).includes('subagents');
    }
    /**
     * Scans ~/.claude/projects and upserts discovered sessions into DB.
     */
    async synchronize(since) {
        const nameMap = await buildLookupMap(path.join(this.claudeHome, 'history.jsonl'), 'sessionId', 'display');
        const files = await findFilesRecursivelyCreatedAfter(path.join(this.claudeHome, 'projects'), '.jsonl', since ?? null);
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
            sessionsDb.createSession(parsed.sessionId, this.provider, parsed.projectPath, parsed.sessionName, timestamps.createdAt, timestamps.updatedAt, filePath);
            processed += 1;
        }
        return processed;
    }
    /**
     * Parses and upserts one Claude session JSONL file.
     */
    async synchronizeFile(filePath) {
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
        return sessionsDb.createSession(parsed.sessionId, this.provider, parsed.projectPath, parsed.sessionName, timestamps.createdAt, timestamps.updatedAt, filePath);
    }
    /**
     * Extracts session metadata from one Claude JSONL session file.
     */
    async processSessionFile(filePath, nameMap) {
        const parsed = await extractFirstValidJsonlData(filePath, (rawData) => {
            const data = rawData;
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
        if (existingSessionName && existingSessionName !== 'Untitled Claude Session') {
            return {
                ...parsed,
                sessionName: normalizeSessionName(existingSessionName, 'Untitled Claude Session'),
            };
        }
        let sessionName = nameMap.get(parsed.sessionId);
        if (!sessionName) {
            sessionName = await this.extractSessionAiTitleFromEnd(filePath, parsed.sessionId);
        }
        return {
            ...parsed,
            sessionName: normalizeSessionName(sessionName, 'Untitled Claude Session'),
        };
    }
    async extractSessionAiTitleFromEnd(filePath, sessionId) {
        try {
            const content = await readFile(filePath, 'utf8');
            const lines = content.split(/\r?\n/);
            for (let index = lines.length - 1; index >= 0; index -= 1) {
                const line = lines[index]?.trim();
                if (!line) {
                    continue;
                }
                let parsed;
                try {
                    parsed = JSON.parse(line);
                }
                catch {
                    continue;
                }
                const data = parsed;
                const eventType = typeof data.type === 'string' ? data.type : undefined;
                const eventSessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;
                const aiTitle = typeof data.aiTitle === 'string' ? data.aiTitle : undefined;
                const lastPrompt = typeof data.lastPrompt === 'string' ? data.lastPrompt : undefined;
                const claudeRenamedTitle = typeof data.customTitle === 'string' ? data.customTitle : undefined;
                if ((eventType === 'ai-title' && eventSessionId === sessionId && aiTitle?.trim()) ||
                    (eventType === 'last-prompt' && eventSessionId === sessionId && lastPrompt?.trim()) ||
                    (eventType === "custom-title" && eventSessionId === sessionId && claudeRenamedTitle?.trim())) {
                    return aiTitle || lastPrompt || claudeRenamedTitle;
                }
            }
        }
        catch {
            // Ignore missing/unreadable files so sync can continue.
        }
        return undefined;
    }
}
//# sourceMappingURL=claude-session-synchronizer.provider.js.map