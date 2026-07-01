import os from 'node:os';
import path from 'node:path';
import { SkillsProvider } from '../../../../modules/providers/shared/skills/skills.provider.js';
export class CursorSkillsProvider extends SkillsProvider {
    constructor() {
        super('cursor');
    }
    async getSkillSources(workspacePath) {
        return [
            {
                scope: 'project',
                rootDir: path.join(workspacePath, '.agents', 'skills'),
                commandPrefix: '/',
            },
            {
                scope: 'project',
                rootDir: path.join(workspacePath, '.cursor', 'skills'),
                commandPrefix: '/',
            },
            {
                scope: 'user',
                rootDir: path.join(os.homedir(), '.cursor', 'skills'),
                commandPrefix: '/',
            },
        ];
    }
    async getGlobalSkillSource() {
        return {
            scope: 'user',
            rootDir: path.join(os.homedir(), '.cursor', 'skills'),
            commandPrefix: '/',
        };
    }
}
//# sourceMappingURL=cursor-skills.provider.js.map