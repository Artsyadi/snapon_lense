import request from 'supertest';
import { createTestApp } from '../helpers/serverApp';
import { profiles, realSampleBase64, sampleBase64 } from '../helpers/fixtures';

describe('Regression contracts from verify scripts', () => {
  it('regression fixture: label-healthy.jpg -> verdict Safe', async () => {
    // Guards against contract drift from verify-samples where the healthy synthetic baseline must remain Safe.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: sampleBase64('label-healthy.jpg'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.relaxed,
    });

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('Safe');
  });

  it('regression fixture: label-high-sodium-sugar.jpg -> verdict Caution or Avoid', async () => {
    // Guards against verify-samples regressions that would incorrectly classify sodium/sugar-heavy fixture as Safe.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: sampleBase64('label-high-sodium-sugar.jpg'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.sodiumSugarLimit,
    });

    expect(res.status).toBe(200);
    expect(['Caution', 'Avoid']).toContain(res.body.verdict);
  });

  it('regression fixture: label-allergen-peanut.jpg with peanut allergy -> verdict Avoid', async () => {
    // Guards against verify-samples allergen safety contract regressions for peanut-sensitive users.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: sampleBase64('label-allergen-peanut.jpg'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.peanut,
    });

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('Avoid');
  });

  it('regression fixture: allergen_peanut_butter.jpg (real) with peanut allergy -> verdict Avoid', async () => {
    // Guards against verify-real regressions in real peanut-butter package recognition under allergy profiles.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: realSampleBase64('allergen_peanut_butter.jpg'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.peanut,
    });

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('Avoid');
  });

  it('regression fixture: shelf_blurry_angle.jpg (real) -> verdict Caution', async () => {
    // Guards against verify-real low-confidence path regressions where blurry shelf scans must stay conservative.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: realSampleBase64('shelf_blurry_angle.jpg'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.relaxed,
    });

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('Caution');
  });

  it('regression fixture: dashcam_retail_motion.jpg (real) -> verdict Caution', async () => {
    // Guards against verify-real motion-blur regressions where noisy retail frames must not be promoted to Safe.
    const app = await createTestApp();
    const res = await request(app).post('/api/analyze-label').send({
      imageBase64: realSampleBase64('dashcam_retail_motion.jpg'),
      imageMimeType: 'image/jpeg',
      healthProfile: profiles.relaxed,
    });

    expect(res.status).toBe(200);
    expect(res.body.verdict).toBe('Caution');
  });
});
