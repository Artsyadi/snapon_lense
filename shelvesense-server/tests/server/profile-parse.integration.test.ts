import request from 'supertest';
import { createTestApp } from '../helpers/serverApp';
import { profiles, sampleBase64 } from '../helpers/fixtures';
import { expectStructuredError } from '../helpers/assertions';

describe('POST /api/profile/parse integration', () => {
  it('BUG: parses clinical markers and diet/allergy signals into a structured profile', async () => {
    // Guards against parser regressions where clinically meaningful strings stop mapping to profile constraints.
    // TODO(prod): Map HbA1c ~6.1% to borderline/prediabetic blood sugar classification in mock/profile parser.
    const app = await createTestApp();
    const res = await request(app).post('/api/profile/parse').send({
      rawText: 'LDL 165 mg/dL. HbA1c 6.1%. Allergy: peanut. Low sodium diet.',
    });

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual(
      expect.objectContaining({
        cholesterol: 'high',
        sodiumSensitivity: 'limit',
      }),
    );
    expect(res.body.profile.allergies).toContain('peanut');
    expect(['borderline', 'prediabetic']).toContain((res.body.profile.bloodSugar ?? '').toLowerCase());
  });

  it('BUG: accepts empty rawText with a graceful default/empty profile instead of failing', async () => {
    // Guards against fragile empty-input behavior where blank OCR output causes hard validation errors rather than a recoverable parse response.
    // TODO(prod): Accept empty rawText and return a deterministic default profile payload.
    const app = await createTestApp();
    const res = await request(app).post('/api/profile/parse').send({ rawText: '' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        profile: expect.any(Object),
      }),
    );
  });

  it('rejects null rawText with a structured 400', async () => {
    // Guards against null payload crashes or accidental coercion that could poison stored session profile data.
    const app = await createTestApp();
    const res = await request(app).post('/api/profile/parse').send({ rawText: null });

    expect(res.status).toBe(400);
    expectStructuredError(res.body);
  });

  it('rejects missing rawText with a structured 400', async () => {
    // Guards against malformed client payloads silently producing undefined profile fields.
    const app = await createTestApp();
    const res = await request(app).post('/api/profile/parse').send({});

    expect(res.status).toBe(400);
    expectStructuredError(res.body);
  });

  it('treats whitespace-only rawText as a graceful empty parse response', async () => {
    // Guards against OCR artifacts containing only whitespace causing parser crashes or non-JSON failures.
    const app = await createTestApp();
    const res = await request(app).post('/api/profile/parse').send({ rawText: '   \n   \t  ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        profile: expect.objectContaining({
          allergies: expect.any(Array),
        }),
      }),
    );
  });

  it('handles very long rawText (>50KB) without timeout or parser crash', async () => {
    // Guards against pathological long-report inputs breaking prompt truncation or model JSON parsing logic.
    const app = await createTestApp();
    const longRawText = `LDL 165 mg/dL. Allergy: peanut. ${'A '.repeat(30000)}`;
    const res = await request(app).post('/api/profile/parse').send({ rawText: longRawText });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        profile: expect.objectContaining({
          cholesterol: expect.any(String),
        }),
      }),
    );
  });

  it('BUG: applies stored profile on same session analyze-label call even when healthProfile is omitted', async () => {
    // Guards against session-profile disconnect where parse output is stored but ignored by analyze-label unless clients resend full profile each scan.
    // TODO(prod): If healthProfile is missing, analyze-label should consume req.shelfSenseSession.profile before validating body.
    const app = await createTestApp();
    const session = 'profile-session-autoload';

    const parseRes = await request(app)
      .post('/api/profile/parse')
      .set('x-shelvesense-session', session)
      .send({ rawText: 'Allergy: peanut. LDL 165 mg/dL. Low sodium diet.' });

    expect(parseRes.status).toBe(200);

    const analyzeRes = await request(app)
      .post('/api/analyze-label')
      .set('x-shelvesense-session', session)
      .send({
        imageBase64: sampleBase64('label-allergen-peanut.jpg'),
        imageMimeType: 'image/jpeg',
      });

    expect(analyzeRes.status).toBe(200);
    expect(analyzeRes.body.verdict).toBe('Avoid');
  });

  it('keeps parse and analyze independent across sessions for explicit profiles', async () => {
    // Guards against profile bleed where one session parse could affect another shopper when explicit analyze profiles are sent.
    const app = await createTestApp();

    const sessionA = 'parse-session-a';
    const sessionB = 'parse-session-b';

    const parseRes = await request(app)
      .post('/api/profile/parse')
      .set('x-shelvesense-session', sessionA)
      .send({ rawText: 'Allergy: peanut.' });

    expect(parseRes.status).toBe(200);

    const analyzeA = await request(app)
      .post('/api/analyze-label')
      .set('x-shelvesense-session', sessionA)
      .send({
        imageBase64: sampleBase64('label-high-sodium-sugar.jpg'),
        imageMimeType: 'image/jpeg',
        healthProfile: profiles.sodiumSugarLimit,
      });

    const analyzeB = await request(app)
      .post('/api/analyze-label')
      .set('x-shelvesense-session', sessionB)
      .send({
        imageBase64: sampleBase64('label-high-sodium-sugar.jpg'),
        imageMimeType: 'image/jpeg',
        healthProfile: profiles.relaxed,
      });

    expect(analyzeA.status).toBe(200);
    expect(analyzeB.status).toBe(200);
    expect(analyzeA.body.verdict).toBe('Avoid');
    expect(analyzeB.body.verdict).toBe('Caution');
  });
});
