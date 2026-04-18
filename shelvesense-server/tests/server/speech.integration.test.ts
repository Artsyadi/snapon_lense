import request from 'supertest';
import { createTestApp } from '../helpers/serverApp';
import { expectStructuredError } from '../helpers/assertions';

describe('POST /api/speech integration', () => {
  beforeEach(() => {
    jest.unmock('edge-tts');
  });

  it('returns stable response shape with either MP3 bytes or browser_tts_hint fallback', async () => {
    // Guards against response contract drift that would break Spectacles parsing of spokenLine/audioBase64/fallback fields.
    const app = await createTestApp();
    const res = await request(app).post('/api/speech').send({ text: 'Caution. Watch sodium.' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        format: 'inline',
        mimeType: 'audio/mpeg',
        spokenLine: expect.any(String),
      }),
    );

    const audioBase64 = typeof res.body.audioBase64 === 'string' ? res.body.audioBase64 : '';
    const hasAudio = audioBase64.length > 64;
    const hasFallback = res.body.fallback === 'browser_tts_hint';
    expect(hasAudio || hasFallback).toBe(true);

    if (hasAudio) {
      const decoded = Buffer.from(audioBase64, 'base64');
      expect(decoded.length).toBeGreaterThan(32);
    }

    if (hasFallback) {
      expect(audioBase64).toBe('');
      expect(res.body.fallback).toBe('browser_tts_hint');
    }
  });

  it('rejects empty text and never invokes TTS provider code path', async () => {
    // Guards against accidental paid-provider calls on invalid empty text payloads.
    const edgeTts = jest.fn(async () => Buffer.from('fake-mp3'));
    jest.doMock('edge-tts', () => ({ tts: edgeTts }));
    const app = await createTestApp({ TTS_ENGINE: 'edge' });

    const res = await request(app).post('/api/speech').send({ text: '' });

    expect(res.status).toBe(400);
    expectStructuredError(res.body);
    expect(edgeTts).not.toHaveBeenCalled();
  });

  it('rejects null text with a structured 400 response', async () => {
    // Guards against null coercion regressions that could propagate invalid speech requests deeper into the TTS layer.
    const app = await createTestApp();
    const res = await request(app).post('/api/speech').send({ text: null });

    expect(res.status).toBe(400);
    expectStructuredError(res.body);
  });

  it('falls back to browser_tts_hint when edge-tts throws a 403/network error', async () => {
    // Guards against hard 500 failures when Edge TTS is blocked by network policy on demos or school Wi-Fi.
    const edgeTts = jest.fn(async () => {
      const err = Object.assign(new Error('edge forbidden'), { status: 403 });
      throw err;
    });
    jest.doMock('edge-tts', () => ({
      tts: edgeTts,
    }));

    const app = await createTestApp({ TTS_ENGINE: 'edge' });
    const res = await request(app).post('/api/speech').send({ text: 'Caution. Watch sodium.' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        spokenLine: expect.any(String),
        fallback: 'browser_tts_hint',
        audioBase64: '',
      }),
    );
    expect(edgeTts).toHaveBeenCalledTimes(1);
  });

  it('returns browser_tts_hint immediately when TTS_ENGINE=off', async () => {
    // Guards against regressions in text-only mode where server should skip provider calls entirely.
    const edgeTts = jest.fn(async () => Buffer.from('fake-mp3'));
    jest.doMock('edge-tts', () => ({
      tts: edgeTts,
    }));

    const app = await createTestApp({ TTS_ENGINE: 'off' });
    const res = await request(app).post('/api/speech').send({ text: 'Avoid. Peanut allergen risk.' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        fallback: 'browser_tts_hint',
        audioBase64: '',
        spokenLine: expect.any(String),
      }),
    );
    expect(edgeTts).not.toHaveBeenCalled();
  });

  it('keeps fallback contract exactly aligned with lens expectation: browser_tts_hint + empty audio bytes', async () => {
    // Guards against subtle API contract mismatch that would make the lens try to decode empty audio and crash playback.
    const edgeTts = jest.fn(async () => {
      throw new Error('forced edge failure');
    });
    jest.doMock('edge-tts', () => ({
      tts: edgeTts,
    }));

    const app = await createTestApp({ TTS_ENGINE: 'edge' });
    const res = await request(app).post('/api/speech').send({ text: 'Caution. Fallback should engage.' });

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe('browser_tts_hint');
    expect(res.body.audioBase64).toBe('');
    expect(res.body.spokenLine).toEqual(expect.any(String));
    expect(edgeTts).toHaveBeenCalledTimes(1);
  });
});
