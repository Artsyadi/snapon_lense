import OpenAI from 'openai';
import type { SpeechCreateParams } from 'openai/resources/audio/speech';
import { config, assertOpenAiConfigured, useOpenAiForServerTts } from '../config.js';
import type { SpeechResult } from '../types.js';
import { logger } from '../utils/logger.js';
import { withExponentialBackoff } from './retryService.js';

function normalizeVerdictSpeech(text: string): string {
  const t = text.trim();
  if (t.length > 220) return `${t.slice(0, 217)}...`;
  return t;
}

async function synthesizeOpenAi(line: string): Promise<Buffer> {
  assertOpenAiConfigured();
  const openai = new OpenAI({ apiKey: config.openai.apiKey, timeout: 60000 });
  return await withExponentialBackoff(
    async () => {
      const res = await openai.audio.speech.create({
        model: config.openai.ttsModel,
        voice: config.openai.ttsVoice as SpeechCreateParams['voice'],
        input: line,
      });
      return Buffer.from(await res.arrayBuffer());
    },
    {
      maxRetries: config.ai.maxRetries,
      initialBackoffMs: config.ai.initialBackoffMs,
      maxBackoffMs: config.ai.maxBackoffMs,
      label: 'tts-openai',
    },
  );
}

/** Free tier: Microsoft Edge read-aloud WebSocket (via `edge-tts` npm). No API key. */
async function synthesizeEdge(line: string): Promise<Buffer> {
  const { tts } = await import('edge-tts');
  return await withExponentialBackoff(
    () => tts(line, { voice: config.ttsEdgeVoice }),
    {
      maxRetries: config.ai.maxRetries,
      initialBackoffMs: config.ai.initialBackoffMs,
      maxBackoffMs: config.ai.maxBackoffMs,
      label: 'tts-edge',
    },
  );
}

export async function synthesizeSpeechLine(text: string): Promise<SpeechResult> {
  const line = normalizeVerdictSpeech(text);
  try {
    const buf = useOpenAiForServerTts() ? await synthesizeOpenAi(line) : await synthesizeEdge(line);
    return {
      format: 'inline',
      mimeType: 'audio/mpeg',
      audioBase64: buf.toString('base64'),
      spokenLine: line,
      fallback: 'none',
    };
  } catch (err) {
    logger.warn({ err }, 'TTS failed — returning spoken line + client fallback hint');
    return {
      format: 'inline',
      mimeType: 'audio/mpeg',
      audioBase64: '',
      spokenLine: line,
      fallback: 'browser_tts_hint',
    };
  }
}
