import request from 'supertest';
import { createTestApp } from '../helpers/serverApp';
import { expectStructuredError } from '../helpers/assertions';

describe('POST /api/cart/update and session behavior', () => {
  it('accepts cart: null and initializes cart state without crashing', async () => {
    // Guards against null-cart bootstrap regressions from first-time users who have no prior cart context.
    const app = await createTestApp();

    const res = await request(app).post('/api/cart/update').send({
      latestItem: {
        verdict: 'Avoid',
        ingredients_flags: ['peanut wording on label'],
        health_risks: ['Allergen exposure'],
      },
      cart: null,
    });

    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.verdictCounts.Avoid).toBe(1);
  });

  it('accumulates items when latestItem is Avoid with ingredient flags and updates summary on subsequent call', async () => {
    // Guards against state-merge regressions where cart trends/risk summaries stop accumulating across scans.
    const app = await createTestApp();

    const first = await request(app).post('/api/cart/update').send({
      latestItem: {
        verdict: 'Avoid',
        ingredients_flags: ['peanut wording on label'],
        health_risks: ['Allergen exposure'],
      },
      cart: null,
    });

    const session = first.headers['x-shelvesense-session'] as string;

    const second = await request(app)
      .post('/api/cart/update')
      .set('x-shelvesense-session', session)
      .send({
        latestItem: {
          verdict: 'Caution',
          ingredients_flags: ['added sugar'],
          health_risks: ['Glycemic load'],
        },
        cart: first.body.cart,
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.cart.items).toHaveLength(2);
    expect(second.body.cart.verdictCounts.Avoid).toBe(1);
    expect(second.body.cart.verdictCounts.Caution).toBe(1);
    expect(typeof second.body.healthTrendSummary).toBe('string');
    expect(second.body.healthTrendSummary.length).toBeGreaterThan(0);
  });

  it('rejects missing latestItem with structured validation error', async () => {
    // Guards against malformed client payloads silently creating corrupted cart state.
    const app = await createTestApp();

    const res = await request(app).post('/api/cart/update').send({ cart: null });

    expect(res.status).toBe(400);
    expectStructuredError(res.body);
  });

  it('creates first cart entry cleanly for a fresh session with no prior cart entries', async () => {
    // Guards against stale-session leakage where a brand-new session incorrectly inherits another cart.
    const app = await createTestApp();

    const res = await request(app)
      .post('/api/cart/update')
      .set('x-shelvesense-session', 'fresh-cart-session')
      .send({
        latestItem: {
          verdict: 'Safe',
          ingredients_flags: ['short ingredient list'],
          health_risks: [],
        },
        cart: null,
      });

    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.verdictCounts.Safe).toBe(1);
    expect(res.body.cart.verdictCounts.Avoid).toBe(0);
  });

  it('returns x-shelvesense-session header when request omits session header', async () => {
    // Guards against session bootstrap regressions where clients cannot persist continuity because header echo is missing.
    const app = await createTestApp();

    const res = await request(app).get('/api/profile');

    expect(res.status).toBe(200);
    expect(typeof res.headers['x-shelvesense-session']).toBe('string');
    expect((res.headers['x-shelvesense-session'] as string).length).toBeGreaterThan(0);
  });

  it('handles unknown session IDs without crashing and returns fresh default state', async () => {
    // Guards against stale or expired session IDs causing server crashes instead of graceful rehydration.
    const app = await createTestApp();

    const res = await request(app).get('/api/profile').set('x-shelvesense-session', 'expired-or-unknown-session-id');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        profile: null,
      }),
    );
  });

  it('BUG: preserves both concurrent cart updates on the same session without dropping one write', async () => {
    // Guards against race conditions where concurrent writes overwrite each other and lose one of the scanned items.
    // TODO(prod): Merge against server-side session cart atomically instead of trusting stale client cart snapshots.
    const app = await createTestApp();
    const session = 'concurrent-session';

    const bootstrap = await request(app)
      .post('/api/cart/update')
      .set('x-shelvesense-session', session)
      .send({
        latestItem: {
          verdict: 'Safe',
          ingredients_flags: ['plain staple'],
          health_risks: [],
        },
        cart: null,
      });

    expect(bootstrap.status).toBe(200);

    const baseCart = bootstrap.body.cart;

    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/cart/update')
        .set('x-shelvesense-session', session)
        .send({
          latestItem: {
            verdict: 'Avoid',
            ingredients_flags: ['peanut wording'],
            health_risks: ['Allergen exposure'],
          },
          cart: baseCart,
        }),
      request(app)
        .post('/api/cart/update')
        .set('x-shelvesense-session', session)
        .send({
          latestItem: {
            verdict: 'Caution',
            ingredients_flags: ['high sodium'],
            health_risks: ['Sodium load'],
          },
          cart: baseCart,
        }),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const { getSession } = await import('../../src/services/sessionStore');
    const stored = getSession(session);

    expect(stored.cart.items).toHaveLength(3);
  });
});
