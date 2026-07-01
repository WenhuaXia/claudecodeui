import { providerRegistry } from '../../../modules/providers/provider.registry.js';
import { AppError } from '../../../shared/utils.js';
export const providerMcpService = {
    /**
     * Lists MCP servers for one provider grouped by supported scopes.
     */
    async listProviderMcpServers(providerName, options) {
        const provider = providerRegistry.resolveProvider(providerName);
        return provider.mcp.listServers(options);
    },
    /**
     * Lists MCP servers for one provider scope.
     */
    async listProviderMcpServersForScope(providerName, scope, options) {
        const provider = providerRegistry.resolveProvider(providerName);
        return provider.mcp.listServersForScope(scope, options);
    },
    /**
     * Adds or updates one provider MCP server.
     */
    async upsertProviderMcpServer(providerName, input) {
        const provider = providerRegistry.resolveProvider(providerName);
        return provider.mcp.upsertServer(input);
    },
    /**
     * Removes one provider MCP server.
     */
    async removeProviderMcpServer(providerName, input) {
        const provider = providerRegistry.resolveProvider(providerName);
        return provider.mcp.removeServer(input);
    },
    /**
     * Adds one HTTP/stdio MCP server to every provider.
     */
    async addMcpServerToAllProviders(input) {
        if (input.transport !== 'stdio' && input.transport !== 'http') {
            throw new AppError('Global MCP add supports only "stdio" and "http".', {
                code: 'INVALID_GLOBAL_MCP_TRANSPORT',
                statusCode: 400,
            });
        }
        const scope = input.scope ?? 'project';
        const results = [];
        const providers = providerRegistry.listProviders();
        for (const provider of providers) {
            try {
                await provider.mcp.upsertServer({ ...input, scope });
                results.push({ provider: provider.id, created: true });
            }
            catch (error) {
                results.push({
                    provider: provider.id,
                    created: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
        return results;
    },
    /**
     * Removes one MCP server from every provider. Mirrors `addMcpServerToAllProviders`
     * by iterating the live provider registry, so callers stay in sync with which
     * providers exist instead of maintaining their own provider list.
     */
    async removeMcpServerFromAllProviders(input) {
        const results = [];
        const providers = providerRegistry.listProviders();
        for (const provider of providers) {
            try {
                const result = await provider.mcp.removeServer(input);
                results.push({ provider: provider.id, removed: result.removed });
            }
            catch (error) {
                results.push({
                    provider: provider.id,
                    removed: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
        return results;
    },
};
//# sourceMappingURL=mcp.service.js.map