import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { providerRegistry } from '../../../modules/providers/provider.registry.js';
import { readProviderSessionActiveModelChange } from '../../../shared/utils.js';
export const PROVIDER_MODELS_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const PROVIDER_MODELS_CACHE_VERSION = 1;
const UNCACHED_PROVIDERS = new Set(['claude', 'gemini']);
const getProviderModelsCachePath = () => path.join(os.homedir(), '.cloudcli', 'provider-models-cache.json');
const toProviderModelsCacheInfo = (entry, source) => ({
    updatedAt: new Date(entry.updatedAt).toISOString(),
    expiresAt: new Date(entry.expiresAt).toISOString(),
    source,
});
const isProviderModelOption = (value) => (Boolean(value)
    && typeof value === 'object'
    && typeof value.value === 'string'
    && typeof value.label === 'string'
    && (typeof value.description === 'undefined'
        || typeof value.description === 'string'));
const isProviderModelsDefinition = (value) => (Boolean(value)
    && typeof value === 'object'
    && Array.isArray(value.OPTIONS)
    && value.OPTIONS.every(isProviderModelOption)
    && typeof value.DEFAULT === 'string');
const isProviderModelsCacheEntry = (value) => (Boolean(value)
    && typeof value === 'object'
    && typeof value.updatedAt === 'number'
    && typeof value.expiresAt === 'number'
    && isProviderModelsDefinition(value.models));
const readProviderModelsCacheFile = async (cachePath) => {
    try {
        const raw = await readFile(cachePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.version !== PROVIDER_MODELS_CACHE_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
            return null;
        }
        const entries = Object.fromEntries(Object.entries(parsed.entries).filter((entry) => isProviderModelsCacheEntry(entry[1])));
        return {
            version: PROVIDER_MODELS_CACHE_VERSION,
            entries,
        };
    }
    catch {
        return null;
    }
};
const writeProviderModelsCacheFile = async (cachePath, entries, now) => {
    const serializableEntries = Object.fromEntries([...entries.entries()].filter(([, entry]) => entry.expiresAt > now));
    const payload = {
        version: PROVIDER_MODELS_CACHE_VERSION,
        entries: serializableEntries,
    };
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};
/**
 * Provider model lookup service.
 *
 * Routes and other service callers use this layer instead of resolving provider
 * classes directly so the provider-registry dependency stays centralized in one
 * place.
 */
