import { providerRegistry } from '../../../modules/providers/provider.registry.js';
export const providerAuthService = {
    /**
     * Resolves a provider and returns its installation/authentication status.
     */
    async getProviderAuthStatus(providerName) {
        const provider = providerRegistry.resolveProvider(providerName);
        return provider.auth.getStatus();
    },
    /**
     * Returns whether a provider runtime appears installed.
     * Falls back to true if status lookup itself fails so callers preserve the
     * original runtime error instead of replacing it with a status-check failure.
     */
    async isProviderInstalled(providerName) {
        try {
            const status = await this.getProviderAuthStatus(providerName);
            return status.installed;
        }
        catch {
            return true;
        }
    },
};
//# sourceMappingURL=provider-auth.service.js.map