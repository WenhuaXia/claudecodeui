import os from 'node:os';
import path from 'node:path';
import { SkillsProvider } from '../../../../modules/providers/shared/skills/skills.provider.js';
import { addUniqueProviderSkillSource, findTopmostGitRoot, } from '../../../../shared/utils.js';
export class CodexSkillsProvider extends SkillsProvider {
    constructor() {
        super('codex');
    }
    async getSkillSources(workspacePath) {
        const sources = [];
        const seenRootDirs = new Set();
        const repoRoot = await findTopmostGitRoot(workspacePath);
        addUniqueProviderSkillSource(sources, seenRootDirs, {
            scope: 'repo',
            rootDir: path.join(workspacePath, '.agents', 'skills'),
            commandPrefix: '$',
        });
        if (repoRoot) {
            // Codex checks repository skills at the launch folder, one folder above it,
            // and the topmost git root; these can collapse to the same directory.
            addUniqueProviderSkillSource(sources, seenRootDirs, {
                scope: 'repo',
                rootDir: path.join(path.dirname(workspacePath), '.agents', 'skills'),
                commandPrefix: '$',
            });
            addUniqueProviderSkillSource(sources, seenRootDirs, {
                scope: 'repo',
                rootDir: path.join(repoRoot, '.agents', 'skills'),
                commandPrefix: '$',
            });
        }
        addUniqueProviderSkillSource(sources, seenRootDirs, {
            scope: 'user',
            rootDir: path.join(os.homedir(), '.agents', 'skills'),
            commandPrefix: '$',
        });
        addUniqueProviderSkillSource(sources, seenRootDirs, {
            scope: 'admin',
            rootDir: path.join('/etc', 'codex', 'skills'),
            commandPrefix: '$',
        });
        addUniqueProviderSkillSource(sources, seenRootDirs, {
            scope: 'system',
            rootDir: path.join(os.homedir(), '.codex', 'skills', '.system'),
            commandPrefix: '$',
        });
        return sources;
    }
    async getGlobalSkillSource() {
        return {
            scope: 'user',
            rootDir: path.join(os.homedir(), '.agents', 'skills'),
            commandPrefix: '$',
        };
    }
}
//# sourceMappingURL=codex-skills.provider.js.map