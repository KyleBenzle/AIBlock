import { OllamaProvider } from './ollama';
import { OpenAICompatibleProvider } from './openai-compatible';
import { createOpenAI, createXai } from './openai';
import type { Provider, ProviderConfig } from './types';

export function createProvider(cfg: ProviderConfig, f?: typeof fetch): Provider {
  switch (cfg.provider) {
    case 'openai':
      return createOpenAI(cfg, f);
    case 'xai':
      return createXai(cfg, f);
    case 'ollama':
      return new OllamaProvider(cfg, f);
    default:
      return new OpenAICompatibleProvider(cfg, 'json_object', f);
  }
}
