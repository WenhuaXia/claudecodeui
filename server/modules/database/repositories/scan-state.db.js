import { getConnection } from '../../../modules/database/connection.js';
export const scanStateDb = {
    getLastScannedAt() {
        const db = getConnection();
        const row = db
            .prepare(`SELECT last_scanned_at FROM scan_state WHERE id = 1`)
            .get();
        if (!row) {
            return null; // Before any scan, the row is undefined.
        }
        let lastScannedDate = null;
        const lastScannedStr = row.last_scanned_at;
        if (lastScannedStr) {
            // SQLite CURRENT_TIMESTAMP returns UTC in "YYYY-MM-DD HH:MM:SS" format.
            // Replace space with 'T' and append 'Z' to parse reliably in JS across all platforms.
            lastScannedDate = new Date(lastScannedStr.replace(' ', 'T') + 'Z');
        }
        return lastScannedDate;
    },
    updateLastScannedAt(scannedAt = new Date()) {
        const db = getConnection();
        const sqliteTimestamp = scannedAt.toISOString().slice(0, 19).replace('T', ' ');
        db.prepare(`
            INSERT INTO scan_state (id, last_scanned_at)
            VALUES (1, ?)
            ON CONFLICT (id)
            DO UPDATE SET last_scanned_at = excluded.last_scanned_at
        `).run(sqliteTimestamp);
    }
};
//# sourceMappingURL=scan-state.db.js.map