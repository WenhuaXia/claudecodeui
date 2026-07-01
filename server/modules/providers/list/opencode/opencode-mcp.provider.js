import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { McpProvider } from '../../../../modules/providers/shared/mcp/mcp.provider.js';
import { AppError, readObjectRecord, readOptionalString, readStringArray, readStringRecord, } from '../../../../shared/utils.js';
const fileExists = async (filePath) => {
    try {
        await access(filePath);
        return true;
    }
    catch {
        return false;
    }
};
/**
 * Removes JSONC comments without touching comment-like text inside strings.
 */
const stripJsonComments = (content) => {
    let output = '';
    let inString = false;
    let quote = '';
    let escaped = false;
    for (let index = 0; index < content.length; index += 1) {
        const char = content[index];
        const next = content[index + 1];
        if (inString) {
            output += char;
            if (escaped) {
                escaped = false;
            }
            else if (char === '\\') {
                escaped = true;
            }
            else if (char === quote) {
                inString = false;
                quote = '';
            }
            continue;
        }
        if (char === '"' || char === '\'') {
            inString = true;
            quote = char;
            output += char;
            continue;
        }
        if (char === '/' && next === '/') {
            while (index < content.length && content[index] !== '\n') {
                index += 1;
            }
            output += '\n';
            continue;
        }
        if (char === '/' && next === '*') {
            index += 2;
            while (index < content.length && !(content[index] === '*' && content[index + 1] === '/')) {
                index += 1;
            }
            index += 1;
            continue;
        }
        output += char;
    }
    return output;
};
const stripTrailingCommas = (content) => content.replace(/,\s*([}\]])/g, '$1');
const readOpenCodeConfig = async (filePath) => {
    try {
        const content = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(stripTrailingCommas(stripJsonComments(content)));
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
const writeOpenCodeConfig = async (filePath, data) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};
const resolveOpenCodeConfigPath = async (scope, workspacePath) => {
    const root = scope === 'user'
        ? path.join(os.homedir(), '.config', 'opencode')
        : workspacePath;
    const jsonPath = path.join(root, 'opencode.json');
    const jsoncPath = path.join(root, 'opencode.jsonc');
    if (await fileExists(jsonPath)) {
        return { filePath: jsonPath, exists: true };
    }
    if (await fileExists(jsoncPath)) {
        return { filePath: jsoncPath, exists: true };
    }
    return { filePath: jsonPath, exists: false };
};
export class OpenCodeMcpProvider extends McpProvider {
    constructor() {
        super('opencode', ['user', 'project'], ['stdio', 'http']);
    }
    async readScopedServers(scope, workspacePath) {
        const { filePath } = await resolveOpenCodeConfigPath(scope, workspacePath);
        const config = await readOpenCodeConfig(filePath);
        return readObjectRecord(config.mcp) ?? {};
    }
    async writeScopedServers(scope, workspacePath, servers) {
        const { filePath } = await resolveOpenCodeConfigPath(scope, workspacePath);
        const config = await readOpenCodeConfig(filePath);
        config.mcp = servers;
        await writeOpenCodeConfig(filePath, config);
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
                type: 'local',
                command: [input.command, ...(input.args ?? [])],
                enabled: true,
                environment: input.env ?? {},
            };
        }
        if (!input.url?.trim()) {
            throw new AppError('url is required for http MCP servers.', {
                code: 'MCP_URL_REQUIRED',
                statusCode: 400,
            });
        }
        return {
            type: 'remote',
            url: input.url,
            enabled: true,
            headers: input.headers ?? {},
        };
    }
    normalizeServerConfig(scope, name, rawConfig) {
        const config = readObjectRecord(rawConfig);
        if (!config) {
            return null;
        }
        if (config.type === 'local' || config.command !== undefined) {
            const commandParts = typeof config.command === 'string'
                ? [config.command, ...(readStringArray(config.args) ?? [])]
                : readStringArray(config.command);
            const command = commandParts?.[0];
            if (!command) {
                return null;
            }
            return {
                provider: 'opencode',
                name,
                scope,
                transport: 'stdio',
                command,
                args: commandParts.slice(1),
                env: readStringRecord(config.environment) ?? readStringRecord(config.env),
            };
        }
        if (config.type === 'remote' || typeof config.url === 'string') {
            const url = readOptionalString(config.url);
            if (!url) {
                return null;
            }
            return {
                provider: 'opencode',
                name,
                scope,
                transport: 'http',
                url,
                headers: readStringRecord(config.headers),
            };
        }
        return null;
    }
}
//# sourceMappingURL=opencode-mcp.provider.js.map