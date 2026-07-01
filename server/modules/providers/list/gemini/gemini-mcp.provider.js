import os from 'node:os';
import path from 'node:path';
import { McpProvider } from '../../../../modules/providers/shared/mcp/mcp.provider.js';
import { AppError, readJsonConfig, readObjectRecord, readOptionalString, readStringArray, readStringRecord, writeJsonConfig, } from '../../../../shared/utils.js';
export class GeminiMcpProvider extends McpProvider {
    constructor() {
        super('gemini', ['user', 'project'], ['stdio', 'http', 'sse']);
    }
    async readScopedServers(scope, workspacePath) {
        const filePath = scope === 'user'
            ? path.join(os.homedir(), '.gemini', 'settings.json')
            : path.join(workspacePath, '.gemini', 'settings.json');
        const config = await readJsonConfig(filePath);
        return readObjectRecord(config.mcpServers) ?? {};
    }
    async writeScopedServers(scope, workspacePath, servers) {
        const filePath = scope === 'user'
            ? path.join(os.homedir(), '.gemini', 'settings.json')
            : path.join(workspacePath, '.gemini', 'settings.json');
        const config = await readJsonConfig(filePath);
        config.mcpServers = servers;
        await writeJsonConfig(filePath, config);
    }
    buildServerConfig(input) {
        if (input.transport === 'stdio') {
            if (!input.command?.trim()) {
                throw new AppError('command is required for stdio MCP servers.', {
                    code: 'MCP_COMMAND_REQUIRED',
                    statusCode: 400,
                });
            }
            return {
                command: input.command,
                args: input.args ?? [],
                env: input.env ?? {},
                cwd: input.cwd,
            };
        }
        if (!input.url?.trim()) {
            throw new AppError('url is required for http/sse MCP servers.', {
                code: 'MCP_URL_REQUIRED',
                statusCode: 400,
            });
        }
        return {
            type: input.transport,
            url: input.url,
            headers: input.headers ?? {},
        };
    }
    normalizeServerConfig(scope, name, rawConfig) {
        if (!rawConfig || typeof rawConfig !== 'object') {
            return null;
        }
        const config = rawConfig;
        if (typeof config.command === 'string') {
            return {
                provider: 'gemini',
                name,
                scope,
                transport: 'stdio',
                command: config.command,
                args: readStringArray(config.args),
                env: readStringRecord(config.env),
                cwd: readOptionalString(config.cwd),
            };
        }
        if (typeof config.url === 'string') {
            const transport = readOptionalString(config.type) === 'sse' ? 'sse' : 'http';
            return {
                provider: 'gemini',
                name,
                scope,
                transport,
                url: config.url,
                headers: readStringRecord(config.headers),
            };
        }
        return null;
    }
}
//# sourceMappingURL=gemini-mcp.provider.js.map