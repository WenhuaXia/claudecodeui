import { buildDefaultProviderCurrentActiveModel, writeProviderSessionActiveModelChange, } from '../../../../shared/utils.js';
export const GEMINI_FALLBACK_MODELS = {
    OPTIONS: [
        { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
        { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
        { value: 'gemma-4-31b-it', label: 'Gemma 4 31B IT' },
        { value: 'gemma-4-26b-a4b-it', label: 'Gemma 4 26B A4B IT' },
    ],
    DEFAULT: 'gemini-3-flash-preview',
};
export class GeminiProviderModels {
    async getSupportedModels() {
        return GEMINI_FALLBACK_MODELS;
    }
    async getCurrentActiveModel() {
        return buildDefaultProviderCurrentActiveModel(GEMINI_FALLBACK_MODELS);
    }
    async changeActiveModel(input) {
        return writeProviderSessionActiveModelChange('gemini', input);
    }
}
//# sourceMappingURL=gemini-models.provider.js.map