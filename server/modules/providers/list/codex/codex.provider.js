import { AbstractProvider } from '../../../../modules/providers/shared/base/abstract.provider.js';
import { CodexProviderAuth } from '../../../../modules/providers/list/codex/codex-auth.provider.js';
import { CodexProviderModels } from '../../../../modules/providers/list/codex/codex-models.provider.js';
import { CodexMcpProvider } from '../../../../modules/providers/list/codex/codex-mcp.provider.js';
import { CodexSessionSynchronizer } from '../../../../modules/providers/list/codex/codex-session-synchronizer.provider.js';
import { CodexSessionsProvider } from '../../../../modules/providers/list/codex/codex-sessions.provider.js';
import { CodexSkillsProvider } from '../../../../modules/providers/list/codex/codex-skills.provider.js';
export class CodexProvider extends AbstractProvider {
    models = new CodexProviderModels();
    mcp = new CodexMcpProvider();
    auth = new CodexProviderAuth();
    skills = new CodexSkillsProvider();
    sessions = new CodexSessionsProvider();
    sessionSynchronizer = new CodexSessionSynchronizer();
    constructor() {
        super('codex');
    }
}
//# sourceMappingURL=codex.provider.js.map