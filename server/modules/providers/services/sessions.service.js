import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { projectsDb, sessionsDb } from '../../../modules/database/index.js';
import { chatRunRegistry } from '../../../modules/websocket/index.js';
import { providerRegistry } from '../../../modules/providers/provider.registry.js';
import { AppError } from '../../../shared/utils.js';
/**
 * Removes one file if it exists.
 */
async function removeFileIfExists(filePath) {
    try {
        await fsp.unlink(filePath);
        return true;
    }
    catch (error) {
        const code = error.code;
        if (code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}
/**
 * Archive rows need a stable project label even when the owning project is not
 * part of the active sidebar payload. This lightweight resolver keeps the
 * archive API self-contained while still matching the project's stored display
 * name when one exists.
 */
function resolveProjectDisplayName(projectPath, customProjectName) {
    const trimmedCustomName = typeof customProjectName === 'string' ? customProjectName.trim() : '';
    if (trimmedCustomName.length > 0) {
        return trimmedCustomName;
    }
    if (!projectPath) {
        return 'Unknown Project';
    }
    return path.basename(projectPath) || projectPath;
}
/**
 * Sets the custom title for a session by appending a custom-title entry
 * to the session's JSONL file. This is what `claude -r` reads to display
 * session names.
 */
async function setSessionTitle(sessionId, title) {
    const session = sessionsDb.getSessionById(sessionId);
    if (!session?.jsonl_path)
        return;
    try {
        const entry = JSON.stringify({
            type: 'custom-title',
            customTitle: title,
            sessionId,
        });
        await fsp.appendFile(session.jsonl_path, '\n' + entry, 'utf8');
    }
    catch {
        // Session file may not exist or may be locked
    }
}
/**
 * Scans all sessions with custom_name and syncs them to their session JSONL files
 * on startup so `claude -r` displays the CloudCLI session names.
 */
async function syncAllSessionNamesToHistory() {
    const sessions = sessionsDb.getSessionsWithCustomName();
    if (sessions.length === 0)
        return;
    let synced = 0;
    for (const session of sessions) {
        if (!session.jsonl_path)
            continue;
        try {
            const content = await fsp.readFile(session.jsonl_path, 'utf8');
            const lines = content.split(/\r?\n/);
            let hasCustomTitle = false;
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                try {
                    const parsed = JSON.parse(trimmed);
                    if (typeof parsed === 'object' &&
                        parsed !== null &&
                        parsed.type === 'custom-title' &&
                        parsed.sessionId === session.session_id) {
                        hasCustomTitle = true;
                        break;
                    }
                }
                catch {
                    // skip non-JSON lines
                }
            }
            if (!hasCustomTitle) {
                const entry = JSON.stringify({
                    type: 'custom-title',
                    customTitle: session.custom_name,
                    sessionId: session.session_id,
                });
                await fsp.appendFile(session.jsonl_path, '\n' + entry, 'utf8');
                synced++;
            }
        }
        catch {
            // Session file may not exist
        }
    }
    if (synced > 0) {
        console.log(`[Sessions] Synced ${synced} session name(s) to session JSONL files`);
    }
}
/**
 * Application service for provider-backed session message operations.
 *
 * Callers pass a provider id and this service resolves the concrete provider
 * class, keeping normalization/history call sites decoupled from implementation
 * file layout.
 */
export const sessionsService = {
    /**
     * Lists provider ids that can load session history and normalize live messages.
     */
    listProviderIds() {
        return providerRegistry.listProviders().map((provider) => provider.id);
    },
    /**
     * Returns app-facing ids for provider runs that are currently processing.
     *
     * This is intentionally status-only: callers that only need sidebar activity
     * indicators should not attach to chat streams or request replayed messages.
     */
    listRunningSessions() {
        return chatRunRegistry.listRunningRuns();
    },
    /**
     * Normalizes one provider-native event into frontend session message events.
     */
    normalizeMessage(providerName, raw, sessionId, subagentPrompts = null) {
        return providerRegistry.resolveProvider(providerName).sessions.normalizeMessage(raw, sessionId, subagentPrompts);
    },
    /**
     * Allocates a stable app-facing session id before any provider run happens.
     *
     * This is the entry point of the session gateway: the frontend calls this
     * (via `POST /api/providers/sessions`) when the user starts a brand-new
     * chat, navigates to the returned id immediately, and the id never changes
     * for the lifetime of the conversation. The provider-native id is mapped to
     * this row later, when the provider runtime announces it mid-run.
     */
    createAppSession(provider, projectPath) {
        const normalizedProjectPath = projectPath.trim();
        if (!normalizedProjectPath) {
            throw new AppError('projectPath is required.', {
                code: 'PROJECT_PATH_REQUIRED',
                statusCode: 400,
            });
        }
        const sessionId = randomUUID();
        sessionsDb.createAppSession(sessionId, provider, normalizedProjectPath);
        return {
            sessionId,
            provider,
            projectPath: normalizedProjectPath,
        };
    },
    /**
     * Fetches persisted history by app session id.
     *
     * Provider and provider-specific lookup hints are resolved from the indexed
     * session metadata in the database. The provider adapter receives the
     * provider-native session id (the one written into transcripts on disk),
     * and every returned message is remapped back to the app session id so
     * provider ids never reach the frontend.
     */
    async fetchHistory(sessionId, options = {}) {
        const session = sessionsDb.getSessionById(sessionId);
        if (!session) {
            throw new AppError(`Session "${sessionId}" was not found.`, {
                code: 'SESSION_NOT_FOUND',
                statusCode: 404,
            });
        }
        // App-created sessions that never produced a provider transcript yet
        // (e.g. first message still streaming) simply have no history.
        if (!session.provider_session_id) {
            return {
                messages: [],
                total: 0,
                hasMore: false,
                offset: options.offset ?? 0,
                limit: options.limit ?? null,
            };
        }
        const provider = session.provider;
        const result = await providerRegistry.resolveProvider(provider).sessions.fetchHistory(sessionId, {
            limit: options.limit ?? null,
            offset: options.offset ?? 0,
            projectPath: session.project_path ?? '',
            providerSessionId: session.provider_session_id,
        });
        return {
            ...result,
            messages: result.messages.map((message) => ({
                ...message,
                sessionId,
            })),
        };
    },
    /**
     * Returns archived sessions with enough project metadata for the sidebar to
     * group, filter, open, and restore them without a per-row follow-up query.
     */
    listArchivedSessions() {
        const archivedSessions = sessionsDb.getArchivedSessions();
        const projectCache = new Map();
        return archivedSessions.map((session) => {
            const projectPath = session.project_path?.trim() ? session.project_path : null;
            let project = null;
            if (projectPath) {
                if (!projectCache.has(projectPath)) {
                    projectCache.set(projectPath, projectsDb.getProjectPath(projectPath));
                }
                project = projectCache.get(projectPath) ?? null;
            }
            return {
                sessionId: session.session_id,
                provider: session.provider,
                projectId: project?.project_id ?? null,
                projectPath,
                projectDisplayName: resolveProjectDisplayName(projectPath, project?.custom_project_name),
                sessionTitle: session.custom_name?.trim() || session.session_id,
                createdAt: session.created_at ?? null,
                updatedAt: session.updated_at ?? null,
                lastActivity: session.updated_at ?? session.created_at ?? null,
                isProjectArchived: Boolean(project?.isArchived),
            };
        });
    },
    /**
     * Archives or permanently deletes one persisted session row by id.
     *
     * Soft-delete mirrors the project behavior by toggling `isArchived` so the
     * row disappears from active lists but remains restorable. Force-delete
     * optionally removes the transcript file before deleting the database row.
     */
    async deleteOrArchiveSessionById(sessionId, options = {}) {
        const session = sessionsDb.getSessionById(sessionId);
        if (!session) {
            throw new AppError(`Session "${sessionId}" was not found.`, {
                code: 'SESSION_NOT_FOUND',
                statusCode: 404,
            });
        }
        if (!options.force) {
            sessionsDb.updateSessionIsArchived(sessionId, true);
            return {
                sessionId,
                action: 'archived',
                deletedFromDisk: false,
            };
        }
        let removedFromDisk = false;
        if (options.deletedFromDisk && session.jsonl_path) {
            removedFromDisk = await removeFileIfExists(session.jsonl_path);
        }
        const deleted = sessionsDb.deleteSessionById(sessionId);
        if (!deleted) {
            throw new AppError(`Session "${sessionId}" was not found.`, {
                code: 'SESSION_NOT_FOUND',
                statusCode: 404,
            });
        }
        return {
            sessionId,
            action: 'deleted',
            deletedFromDisk: removedFromDisk,
        };
    },
    /**
     * Restores one archived session back into the active sidebar lists.
     */
    restoreSessionById(sessionId) {
        const session = sessionsDb.getSessionById(sessionId);
        if (!session) {
            throw new AppError(`Session "${sessionId}" was not found.`, {
                code: 'SESSION_NOT_FOUND',
                statusCode: 404,
            });
        }
        sessionsDb.updateSessionIsArchived(sessionId, false);
        return { sessionId, isArchived: false };
    },
    /**
     * Renames one session by id and syncs the name to the provider's history file.
     */
    async renameSessionById(sessionId, summary) {
        const session = sessionsDb.getSessionById(sessionId);
        if (!session) {
            throw new AppError(`Session "${sessionId}" was not found.`, {
                code: 'SESSION_NOT_FOUND',
                statusCode: 404,
            });
        }
        sessionsDb.updateSessionCustomName(sessionId, summary);
        void setSessionTitle(sessionId, summary);
        return { sessionId, summary };
    },
    /**
     * Scans all indexed sessions with custom_name and syncs them to their
     * session JSONL files so `claude -r` displays the CloudCLI session names.
     * Runs once at startup to keep existing sessions in sync.
     */
    async syncSessionNames() {
        await syncAllSessionNamesToHistory();
    },
};
//# sourceMappingURL=sessions.service.js.map