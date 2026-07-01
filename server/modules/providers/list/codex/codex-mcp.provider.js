import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import TOML from '@iarna/toml';
import { McpProvider } from '../../../../modules/providers/shared/mcp/mcp.provider.js';
import { AppError, readObjectRecord, readOptionalString, readStringArray, readStringRecord, } from '../../../../shared/utils.js';
const readTomlConfig = async (filePath) => {
    try {
        const content = await readFile(filePath, 'utf8');
        const parsed = TOML.parse(content);
        return readObjectRecord(parsed) ?? {};
    }
    catch (error) {
        const code = error.code;
        if (code === 'ENOENT') {
            return {};
        }
        throw error;
    }
};
const writeTomlConfig = async (filePath, data) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    const toml = TOML.stringify(data);
    await writeFile(filePath, toml, 'utf8');
};
export class CodexMcpProvider extends McpProvider {
    constructor() {
        super('codex', ['user', 'project'], ['stdio', 'http']);
    }
    async readScopedServers(scope, workspacePath) {
        const filePath = scope === 'user'
            ? path.join(os.homedir(), '.codex', 'config.toml')
            : path.join(workspacePath, '.codex', 'config.toml');
        const config = await readTomlConfig(filePath);
        return readObjectRecord(config.mcp_servers) ?? {};
    }
    async writeScopedServers(scope, workspacePath, servers) {
        const filePath = scope === 'user'
            ? path.join(os.homedir(), '.codex', 'config.toml')
            : path.join(workspacePath, '.codex', 'config.toml');
        const config = await readTomlConfig(filePath);
        config.mcp_servers = servers;
        await writeTomlConfig(filePath, config);
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
                env_vars: input.envVars ?? [],
                cwd: input.cwd,
            };
        }
        if (!input.url?.trim()) {
            throw new AppError('url is required for http MCP servers.', {
                code: 'MCP_URL_REQUIRED',
                statusCode: 400,
            });
        }
        return {
            url: input.url,
            bearer_token_env_var: input.bearerTokenEnvVar,
            http_headers: input.headers ?? {},
            env_http_headers: input.envHttpHeaders ?? {},
        };
    }
    normalizeServerConfig(scope, name, rawConfig) {
        if (!rawConfig || typeof rawConfig !== 'object') {
            return null;
        }
        const config = rawConfig;
        if (typeof config.command === 'string') {
            return {
                provider: 'codex',
                name,
                scope,
                transport: 'stdio',
                command: config.command,
                args: readStringArray(config.args),
                env: readStringRecord(config.env),
                cwd: readOptionalString(config.cwd),
                envVars: readStringArray(config.env_vars),
            };
        }
        if (typeof config.url === 'string') {
            return {
                provider: 'codex',
                name,
                scope,
                transport: 'http',
                url: config.url,
                headers: readStringRecord(config.http_headers),
                bearerTokenEnvVar: readOptionalString(config.bearer_token_env_var),
                envHttpHeaders: readStringRecord(config.env_http_headers),
            };
        }
        return null;
    }
}
//# sourceMappingURL=codex-mcp.provider.js.map