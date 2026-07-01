/**
 * The capability matrix mirrors what each runtime actually implements today:
 * - permission modes match the option sets accepted by each CLI/SDK.
 * - only the Claude SDK integration surfaces interactive permission requests.
 * - Cursor has no token usage endpoint support (its store.db has no usage rows).
 */
const PROVIDER_CAPABILITIES = {
    claude: {
        provider: 'claude',
        permissionModes: ['default', 'auto', 'acceptEdits', 'bypassPermissions', 'plan'],
        defaultPermissionMode: 'default',
        supportsImages: true,
        supportsAbort: true,
        supportsPermissionRequests: true,
        supportsTokenUsage: true,
    },
    cursor: {
        provider: 'cursor',
        permissionModes: ['default', 'acceptEdits', 'bypassPermissions', 'plan'],
        defaultPermissionMode: 'default',
        supportsImages: false,
        supportsAbort: true,
        supportsPermissionRequests: false,
        supportsTokenUsage: false,
    },
    codex: {
        provider: 'codex',
        permissionModes: ['default', 'acceptEdits', 'bypassPermissions'],
        defaultPermissionMode: 'default',
        supportsImages: false,
        supportsAbort: true,
        supportsPermissionRequests: false,
        supportsTokenUsage: true,
    },
    gemini: {
        provider: 'gemini',
        permissionModes: ['default', 'acceptEdits', 'bypassPermissions', 'plan'],
        defaultPermissionMode: 'default',
        supportsImages: false,
        supportsAbort: true,
        supportsPermissionRequests: false,
        supportsTokenUsage: true,
    },
    opencode: {
        provider: 'opencode',
        permissionModes: ['default'],
        defaultPermissionMode: 'default',
        supportsImages: false,
        supportsAbort: true,
        supportsPermissionRequests: false,
        supportsTokenUsage: true,
    },
};
/**
 * Application service exposing the provider capability matrix.
 */
export const providerCapabilitiesService = {
    getProviderCapabilities(provider) {
        return PROVIDER_CAPABILITIES[provider];
    },
    listAllProviderCapabilities() {
        return Object.values(PROVIDER_CAPABILITIES);
    },
};
//# sourceMappingURL=provider-capabilities.service.js.map