import { AbstractProvider } from '../../../../modules/providers/shared/base/abstract.provider.js';
import { ClaudeProviderAuth } from '../../../../modules/providers/list/claude/claude-auth.provider.js';
import { ClaudeProviderModels } from '../../../../modules/providers/list/claude/claude-models.provider.js';
import { ClaudeMcpProvider } from '../../../../modules/providers/list/claude/claude-mcp.provider.js';
import { ClaudeSessionSynchronizer } from '../../../../modules/providers/list/claude/claude-session-synchronizer.provider.js';
import { ClaudeSessionsProvider } from '../../../../modules/providers/list/claude/claude-sessions.provider.js';
import { ClaudeSkillsProvider } from '../../../../modules/providers/list/claude/claude-skills.provider.js';
export class ClaudeProvider extends AbstractProvider {
    models = new ClaudeProviderModels();
    mcp = new ClaudeMcpProvider();
    auth = new ClaudeProviderAuth();
    skills = new ClaudeSkillsProvider();
    sessions = new ClaudeSessionsProvider();
    sessionSynchronizer = new ClaudeSessionSynchronizer();
    constructor() {
        super('claude');
    }
}
//# sourceMappingURL=claude.provider.js.map