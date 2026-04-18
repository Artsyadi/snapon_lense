import request from 'supertest';
import { createTestApp } from '../helpers/serverApp';
import { profiles, readRealSampleBuffer, wordCount } from '../helpers/fixtures';
import { expectStructuredError } from '../helpers/assertions';

async function rawTesseractWordCount(buffer: Buffer): Promise<number> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const result = await worker.recognize(buffer);
    return wordCount((result.data.text ?? '').trim());
  } finally {
    await worker.terminate();
  }
}

describe('OCR preprocessing pipeline (OCR_PREPROCESS=true)', () => {
  it('runs preprocess path that improves OCR word count versus raw JPEG OCR on retail fixtures', async () => {
    // Guards against accidental removal/reordering of sharp preprocessing that reduces OCR quality on real shelf photos.
    const app = await createTestApp({ OCR_PREPROCESS: 'true' });
    const fixtureNames = ['cereal_box.jpg', 'sauce_ketchup.jpg', 'dairy_milk_carton.jpg'];

    let totalRawWords = 0;
    let totalPreprocessedWords = 0;
    let strictlyImprovedCount = 0;

    for (const name of fixtureNames) {
      const image = readRealSampleBuffer(name);
      const rawWords = await rawTesseractWordCount(image);
      const preRes = await request(app).post('/api/profile/ocr').attach('image', image, name);

      expect(preRes.status).toBe(200);
      const preWords = wordCount(preRes.body.rawText ?? '');
      totalRawWords += rawWords;
      totalPreprocessedWords += preWords;
      if (preWords > rawWords) {
        strictlyImprovedCount += 1;
      }
      expect(preWords).toBeGreaterThanOrEqual(rawWords);
    }

    expect(strictlyImprovedCount).toBeGreaterThan(0);
    expect(totalPreprocessedWords).toBeGreaterThan(totalRawWords);
  });

  it('handles malformed JPEG headers without unhandled exceptions', async () => {
    // Guards against sharp/tesseract crashes when clients upload partially-corrupted camera buffers.
    const app = await createTestApp();
    const valid = readRealSampleBuffer('cereal_box.jpg');
    const corrupted = Buffer.from(valid);
    for (let i = 0; i < Math.min(32, corrupted.length); i += 1) {
      corrupted[i] = 0xff;
    }

    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: corrupted.toString('base64'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.relaxed,
    });

    expect(res.status).not.toBe(500);
    if (res.status >= 400) {
      expectStructuredError(res.body);
    } else {
      expect(res.body).toEqual(
        expect.objectContaining({
          verdict: expect.any(String),
          reason: expect.any(String),
        }),
      );
    }
  });

  it('BUG: returns a conservative verdict (not crash) for very small 10x10 images', async () => {
    // Guards against tiny-frame edge cases from camera capture where OCR text is minimal and should degrade to Caution rather than throw.
    // TODO(prod): Convert tiny/unreadable image failures into conservative Caution payloads instead of 422 hard errors.
    const app = await createTestApp();
    const sharp = (await import('sharp')).default;
    const tiny = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 245, g: 245, b: 245 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: tiny.toString('base64'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.relaxed,
    });

    expect(res.status).toBe(200);
    expect(['Caution', 'Avoid']).toContain(res.body.verdict);
  });
});
