/**
 * VAPID keys repository.
 *
 * Stores and retrieves the Web Push VAPID key pair.
 */
import { getConnection } from '../../../modules/database/connection.js';
export const vapidKeysDb = {
    /** Returns the latest stored VAPID key pair, or null when unset. */
    getVapidKeys() {
        const db = getConnection();
        const row = db
            .prepare('SELECT public_key, private_key FROM vapid_keys ORDER BY id DESC LIMIT 1')
            .get();
        if (!row)
            return null;
        return {
            publicKey: row.public_key,
            privateKey: row.private_key,
        };
    },
    /** Persists a new VAPID key pair. */
    createVapidKeys(publicKey, privateKey) {
        const db = getConnection();
        db.prepare('INSERT INTO vapid_keys (public_key, private_key) VALUES (?, ?)').run(publicKey, privateKey);
    },
    /** Replaces all existing keys with a fresh pair. */
    updateVapidKeys(publicKey, privateKey) {
        const db = getConnection();
        db.prepare('DELETE FROM vapid_keys').run();
        vapidKeysDb.createVapidKeys(publicKey, privateKey);
    },
    /** Deletes all VAPID key rows. */
    deleteVapidKeys() {
        const db = getConnection();
        db.prepare('DELETE FROM vapid_keys').run();
    },
};
//# sourceMappingURL=vapid-keys.js.map