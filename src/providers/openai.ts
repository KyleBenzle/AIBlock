import { OpenAICompatibleProvider } from './openai-compatible';
import type { ProviderConfig } from './types';

export const OPENAI_DEFAULTS = { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };
export const XAI_DEFAULTS = { endpoint: 'https://api.x.ai/v1', model: 'grok-3-mini' };

export const createOpenAI = (cfg: ProviderConfig, f?: typeof fetch) => new OpenAICompatibleProvider(cfg, 'json_schema', f);
/** xAI's API is OpenAI-compatible and supports structured outputs. */
export const createXai = (cfg: ProviderConfig, f?: typeof fetch) => new OpenAICompatibleProvider(cfg, 'json_schema', f);
