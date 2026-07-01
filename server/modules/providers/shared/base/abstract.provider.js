/**
 * Shared provider base.
 *
 * Concrete providers must expose auth/MCP handlers and implement message
 * normalization/history loading because those behaviors depend on native
 * SDK/CLI formats.
 */
export class AbstractProvider {
    id;
    constructor(id) {
        this.id = id;
    }
}
//# sourceMappingURL=abstract.provider.js.map