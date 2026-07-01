/**
 * Authenticates websocket upgrade requests before the `connection` handler runs.
 */
export function verifyWebSocketClient(info, dependencies) {
    const request = info.req;
    const upgradeUrl = new URL(request.url ?? '/', 'http://localhost');
    const loggedUrl = new URL(upgradeUrl);
    if (loggedUrl.searchParams.has('token')) {
        loggedUrl.searchParams.set('token', 'REDACTED');
    }
    console.log('WebSocket connection attempt to:', `${loggedUrl.pathname}${loggedUrl.search}`);
    // Platform mode: use the first DB user and skip token checks.
    if (dependencies.isPlatform) {
        const user = dependencies.authenticateWebSocket(null);
        if (!user) {
            console.log('[WARN] Platform mode: No user found in database');
            return false;
        }
        request.user = user;
        console.log('[OK] Platform mode WebSocket authenticated for user:', user.username);
        return true;
    }
    // OSS mode: read JWT from query string first, then Authorization header.
    const token = upgradeUrl.searchParams.get('token') ??
        request.headers.authorization?.split(' ')[1] ??
        null;
    const user = dependencies.authenticateWebSocket(token);
    if (!user) {
        console.log('[WARN] WebSocket authentication failed');
        return false;
    }
    request.user = user;
    console.log('[OK] WebSocket authenticated for user:', user.username);
    return true;
}
//# sourceMappingURL=websocket-auth.service.js.map