export const createProviderModelsService = (dependencies = {}) => {
    const resolveProvider = dependencies.resolveProvider ?? providerRegistry.resolveProvider;
    const cachePath = dependencies.cachePath ?? getProviderModelsCachePath();
    const activeModelChangesPath = dependencies.activeModelChangesPath;
    const now = dependencies.now ?? (() => Date.now());
    const memoryCache = new Map();
    const pendingRequests = new Map();
    let persistedCacheLoaded = false;
    let persistedCacheLoadPromise = null;
    const pruneExpiredMemoryEntry = (provider, currentTime, source) => {
        const cachedEntry = memoryCache.get(provider);
        if (!cachedEntry) {
            return null;
        }
        if (cachedEntry.expiresAt > currentTime) {
            return {
                models: cachedEntry.models,
                cache: toProviderModelsCacheInfo(cachedEntry, source),
            };
        }
        memoryCache.delete(provider);
        return null;
    };
    const loadPersistedCache = async () => {
        if (persistedCacheLoaded) {
            return;
        }
        if (!persistedCacheLoadPromise) {
            persistedCacheLoadPromise = (async () => {
                const cacheFile = await readProviderModelsCacheFile(cachePath);
                const currentTime = now();
                for (const [provider, entry] of Object.entries(cacheFile?.entries ?? {})) {
                    if (entry.expiresAt > currentTime) {
                        memoryCache.set(provider, entry);
                    }
                }
                persistedCacheLoaded = true;
            })().finally(() => {
                persistedCacheLoadPromise = null;
            });
        }
        await persistedCacheLoadPromise;
    };
    const persistCache = async () => {
        try {
            await writeProviderModelsCacheFile(cachePath, memoryCache, now());
        }
        catch (error) {
            console.warn('Unable to persist provider models cache:', error);
        }
    };
    const setCacheEntry = async (provider, models) => {
        const currentTime = now();
        const entry = {
            updatedAt: currentTime,
            expiresAt: currentTime + PROVIDER_MODELS_CACHE_TTL_MS,
            models,
        };
        memoryCache.set(provider, entry);
        await persistCache();
        return entry;
    };
    const loadAndCacheModels = (provider) => {
        const request = resolveProvider(provider).models.getSupportedModels()
            .then(async (models) => {
            const entry = await setCacheEntry(provider, models);
            return {
                models,
                cache: toProviderModelsCacheInfo(entry, 'fresh'),
            };
        })
            .finally(() => {
            pendingRequests.delete(provider);
        });
        pendingRequests.set(provider, request);
        return request;
    };
    const loadDirectModels = (provider) => {
        const request = resolveProvider(provider).models.getSupportedModels()
            .then((models) => {
            const currentTime = now();
            return {
                models,
                cache: {
                    updatedAt: new Date(currentTime).toISOString(),
                    expiresAt: new Date(currentTime).toISOString(),
                    source: 'fresh',
                },
            };
        })
            .finally(() => {
            pendingRequests.delete(provider);
        });
        pendingRequests.set(provider, request);
        return request;
    };
    const getProviderModels = async (provider, options = {}) => {
        if (UNCACHED_PROVIDERS.has(provider)) {
            const pendingRequest = pendingRequests.get(provider);
            if (pendingRequest) {
                return pendingRequest;
            }
            return loadDirectModels(provider);
        }
        if (options.bypassCache) {
            const pendingRequest = pendingRequests.get(provider);
            if (pendingRequest) {
                return pendingRequest;
            }
            return loadAndCacheModels(provider);
        }
        const cachedModels = pruneExpiredMemoryEntry(provider, now(), 'memory');
        if (cachedModels) {
            return cachedModels;
        }
        const pendingRequest = pendingRequests.get(provider);
        if (pendingRequest) {
            return pendingRequest;
        }
        await loadPersistedCache();
        const persistedModels = pruneExpiredMemoryEntry(provider, now(), 'disk');
        if (persistedModels) {
            return persistedModels;
        }
        const postLoadPendingRequest = pendingRequests.get(provider);
        if (postLoadPendingRequest) {
            return postLoadPendingRequest;
        }
        return loadAndCacheModels(provider);
    };
    const getCurrentActiveModel = async (provider, sessionId) => resolveProvider(provider).models.getCurrentActiveModel(sessionId);
    const changeActiveModel = async (provider, input) => resolveProvider(provider).models.changeActiveModel(input);
    const getChangedActiveModel = async (provider, sessionId) => readProviderSessionActiveModelChange(provider, sessionId, {
        filePath: activeModelChangesPath,
    });
    const resolveResumeModel = async (provider, sessionId, requestedModel) => {
        const normalizedRequestedModel = typeof requestedModel === 'string' ? requestedModel.trim() : '';
        if (!sessionId?.trim()) {
            return normalizedRequestedModel || undefined;
        }
        const changedModel = await getChangedActiveModel(provider, sessionId);
        if (changedModel.supported && changedModel.changed && changedModel.model?.trim()) {
            return changedModel.model.trim();
        }
        return normalizedRequestedModel || undefined;
    };
    const clearCache = () => {
        memoryCache.clear();
        pendingRequests.clear();
        persistedCacheLoaded = false;
        persistedCacheLoadPromise = null;
    };
    return {
        getProviderModels,
        getCurrentActiveModel,
        getChangedActiveModel,
        changeActiveModel,
        resolveResumeModel,
        clearCache,
    };
};
export const providerModelsService = createProviderModelsService();
//# sourceMappingURL=provider-models.service.js.map