import request from 'supertest';
import { createTestApp } from '../helpers/serverApp';
import {
  profiles,
  randomBytesBase64,
  readRealSampleBuffer,
  readSampleBuffer,
  realSampleBase64,
  sampleBase64,
  tinyPngBuffer,
} from '../helpers/fixtures';
import { expectStructuredError } from '../helpers/assertions';

describe('POST /api/analyze-label integration', () => {
  it('accepts multipart allergen fixture and returns Avoid for peanut allergy profile', async () => {
    // Guards against regressions where multipart parsing or profile binding breaks and allergen scans stop triggering Avoid.
    const app = await createTestApp();
    const res = await request(app)
      .post('/api/analyze-label')
      .attach('image', readSampleBuffer('label-allergen-peanut.jpg'), 'label-allergen-peanut.jpg')
      .field('healthProfile', JSON.stringify(profiles.peanut));

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('Avoid');
    expect(typeof res.body.reason).toBe('string');
    expect(res.body.reason.length).toBeGreaterThan(0);
  });

  it('returns Safe for healthy synthetic label with relaxed profile', async () => {
    // Guards against false-positive caution/avoid drift on the synthetic healthy control fixture.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: sampleBase64('label-healthy.jpg'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.relaxed,
    });

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('Safe');
  });

  it('never returns Safe for high sodium+sugar fixture under sodium/sugar-sensitive profile', async () => {
    // Guards against profile-risk weighting regressions that would mislabel clearly risky fixtures as Safe.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: sampleBase64('label-high-sodium-sugar.jpg'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.sodiumSugarLimit,
    });

    expect(res.status).toBe(200);
    expect(['Caution', 'Avoid']).toContain(res.body.verdict);
    expect(res.body.verdict).not.toBe('Safe');
  });

  it('handles blurry real shelf image without crashing and returns a conservative verdict with reason', async () => {
    // Guards against low-confidence OCR crashes/unhandled rejections on real-world blurry retail captures.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: realSampleBase64('shelf_blurry_angle.jpg'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.relaxed,
    });

    expect(res.status).not.toBe(500);
    expect(['Caution', 'Avoid']).toContain(res.body.verdict);
    expect(typeof res.body.reason).toBe('string');
    expect(res.body.reason.length).toBeGreaterThan(0);
  });

  it('handles dashcam-motion real image on low-confidence path without returning Safe', async () => {
    // Guards against motion-blur edge cases silently becoming Safe due to OCR sparsity handling regressions.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: realSampleBase64('dashcam_retail_motion.jpg'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.relaxed,
    });

    expect(res.status).not.toBe(500);
    expect(['Caution', 'Avoid']).toContain(res.body.verdict);
    expect(res.body.verdict).not.toBe('Safe');
    expect(typeof res.body.reason).toBe('string');
    expect(res.body.reason.length).toBeGreaterThan(0);
  });

  it('rejects zero-byte JSON body with a structured 400-level error instead of crashing', async () => {
    // Guards against JSON parser edge cases bubbling into 500 responses on empty client uploads.
    const app = await createTestApp();
    const res = await request(app)
      .post('/api/analyze-label')
      .set('Content-Type', 'application/json')
      .send('');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expectStructuredError(res.body);
  });

  it('handles PNG bytes renamed as .jpg without unhandled Sharp/Tesseract exceptions', async () => {
    // Guards against content-type spoofing crashes where non-JPEG payloads are uploaded with a .jpg filename.
    const app = await createTestApp();
    const res = await request(app)
      .post('/api/analyze-label')
      .attach('image', tinyPngBuffer(), 'not-a-jpeg.jpg')
      .field('healthProfile', JSON.stringify(profiles.relaxed));

    expect(res.status).not.toBe(500);
    expect([200, 400, 422]).toContain(res.status);
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

  it('returns structured non-500 response for base64 that decodes to random non-image bytes', async () => {
    // Guards against decode-path crashes when clients accidentally send random bytes encoded as base64 image data.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: randomBytesBase64(512),
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

  it('rejects oversized multipart uploads based on SHELFSENSE_MAX_IMAGE_BYTES', async () => {
    // Guards against denial-of-service regressions where upload limits are ignored and oversized payloads are accepted.
    const app = await createTestApp({ SHELFSENSE_MAX_IMAGE_BYTES: '2048' });
    const tooBig = Buffer.alloc(8192, 7);

    const res = await request(app)
      .post('/api/analyze-label')
      .attach('image', tooBig, 'oversized.jpg')
      .field('healthProfile', JSON.stringify(profiles.relaxed));

    expect([400, 413]).toContain(res.status);
    expectStructuredError(res.body);
  });

  it('rejects empty imageBase64 with a human-readable 400 validation error', async () => {
    // Guards against silent acceptance of empty image payloads that would later fail deep in OCR/AI processing.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: '',
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.relaxed,
    });

    expect(res.status).toBe(400);
    expectStructuredError(res.body);
    expect(res.body.error.message.toLowerCase()).toContain('invalid');
  });

  it('BUG: missing healthProfile should use a permissive default profile and still return a verdict', async () => {
    // Guards against session/profile bootstrap regressions: desired default is permissive (no allergies, unknown sensitivities) so missing healthProfile should not hard-fail.
    // TODO(prod): Allow analyze-label to fall back to session/default permissive profile when healthProfile is omitted.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: sampleBase64('label-healthy.jpg'),
      imageMimeType: 'image/jpeg',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        verdict: expect.any(String),
        reason: expect.any(String),
      }),
    );
  });

  it('keeps sessions isolated so strict verdicts in one session do not leak into a different session', async () => {
    // Guards against cross-session state leakage where one shopper profile could affect another shopper's verdict.
    const app = await createTestApp();

    const strictRes = await request(app)
      .post('/api/analyze-label')
      .set('x-shelvesense-session', 'user-A')
      .send({
        imageBase64: sampleBase64('label-high-sodium-sugar.jpg'),
        imageMimeType: 'image/jpeg',
        healthProfile: profiles.sodiumSugarLimit,
      });

    const relaxedRes = await request(app)
      .post('/api/analyze-label')
      .set('x-shelvesense-session', 'user-B')
      .send({
        imageBase64: sampleBase64('label-high-sodium-sugar.jpg'),
        imageMimeType: 'image/jpeg',
        healthProfile: profiles.relaxed,
      });

    expect(strictRes.status).toBe(200);
    expect(relaxedRes.status).toBe(200);
    expect(strictRes.body.verdict).toBe('Avoid');
    expect(relaxedRes.body.verdict).toBe('Caution');
  });

  it('produces equivalent verdicts for JSON-body and multipart-body paths on the same fixture', async () => {
    // Guards against route divergence where multipart and JSON payloads yield different model behavior for identical input.
    const app = await createTestApp();

    const jsonRes = await request(app).post('/api/analyze-label').send({
      imageBase64: sampleBase64('label-healthy.jpg'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.relaxed,
    });

    const multipartRes = await request(app)
      .post('/api/analyze-label')
      .attach('image', readSampleBuffer('label-healthy.jpg'), 'label-healthy.jpg')
      .field('healthProfile', JSON.stringify(profiles.relaxed));

    expect(jsonRes.status).toBe(200);
    expect(multipartRes.status).toBe(200);
    expect(multipartRes.body.verdict).toBe(jsonRes.body.verdict);
  });

  it('returns Avoid for real allergen_peanut_butter fixture under peanut allergy profile', async () => {
    // Guards against regressions in real-world allergen detection heuristics for peanut-butter packaging.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: readRealSampleBuffer('allergen_peanut_butter.jpg').toString('base64'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.peanut,
    });

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('Avoid');
  });
});
