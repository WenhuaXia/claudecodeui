import os from 'node:os';
import path from 'node:path';
import { McpProvider } from '../../../../modules/providers/shared/mcp/mcp.provider.js';
import { AppError, readJsonConfig, readObjectRecord, readOptionalString, readStringArray, readStringRecord, writeJsonConfig, } from '../../../../shared/utils.js';
export class ClaudeMcpProvider extends McpProvider {
    constructor() {
        super('claude', ['user', 'local', 'project'], ['stdio', 'http', 'sse']);
    }
    async readScopedServers(scope, workspacePath) {
        if (scope === 'project') {
            const filePath = path.join(workspacePath, '.mcp.json');
            const config = await readJsonConfig(filePath);
            return readObjectRecord(config.mcpServers) ?? {};
        }
        const filePath = path.join(os.homedir(), '.claude.json');
        const config = await readJsonConfig(filePath);
        if (scope === 'user') {
            return readObjectRecord(config.mcpServers) ?? {};
        }
        const projects = readObjectRecord(config.projects) ?? {};
        const projectConfig = readObjectRecord(projects[workspacePath]) ?? {};
        return readObjectRecord(projectConfig.mcpServers) ?? {};
    }
    async writeScopedServers(scope, workspacePath, servers) {
        if (scope === 'project') {
            const filePath = path.join(workspacePath, '.mcp.json');
            const config = await readJsonConfig(filePath);
            config.mcpServers = servers;
            await writeJsonConfig(filePath, config);
            return;
        }
        const filePath = path.join(os.homedir(), '.claude.json');
        const config = await readJsonConfig(filePath);
        if (scope === 'user') {
            config.mcpServers = servers;
            await writeJsonConfig(filePath, config);
            return;
        }
        const projects = readObjectRecord(config.projects) ?? {};
        const projectConfig = readObjectRecord(projects[workspacePath]) ?? {};
        projectConfig.mcpServers = servers;
        projects[workspacePath] = projectConfig;
        config.projects = projects;
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
                type: 'stdio',
                command: input.command,
                args: input.args ?? [],
                env: input.env ?? {},
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
                provider: 'claude',
                name,
                scope,
                transport: 'stdio',
                command: config.command,
                args: readStringArray(config.args),
                env: readStringRecord(config.env),
            };
        }
        if (typeof config.url === 'string') {
            const transport = readOptionalString(config.type) === 'sse' ? 'sse' : 'http';
            return {
                provider: 'claude',
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
//# sourceMappingURL=claude-mcp.provider.js.map