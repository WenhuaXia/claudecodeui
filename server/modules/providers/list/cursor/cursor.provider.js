import { AbstractProvider } from '../../../../modules/providers/shared/base/abstract.provider.js';
import { CursorProviderAuth } from '../../../../modules/providers/list/cursor/cursor-auth.provider.js';
import { CursorProviderModels } from '../../../../modules/providers/list/cursor/cursor-models.provider.js';
import { CursorMcpProvider } from '../../../../modules/providers/list/cursor/cursor-mcp.provider.js';
import { CursorSessionSynchronizer } from '../../../../modules/providers/list/cursor/cursor-session-synchronizer.provider.js';
import { CursorSessionsProvider } from '../../../../modules/providers/list/cursor/cursor-sessions.provider.js';
import { CursorSkillsProvider } from '../../../../modules/providers/list/cursor/cursor-skills.provider.js';
export class CursorProvider extends AbstractProvider {
    models = new CursorProviderModels();
    mcp = new CursorMcpProvider();
    auth = new CursorProviderAuth();
    skills = new CursorSkillsProvider();
    sessions = new CursorSessionsProvider();
    sessionSynchronizer = new CursorSessionSynchronizer();
    constructor() {
        super('cursor');
    }
}
//# sourceMappingURL=cursor.provider.js.map