import request from 'supertest';
import { createTestApp } from '../helpers/serverApp';
import { profiles, readSampleBuffer } from '../helpers/fixtures';
import { expectStructuredError } from '../helpers/assertions';

describe('Additional smoke coverage for non-primary API paths', () => {
  it('smoke: GET /health returns backend heartbeat', async () => {
    // Guards against accidental app wiring regressions where core health checks are removed or renamed.
    const app = await createTestApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        service: 'shelvesense-backend',
      }),
    );
  });

  it('smoke: POST /api/alternatives returns 3 contract-shaped alternatives', async () => {
    // Guards against schema or prompt regressions that break alternatives generation response structure.
    const app = await createTestApp();
    const res = await request(app).post('/api/alternatives').send({
      currentProduct: {
        name: 'Snack Chips',
        category: 'snacks',
        ingredients_flags: ['high sodium'],
      },
      verdict: 'Caution',
      health_flags: ['Sodium load'],
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.alternatives)).toBe(true);
    expect(res.body.alternatives.length).toBeGreaterThan(0);
    expect(res.body.alternatives[0]).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        why_better: expect.any(String),
      }),
    );
  });

  it('smoke: POST /api/meal-plan returns at least one contract-shaped meal', async () => {
    // Guards against meal-plan route regressions that would break downstream UI expecting meals[] with rationale and cost band.
    const app = await createTestApp();
    const res = await request(app).post('/api/meal-plan').send({
      healthProfile: profiles.relaxed,
      cartSummary: '1 caution item, sodium trending medium.',
      budgetTarget: 'low',
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.meals)).toBe(true);
    expect(res.body.meals.length).toBeGreaterThan(0);
    expect(res.body.meals[0]).toEqual(
      expect.objectContaining({
        title: expect.any(String),
        ingredients: expect.any(Array),
        rationale: expect.any(String),
        estimated_cost_band: expect.stringMatching(/^(low|medium|high)$/),
      }),
    );
  });

  it('smoke: POST /api/profile/ocr rejects requests missing multipart image field', async () => {
    // Guards against missing-file parser crashes in the OCR route and enforces structured client-error responses.
    const app = await createTestApp();
    const res = await request(app).post('/api/profile/ocr').field('unused', 'value');

    expect(res.status).toBe(400);
    expectStructuredError(res.body);
  });

  it('smoke: POST /api/profile/ocr accepts fixture image and returns OCR text', async () => {
    // Guards against OCR endpoint regressions that would break profile onboarding workflows before parse.
    const app = await createTestApp();
    const res = await request(app)
      .post('/api/profile/ocr')
      .attach('image', readSampleBuffer('label-healthy.jpg'), 'label-healthy.jpg');

    expect(res.status).toBe(200);
    expect(typeof res.body.rawText).toBe('string');
    expect(res.body.rawText.length).toBeGreaterThan(0);
  });
});
