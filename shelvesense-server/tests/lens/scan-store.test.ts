/*
 * Node-only tests for shelvesense-lens/src/state/scanStore.ts.
 */

import { ScanStore } from '../../../shelvesense-lens/src/state/scanStore';

describe('lens scanStore.ts state isolation', () => {
  it('starts scan N+1 from a clean pending state and clears scan N verdict data', () => {
    // Guards against stale-result bleed where a previous Avoid verdict appears during the next analysis cycle.
    const store = new ScanStore();

    store.lastAnalysis = {
      verdict: 'Avoid',
      reason: 'Contains peanut allergen',
      ingredients_flags: ['peanut'],
      macro_breakdown: {
        calories: '120',
        protein: '3g',
        carbs: '10g',
        fat: '7g',
        sugar: '5g',
        sodium: '180mg',
      },
      health_risks: ['Allergen exposure'],
      better_alternatives: [],
      cart_impact: { summary: 'high risk', running_score: '2/10' },
      meal_plan_hint: '',
    } as any;

    store.setState('ANALYZING');
    store.resetResult();

    expect(store.uiState).toBe('ANALYZING');
    expect(store.lastAnalysis).toBeNull();
    expect(store.lastError).toBeNull();
  });

  it('recovers from failed scan state back to idle so UI is not permanently stuck scanning', () => {
    // Guards against lockup regressions where network failures leave the state machine stranded in non-idle UI states.
    const store = new ScanStore();

    store.setState('SCANNING');
    store.lastError = { message: 'Network timeout' };
    store.setState('ERROR');
    store.resetResult();
    store.setState('IDLE');

    expect(store.uiState).toBe('IDLE');
    expect(store.lastError).toBeNull();
  });
});
