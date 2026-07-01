import { OpenCodeProviderAuth } from '../../../../modules/providers/list/opencode/opencode-auth.provider.js';
import { OpenCodeProviderModels } from '../../../../modules/providers/list/opencode/opencode-models.provider.js';
import { OpenCodeMcpProvider } from '../../../../modules/providers/list/opencode/opencode-mcp.provider.js';
import { OpenCodeSessionSynchronizer } from '../../../../modules/providers/list/opencode/opencode-session-synchronizer.provider.js';
import { OpenCodeSessionsProvider } from '../../../../modules/providers/list/opencode/opencode-sessions.provider.js';
import { OpenCodeSkillsProvider } from '../../../../modules/providers/list/opencode/opencode-skills.provider.js';
import { AbstractProvider } from '../../../../modules/providers/shared/base/abstract.provider.js';
export class OpenCodeProvider extends AbstractProvider {
    models = new OpenCodeProviderModels();
    mcp = new OpenCodeMcpProvider();
    auth = new OpenCodeProviderAuth();
    skills = new OpenCodeSkillsProvider();
    sessions = new OpenCodeSessionsProvider();
    sessionSynchronizer = new OpenCodeSessionSynchronizer();
    constructor() {
        super('opencode');
    }
}
//# sourceMappingURL=opencode.provider.js.map