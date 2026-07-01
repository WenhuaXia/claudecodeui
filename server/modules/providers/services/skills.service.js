import { providerRegistry } from '../../../modules/providers/provider.registry.js';
export const providerSkillsService = {
    /**
     * Lists normalized skills visible to one provider.
     */
    async listProviderSkills(providerName, options) {
        const provider = providerRegistry.resolveProvider(providerName);
        return provider.skills.listSkills(options);
    },
    /**
     * Writes one or more global skills for one provider.
     */
    async addProviderSkills(providerName, input) {
        const provider = providerRegistry.resolveProvider(providerName);
        return provider.skills.addSkills(input);
    },
    async removeProviderSkill(providerName, input) {
        const provider = providerRegistry.resolveProvider(providerName);
        return provider.skills.removeSkill(input);
    },
};
//# sourceMappingURL=skills.service.js.map