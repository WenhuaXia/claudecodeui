import { notificationChannelEndpointsDb } from '../../../modules/database/index.js';
const DESKTOP_CHANNEL = 'desktop';
const clientsByUserId = new Map();
const clientBySocket = new WeakMap();
function normalizeUserId(userId) {
    const numeric = Number(userId);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}
function normalizeEndpointId(endpointId) {
    if (typeof endpointId !== 'string')
        return '';
    return endpointId.trim();
}
function getUserClients(userId, create = false) {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId)
        return null;
    let clients = clientsByUserId.get(normalizedUserId);
    if (!clients && create) {
        clients = new Map();
        clientsByUserId.set(normalizedUserId, clients);
    }
    return clients || null;
}
export function registerDesktopNotificationClient({ userId, deviceId, label = null, platform = null, appVersion = null, ws, }) {
    const normalizedUserId = normalizeUserId(userId);
    const endpointId = normalizeEndpointId(deviceId);
    if (!normalizedUserId || !endpointId) {
        return false;
    }
    const endpoint = notificationChannelEndpointsDb.upsertEndpoint({
        userId: normalizedUserId,
        channel: DESKTOP_CHANNEL,
        endpointId,
        label,
        metadata: { platform, appVersion },
        enabled: true,
    });
    const clients = getUserClients(normalizedUserId, true);
    const previous = clients.get(endpointId);
    if (previous && previous !== ws && previous.readyState === previous.OPEN) {
        previous.close(4000, 'Device reconnected');
    }
    clients.set(endpointId, ws);
    clientBySocket.set(ws, { userId: normalizedUserId, endpointId });
    return endpoint;
}
export function unregisterDesktopNotificationClient(ws) {
    const registration = clientBySocket.get(ws);
    if (!registration)
        return;
    const clients = getUserClients(registration.userId);
    if (clients?.get(registration.endpointId) === ws) {
        clients.delete(registration.endpointId);
        if (clients.size === 0) {
            clientsByUserId.delete(registration.userId);
        }
    }
    clientBySocket.delete(ws);
}
export function sendDesktopNotification(userId, payload) {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId)
        return { attempted: 0, sent: 0 };
    const clients = getUserClients(normalizedUserId);
    if (!clients?.size)
        return { attempted: 0, sent: 0 };
    const enabledEndpointIds = new Set(notificationChannelEndpointsDb
        .getEnabledEndpoints(normalizedUserId, DESKTOP_CHANNEL)
        .map((endpoint) => endpoint.endpoint_id));
    const message = JSON.stringify({
        type: 'notification',
        id: typeof payload?.data?.tag === 'string' ? payload.data.tag : `${Date.now()}`,
        payload,
    });
    let attempted = 0;
    let sent = 0;
    for (const [endpointId, ws] of clients.entries()) {
        if (!enabledEndpointIds.has(endpointId))
            continue;
        attempted += 1;
        if (ws.readyState !== ws.OPEN) {
            unregisterDesktopNotificationClient(ws);
            continue;
        }
        try {
            ws.send(message);
            notificationChannelEndpointsDb.touchEndpoint(normalizedUserId, DESKTOP_CHANNEL, endpointId);
            sent += 1;
        }
        catch {
            unregisterDesktopNotificationClient(ws);
        }
    }
    return { attempted, sent };
}
//# sourceMappingURL=desktop-notification-clients.service.js.map