/**
 * Push subscriptions repository.
 *
 * Persists browser push subscription endpoints and keys per user.
 */
import { getConnection } from '../../../modules/database/connection.js';
export const pushSubscriptionsDb = {
    /** Upserts a push subscription endpoint for a user. */
    createPushSubscription(userId, endpoint, keysP256dh, keysAuth) {
        const db = getConnection();
        db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         keys_p256dh = excluded.keys_p256dh,
         keys_auth = excluded.keys_auth`).run(userId, endpoint, keysP256dh, keysAuth);
    },
    /** Returns all subscriptions for a user. */
    getPushSubscriptions(userId) {
        const db = getConnection();
        return db
            .prepare('SELECT endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE user_id = ?')
            .all(userId);
    },
    /** Deletes one subscription by endpoint. */
    deletePushSubscription(endpoint) {
        const db = getConnection();
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
    },
    /** Deletes all subscriptions for a user. */
    deletePushSubscriptionsForUser(userId) {
        const db = getConnection();
        db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(userId);
    },
    // Legacy aliases used by existing services/routes
    saveSubscription(userId, endpoint, keysP256dh, keysAuth) {
        pushSubscriptionsDb.createPushSubscription(userId, endpoint, keysP256dh, keysAuth);
    },
    getSubscriptions(userId) {
        return pushSubscriptionsDb.getPushSubscriptions(userId);
    },
    removeSubscription(endpoint) {
        pushSubscriptionsDb.deletePushSubscription(endpoint);
    },
    removeAllForUser(userId) {
        pushSubscriptionsDb.deletePushSubscriptionsForUser(userId);
    },
};
//# sourceMappingURL=push-subscriptions.js.map