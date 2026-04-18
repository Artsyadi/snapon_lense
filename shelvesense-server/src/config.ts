import path from 'path';
import 'dotenv/config';

function readNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const ttsEngineRaw = (process.env.TTS_ENGINE ?? 'auto').toLowerCase();
const ttsEngine: 'auto' | 'openai' | 'edge' =
  ttsEngineRaw === 'openai' || ttsEngineRaw === 'edge' || ttsEngineRaw === 'auto' ? ttsEngineRaw : 'auto';

const aiEngineRaw = (process.env.AI_ENGINE ?? 'auto').toLowerCase();
const aiEngine: 'auto' | 'openai' | 'mock' =
  aiEngineRaw === 'openai' || aiEngineRaw === 'mock' || aiEngineRaw === 'auto' ? aiEngineRaw : 'auto';

export const config = {
  port: readNumber('PORT', 8787),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigins: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? null,

  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    visionModel: process.env.OPENAI_VISION_MODEL ?? 'gpt-4o',
    textModel: process.env.OPENAI_TEXT_MODEL ?? 'gpt-4o-mini',
    ttsModel: process.env.OPENAI_TTS_MODEL ?? 'tts-1',
    ttsVoice: process.env.OPENAI_TTS_VOICE ?? 'alloy',
  },

  /**
   * Speech synthesis for `/api/speech`.
   * - `auto`: OpenAI TTS if OPENAI_API_KEY is set, otherwise free Edge TTS (edge-tts package).
   * - `openai`: require API key.
   * - `edge`: always use Edge TTS (no OpenAI key needed for speech).
   */
  ttsEngine,
  ttsEdgeVoice: process.env.TTS_EDGE_VOICE ?? 'en-US-AriaNeural',

  /**
   * Multimodal AI provider selection.
   * - `auto`: OpenAI when OPENAI_API_KEY is set, else built-in MockAiProvider (offline heuristics).
   * - `openai`: require API key.
   * - `mock`: always offline heuristics (CI / beginner laptops).
   */
  aiEngine,

  /** SQLite path for session cart + profile persistence. */
  sqlitePath: process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data', 'shelvesense.db'),

  /** Set false to force in-memory sessions only (no disk). */
  sqliteEnabled: (process.env.SQLITE_ENABLED ?? 'true').toLowerCase() !== 'false',

  ocrEnabled: (process.env.OCR_ENABLED ?? 'true').toLowerCase() !== 'false',

  /** When true, run retail-friendly sharp resize/normalize before tesseract (recommended for real shelves). */
  ocrPreprocess: (process.env.OCR_PREPROCESS ?? 'true').toLowerCase() !== 'false',

  ai: {
    maxRetries: readNumber('SHELFSENSE_AI_MAX_RETRIES', 4),
    initialBackoffMs: readNumber('SHELFSENSE_AI_BACKOFF_MS', 400),
    maxBackoffMs: readNumber('SHELFSENSE_AI_MAX_BACKOFF_MS', 8000),
    requestTimeoutMs: readNumber('SHELFSENSE_AI_TIMEOUT_MS', 120000),
  },

  upload: {
    maxImageBytes: readNumber('SHELFSENSE_MAX_IMAGE_BYTES', 12 * 1024 * 1024),
  },
};

export function useOpenAiForServerTts(): boolean {
  if (config.ttsEngine === 'openai') return true;
  if (config.ttsEngine === 'edge') return false;
  return Boolean(config.openai.apiKey);
}

export function assertOpenAiConfigured(): void {
  if (!config.openai.apiKey) {
    const err = new Error('OPENAI_API_KEY is not set');
    (err as Error & { status?: number }).status = 503;
    throw err;
  }
}
