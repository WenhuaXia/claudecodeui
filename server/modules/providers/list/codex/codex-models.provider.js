import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import TOML from '@iarna/toml';
import { buildDefaultProviderCurrentActiveModel, readObjectRecord, readOptionalString, writeProviderSessionActiveModelChange, } from '../../../../shared/utils.js';
export const CODEX_FALLBACK_MODELS = {
    OPTIONS: [
        { value: 'gpt-5.5', label: 'gpt-5.5' },
        { value: 'gpt-5.4', label: 'gpt-5.4' },
        { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
        { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
        { value: 'gpt-5.2', label: 'gpt-5.2' },
    ],
    DEFAULT: 'gpt-5.4',
};
const CODEX_MODELS_CACHE_PATH = path.join(os.homedir(), '.codex', 'models_cache.json');
const CODEX_CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');
const isCodexCachedModel = (value) => {
    const record = readObjectRecord(value);
    return Boolean(record && readOptionalString(record.slug));
};
const readCodexPriority = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER);
const mapCodexModel = (model) => ({
    value: model.slug,
    label: readOptionalString(model.display_name) ?? model.slug,
    description: readOptionalString(model.description),
});
const buildCodexModelsDefinition = (models) => {
    const sortedModels = [...models]
        .filter((model) => model.visibility !== 'hidden' && model.supported_in_api !== false)
        .sort((left, right) => readCodexPriority(left.priority) - readCodexPriority(right.priority));
    const options = [];
    const seenValues = new Set();
    for (const model of sortedModels) {
        const mappedModel = mapCodexModel(model);
        if (seenValues.has(mappedModel.value)) {
            continue;
        }
        seenValues.add(mappedModel.value);
        options.push(mappedModel);
    }
    if (options.length === 0) {
        return CODEX_FALLBACK_MODELS;
    }
    return {
        OPTIONS: options,
        DEFAULT: options[0]?.value ?? CODEX_FALLBACK_MODELS.DEFAULT,
    };
};
export class CodexProviderModels {
    async getSupportedModels() {
        try {
            const raw = await readFile(CODEX_MODELS_CACHE_PATH, 'utf8');
            const parsed = readObjectRecord(JSON.parse(raw));
            const models = Array.isArray(parsed?.models)
                ? parsed.models.filter(isCodexCachedModel)
                : [];
            return buildCodexModelsDefinition(models);
        }
        catch {
            return CODEX_FALLBACK_MODELS;
        }
    }
    async getCurrentActiveModel() {
        try {
            const raw = await readFile(CODEX_CONFIG_PATH, 'utf8');
            const parsed = readObjectRecord(TOML.parse(raw));
            const model = readOptionalString(parsed?.model);
            if (!model) {
                return buildDefaultProviderCurrentActiveModel(await this.getSupportedModels());
            }
            return {
                model,
            };
        }
        catch {
            return buildDefaultProviderCurrentActiveModel(await this.getSupportedModels());
        }
    }
    async changeActiveModel(input) {
        return writeProviderSessionActiveModelChange('codex', input);
    }
}
//# sourceMappingURL=codex-models.provider.js.map