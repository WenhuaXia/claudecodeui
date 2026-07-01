import { getConnection } from '../../../modules/database/connection.js';
import { projectsDb } from '../../../modules/database/repositories/projects.db.js';
import { normalizeProjectPath } from '../../../shared/utils.js';
const SESSION_ROW_COLUMNS = 'session_id, provider, provider_session_id, project_path, jsonl_path, custom_name, isArchived, created_at, updated_at';
const SQLITE_UTC_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
function normalizeTimestamp(value) {
    if (!value)
        return null;
    // SQLite CURRENT_TIMESTAMP is stored as UTC without a timezone suffix.
    // Normalize it here so every session reader returns canonical ISO strings
    // and the sidebar never interprets fresh rows as local-time "hours old".
    const normalizedValue = SQLITE_UTC_TIMESTAMP_REGEX.test(value)
        ? `${value.replace(' ', 'T')}Z`
        : value;
    const parsed = new Date(normalizedValue);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed.toISOString();
}
function normalizeSessionRow(row) {
    if (!row) {
        return row;
    }
    return {
        ...row,
        created_at: normalizeTimestamp(row.created_at) ?? row.created_at,
        updated_at: normalizeTimestamp(row.updated_at) ?? row.updated_at,
    };
}
function normalizeSessionRows(rows) {
    return rows.map((row) => normalizeSessionRow(row));
}
function normalizeProjectPathForProvider(provider, projectPath) {
    void provider;
    return normalizeProjectPath(projectPath);
}
export const sessionsDb = {
    /**
     * Upserts one session row discovered on disk by a provider synchronizer.
     *
     * The given id is the provider-native session id. Rows are keyed by
     * `provider_session_id` so a session that was first created by the app
     * (with an app-allocated `session_id`) is updated in place once its
     * transcript shows up on disk, instead of producing a duplicate row.
     */
    createSession(providerSessionId, provider, projectPath, customName, createdAt, updatedAt, jsonlPath) {
        const db = getConnection();
        const createdAtValue = normalizeTimestamp(createdAt);
        const updatedAtValue = normalizeTimestamp(updatedAt);
        const normalizedProjectPath = normalizeProjectPathForProvider(provider, projectPath);
        // First, ensure the project path is recorded in the projects table,
        // since it's a foreign key in the sessions table.
        projectsDb.createProjectPath(normalizedProjectPath);
        const existing = db
            .prepare(`SELECT session_id FROM sessions
         WHERE provider_session_id = ? AND provider = ?
         LIMIT 1`)
            .get(providerSessionId, provider);
        if (existing) {
            db.prepare(`UPDATE sessions SET
           provider = ?,
           updated_at = COALESCE(?, CURRENT_TIMESTAMP),
           project_path = ?,
           jsonl_path = ?,
           isArchived = 0,
           custom_name = COALESCE(?, custom_name)
         WHERE session_id = ?`).run(provider, updatedAtValue, normalizedProjectPath, jsonlPath ?? null, customName ?? null, existing.session_id);
            return existing.session_id;
        }
        // Sessions created outside the app (directly via the provider CLI) are
        // keyed by the provider-native id for both columns. The ON CONFLICT path
        // covers legacy rows that predate the provider_session_id mapping.
        db.prepare(`INSERT INTO sessions (session_id, provider, provider_session_id, custom_name, project_path, jsonl_path, isArchived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
       ON CONFLICT(session_id) DO UPDATE SET
         provider = excluded.provider,
         provider_session_id = excluded.provider_session_id,
         updated_at = excluded.updated_at,
         project_path = COALESCE(NULLIF(excluded.project_path, ''), sessions.project_path),
         jsonl_path = excluded.jsonl_path,
         isArchived = 0,
         custom_name = COALESCE(excluded.custom_name, sessions.custom_name)`).run(providerSessionId, provider, providerSessionId, customName ?? null, normalizedProjectPath, jsonlPath ?? null, createdAtValue, updatedAtValue);
        return providerSessionId;
    },
    /**
     * Inserts one app-allocated session row before any provider run happens.
     *
     * The session gateway uses this when the frontend starts a brand-new chat:
     * `session_id` is the stable app-facing id, while `provider_session_id`
     * stays NULL until the provider runtime announces its own id and
     * `assignProviderSessionId` records the mapping.
     */
    createAppSession(sessionId, provider, projectPath) {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPathForProvider(provider, projectPath);
        projectsDb.createProjectPath(normalizedProjectPath);
        db.prepare(`INSERT INTO sessions (session_id, provider, provider_session_id, custom_name, project_path, jsonl_path, isArchived, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, ?, NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(sessionId, provider, normalizedProjectPath);
        return sessionId;
    },
    /**
     * Records the provider-native session id for one app-allocated session.
     *
     * If the filesystem watcher indexed the provider transcript before this
     * mapping was recorded (a duplicate row keyed by the provider id exists),
     * the duplicate is merged into the app row: its transcript path and name
     * are adopted and the duplicate row is removed. Runs in a transaction so
     * the sidebar can never observe both rows at once.
     */
    assignProviderSessionId(sessionId, providerSessionId) {
        const db = getConnection();
        const merge = db.transaction(() => {
            const duplicate = db
                .prepare(`SELECT ${SESSION_ROW_COLUMNS} FROM sessions
           WHERE (session_id = ? OR provider_session_id = ?)
             AND session_id <> ?
           LIMIT 1`)
                .get(providerSessionId, providerSessionId, sessionId);
            if (duplicate) {
                db.prepare('DELETE FROM sessions WHERE session_id = ?').run(duplicate.session_id);
                db.prepare(`UPDATE sessions SET
             provider_session_id = ?,
             jsonl_path = COALESCE(jsonl_path, ?),
             custom_name = COALESCE(custom_name, ?),
             updated_at = CURRENT_TIMESTAMP
           WHERE session_id = ?`).run(providerSessionId, duplicate.jsonl_path, duplicate.custom_name, sessionId);
                return;
            }
            db.prepare(`UPDATE sessions SET
           provider_session_id = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE session_id = ?`).run(providerSessionId, sessionId);
        });
        merge();
    },
    updateSessionCustomName(sessionId, customName) {
        const db = getConnection();
        db.prepare(`UPDATE sessions
       SET custom_name = ?
       WHERE session_id = ?`).run(customName, sessionId);
    },
    getSessionById(sessionId) {
        const db = getConnection();
        const row = db
            .prepare(`SELECT ${SESSION_ROW_COLUMNS}
         FROM sessions
         WHERE session_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`)
            .get(sessionId);
        return normalizeSessionRow(row) ?? null;
    },
    /**
     * Resolves one session row through the provider-native id.
     *
     * The filesystem watcher only knows provider ids (they come from transcript
     * file names), so it uses this lookup to translate disk artifacts back to
     * the app-facing session row before broadcasting sidebar updates.
     */
    getSessionByProviderSessionId(providerSessionId) {
        const db = getConnection();
        const row = db
            .prepare(`SELECT ${SESSION_ROW_COLUMNS}
         FROM sessions
         WHERE provider_session_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`)
            .get(providerSessionId);
        return normalizeSessionRow(row) ?? null;
    },
    /**
     * Finds the newest app-created session for a project that is still waiting
     * for its provider-native id to be recorded.
     *
     * Primary intention: OpenCode can expose a new session in its shared
     * `opencode.db` before the websocket runtime reports that same provider id
     * back to our app. At that moment the sidebar already has an optimistic
     * app-owned session row, but the watcher only knows the provider-native id.
     *
     * Without this lookup, the synchronizer would insert a second row keyed by
     * the provider id, then `assignProviderSessionId()` would merge it a moment
     * later. That eventually self-heals, but on slow networks the user can still
     * briefly see two sidebar sessions for the same conversation.
     *
     * This helper lets the synchronizer claim the pending app row first, so the
     * provider id is attached before any watcher-created row exists. The result
     * is simpler than frontend dedupe and keeps the race resolved at the source.
     */
    findLatestPendingAppSession(provider, projectPath) {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPathForProvider(provider, projectPath);
        const row = db
            .prepare(`SELECT ${SESSION_ROW_COLUMNS}
         FROM sessions
         WHERE provider = ?
           AND project_path = ?
           AND provider_session_id IS NULL
           AND isArchived = 0
         ORDER BY datetime(COALESCE(updated_at, created_at)) DESC, session_id DESC
         LIMIT 1`)
            .get(provider, normalizedProjectPath);
        return normalizeSessionRow(row) ?? null;
    },
    getAllSessions() {
        const db = getConnection();
        const rows = db
            .prepare(`SELECT ${SESSION_ROW_COLUMNS}
         FROM sessions
         WHERE isArchived = 0`)
            .all();
        return normalizeSessionRows(rows);
    },
    /**
     * Archived rows are intentionally queried separately so the caller can render
     * them in a dedicated view without reintroducing them into active session lists.
     */
    getArchivedSessions() {
        const db = getConnection();
        const rows = db
            .prepare(`SELECT ${SESSION_ROW_COLUMNS}
         FROM sessions
         WHERE isArchived = 1
         ORDER BY datetime(COALESCE(updated_at, created_at)) DESC, session_id DESC`)
            .all();
        return normalizeSessionRows(rows);
    },
    getSessionsByProjectPath(projectPath) {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        const rows = db
            .prepare(`SELECT ${SESSION_ROW_COLUMNS}
         FROM sessions
         WHERE project_path = ?
           AND isArchived = 0`)
            .all(normalizedProjectPath);
        return normalizeSessionRows(rows);
    },
    /**
     * Permanent project deletion must see every session row for the path,
     * including archived ones, so their transcript files can be cleaned up.
     */
    getSessionsByProjectPathIncludingArchived(projectPath) {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        const rows = db
            .prepare(`SELECT ${SESSION_ROW_COLUMNS}
         FROM sessions
         WHERE project_path = ?`)
            .all(normalizedProjectPath);
        return normalizeSessionRows(rows);
    },
    getSessionsByProjectPathPage(projectPath, limit, offset) {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        const rows = db
            .prepare(`SELECT ${SESSION_ROW_COLUMNS}
         FROM sessions
         WHERE project_path = ?
           AND isArchived = 0
         ORDER BY datetime(COALESCE(updated_at, created_at)) DESC, session_id DESC
         LIMIT ? OFFSET ?`)
            .all(normalizedProjectPath, limit, offset);
        return normalizeSessionRows(rows);
    },
    countSessionsByProjectPath(projectPath) {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        const row = db
            .prepare(`SELECT COUNT(*) AS count
         FROM sessions
         WHERE project_path = ?
           AND isArchived = 0`)
            .get(normalizedProjectPath);
        return Number(row?.count ?? 0);
    },
    deleteSessionsByProjectPath(projectPath) {
        const db = getConnection();
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        db.prepare(`DELETE FROM sessions WHERE project_path = ?`).run(normalizedProjectPath);
    },
    getSessionName(sessionId, provider) {
        const db = getConnection();
        const row = db
            .prepare(`SELECT custom_name
         FROM sessions
         WHERE session_id = ? AND provider = ?`)
            .get(sessionId, provider);
        return row?.custom_name ?? null;
    },
    /**
     * Soft-delete and restore both use the same flag update so callers keep the
     * row, metadata, and file path intact while toggling visibility.
     */
    updateSessionIsArchived(sessionId, isArchived) {
        const db = getConnection();
        db.prepare(`UPDATE sessions
       SET isArchived = ?
       WHERE session_id = ?`).run(isArchived ? 1 : 0, sessionId);
    },
    deleteSessionById(sessionId) {
        const db = getConnection();
        return db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId).changes > 0;
    },
    /**
     * Returns all sessions that have a non-empty custom_name so the service layer
     * can sync them to the provider's history file on startup.
     */
    getSessionsWithCustomName() {
        const db = getConnection();
        return db
            .prepare(`SELECT session_id, custom_name, project_path, jsonl_path, created_at
         FROM sessions
         WHERE custom_name IS NOT NULL AND custom_name != ''
         ORDER BY updated_at DESC`)
            .all();
    },
};
//# sourceMappingURL=sessions.db.js.map