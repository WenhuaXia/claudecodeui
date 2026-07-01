import { AbstractProvider } from '../../../../modules/providers/shared/base/abstract.provider.js';
import { GeminiProviderAuth } from '../../../../modules/providers/list/gemini/gemini-auth.provider.js';
import { GeminiProviderModels } from '../../../../modules/providers/list/gemini/gemini-models.provider.js';
import { GeminiMcpProvider } from '../../../../modules/providers/list/gemini/gemini-mcp.provider.js';
import { GeminiSessionSynchronizer } from '../../../../modules/providers/list/gemini/gemini-session-synchronizer.provider.js';
import { GeminiSessionsProvider } from '../../../../modules/providers/list/gemini/gemini-sessions.provider.js';
import { GeminiSkillsProvider } from '../../../../modules/providers/list/gemini/gemini-skills.provider.js';
export class GeminiProvider extends AbstractProvider {
    models = new GeminiProviderModels();
    mcp = new GeminiMcpProvider();
    auth = new GeminiProviderAuth();
    skills = new GeminiSkillsProvider();
    sessions = new GeminiSessionsProvider();
    sessionSynchronizer = new GeminiSessionSynchronizer();
    constructor() {
        super('gemini');
    }
}
//# sourceMappingURL=gemini.provider.js.map