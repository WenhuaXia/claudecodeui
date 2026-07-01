import { WS_OPEN_STATE } from '../../../modules/websocket/services/websocket-state.service.js';
/**
 * Thin transport adapter that gives WebSocket connections the same interface as
 * SSE writers used by API routes (`send`, `setSessionId`, `getSessionId`).
 */
export class WebSocketWriter {
    ws;
    sessionId;
    userId;
    isWebSocketWriter;
    constructor(ws, userId = null) {
        this.ws = ws;
        this.sessionId = null;
        this.userId = userId;
        this.isWebSocketWriter = true;
    }
    send(data) {
        if (this.ws.readyState === WS_OPEN_STATE) {
            this.ws.send(JSON.stringify(data));
        }
    }
    updateWebSocket(newRawWs) {
        this.ws = newRawWs;
    }
    setSessionId(sessionId) {
        this.sessionId = sessionId;
    }
    getSessionId() {
        return this.sessionId;
    }
}
//# sourceMappingURL=websocket-writer.service.js.map