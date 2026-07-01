import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const DEFAULT_CLAUDE_COMMAND = 'claude';
const CLAUDE_SCRIPT_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const CLAUDE_WRAPPER_SEGMENTS = ['node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'];
function getPathApi(platform) {
    return platform === 'win32' ? path.win32 : path;
}
function stripWrappingQuotes(value) {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
function isPathLike(value) {
    return value.includes('/') || value.includes('\\');
}
function resolveClaudeWrapperBinary(wrapperPath, deps) {
    const pathApi = getPathApi(deps.platform);
    const directCandidate = pathApi.resolve(pathApi.dirname(wrapperPath), ...CLAUDE_WRAPPER_SEGMENTS);
    if (deps.existsSync(directCandidate)) {
        return directCandidate;
    }
    let content;
    try {
        content = deps.readFileSync(wrapperPath, 'utf8');
    }
    catch {
        return null;
    }
    const matches = content.matchAll(/["']([^"'\\\r\n]*claude\.exe)["']/gi);
    for (const match of matches) {
        const rawTarget = match[1]
            .replace(/^\$basedir[\\/]/i, '')
            .replace(/^%dp0%[\\/]/i, '')
            .replace(/^%~dp0[\\/]/i, '');
        const normalizedTarget = rawTarget.replace(/[\\/]/g, pathApi.sep);
        const candidate = pathApi.isAbsolute(normalizedTarget)
            ? normalizedTarget
            : pathApi.resolve(pathApi.dirname(wrapperPath), normalizedTarget);
        if (deps.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}
function resolveWindowsClaudeExecutablePath(configuredPath, deps) {
    const pathApi = getPathApi(deps.platform);
    const extension = pathApi.extname(configuredPath).toLowerCase();
    const explicitPath = isPathLike(configuredPath) || pathApi.isAbsolute(configuredPath);
    if (CLAUDE_SCRIPT_EXTENSIONS.has(extension)) {
        return configuredPath;
    }
    if (explicitPath && extension === '.exe') {
        return configuredPath;
    }
    if (explicitPath) {
        return resolveClaudeWrapperBinary(configuredPath, deps) ?? configuredPath;
    }
    try {
        const stdout = deps.execFileSync('where.exe', [configuredPath], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            windowsHide: true,
        });
        const candidates = stdout
            .split(/\r?\n/)
            .map((entry) => entry.trim())
            .filter(Boolean);
        for (const candidate of candidates) {
            if (pathApi.extname(candidate).toLowerCase() === '.exe') {
                return candidate;
            }
        }
        for (const candidate of candidates) {
            const resolved = resolveClaudeWrapperBinary(candidate, deps);
            if (resolved) {
                return resolved;
            }
        }
    }
    catch {
        return configuredPath;
    }
    return configuredPath;
}
export function resolveClaudeCodeExecutablePath(configuredPath = process.env.CLAUDE_CLI_PATH, dependencies = {}) {
    const deps = {
        execFileSync: dependencies.execFileSync ?? execFileSync,
        existsSync: dependencies.existsSync ?? fs.existsSync,
        platform: dependencies.platform ?? process.platform,
        readFileSync: dependencies.readFileSync ?? fs.readFileSync,
    };
    const normalizedPath = stripWrappingQuotes(configuredPath || DEFAULT_CLAUDE_COMMAND);
    if (deps.platform !== 'win32') {
        return normalizedPath;
    }
    return resolveWindowsClaudeExecutablePath(normalizedPath, deps);
}
//# sourceMappingURL=claude-cli-path.js.map