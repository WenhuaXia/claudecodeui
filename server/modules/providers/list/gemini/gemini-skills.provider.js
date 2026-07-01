import os from 'node:os';
import path from 'node:path';
import { SkillsProvider } from '../../../../modules/providers/shared/skills/skills.provider.js';
export class GeminiSkillsProvider extends SkillsProvider {
    constructor() {
        super('gemini');
    }
    async getSkillSources(workspacePath) {
        return [
            {
                scope: 'user',
                rootDir: path.join(os.homedir(), '.gemini', 'skills'),
                commandPrefix: '/',
            },
            {
                scope: 'user',
                rootDir: path.join(os.homedir(), '.agents', 'skills'),
                commandPrefix: '/',
            },
            {
                scope: 'project',
                rootDir: path.join(workspacePath, '.gemini', 'skills'),
                commandPrefix: '/',
            },
            {
                scope: 'project',
                rootDir: path.join(workspacePath, '.agents', 'skills'),
                commandPrefix: '/',
            },
        ];
    }
    async getGlobalSkillSource() {
        return {
            scope: 'user',
            rootDir: path.join(os.homedir(), '.gemini', 'skills'),
            commandPrefix: '/',
        };
    }
}
//# sourceMappingURL=gemini-skills.provider.js.map