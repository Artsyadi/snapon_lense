import path from 'path';
import 'dotenv/config';

function readNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const ttsEngineRaw = (process.env.TTS_ENGINE ?? 'auto').toLowerCase();
const ttsEngine: 'edge' | 'off' = ttsEngineRaw === 'off' ? 'off' : 'edge';

const aiEngineRaw = (process.env.AI_ENGINE ?? 'claude').toLowerCase();
const aiEngine: 'claude' | 'mock' = aiEngineRaw === 'mock' ? 'mock' : 'claude';

export const config = {
  port: readNumber('PORT', 8787),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigins: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? null,

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
  },

  /** Speech synthesis for `/api/speech` (`edge` default, `off` for text-only fallback). */
  ttsEngine,
  ttsEdgeVoice: process.env.TTS_EDGE_VOICE ?? 'en-US-AriaNeural',

  /**
   * Multimodal AI provider selection.
   * - `claude`: Anthropic Claude API.
   * - `mock`: deterministic offline heuristics (CI / beginner laptops).
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
