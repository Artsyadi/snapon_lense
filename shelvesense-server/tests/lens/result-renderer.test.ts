/*
 * Node-only tests for shelvesense-lens/src/ui/resultRenderer.ts.
 */

import { verdictColor } from '../../../shelvesense-lens/src/utils/colors';
import { renderVerdictTexts } from '../../../shelvesense-lens/src/ui/resultRenderer';
import { makeTextStub } from '../helpers/lensNodeStubs';

describe('lens resultRenderer.ts', () => {
  it('renders Safe headline with the configured Safe color', () => {
    // Guards against visual severity regressions where Safe text accidentally uses caution/avoid colors.
    const headline = makeTextStub();
    const details = makeTextStub();
    const alternatives = makeTextStub();
    const cartSummary = makeTextStub();

    renderVerdictTexts(
      {
        verdict: 'Safe',
        reason: 'Simple ingredients.',
        ingredients_flags: ['short ingredient list'],
        macro_breakdown: {
          calories: '80',
          protein: '4g',
          carbs: '9g',
          fat: '2g',
          sugar: '2g',
          sodium: '90mg',
        },
        health_risks: [],
        better_alternatives: [{ name: 'Whole fruit', why_better: 'Less added sugar' }],
        cart_impact: { summary: 'Neutral', running_score: '7/10' },
        meal_plan_hint: '',
      } as any,
      headline as any,
      details as any,
      alternatives as any,
      cartSummary as any,
    );

    const expected = verdictColor('Safe' as any) as any;
    const actual = headline.textFill.color as any;
    expect(headline.text).toBe('Safe');
    expect(actual.x).toBe(expected.x);
    expect(actual.y).toBe(expected.y);
    expect(actual.z).toBe(expected.z);
    expect(actual.w).toBe(expected.w);
  });

  it('renders Avoid verdict with non-empty headline/details/alternatives/cart text fields', () => {
    // Guards against partial UI rendering regressions where one or more text slots are left blank on high-risk outcomes.
    const headline = makeTextStub();
    const details = makeTextStub();
    const alternatives = makeTextStub();
    const cartSummary = makeTextStub();

    renderVerdictTexts(
      {
        verdict: 'Avoid',
        reason: 'Peanut allergen conflicts with your profile.',
        ingredients_flags: ['peanut'],
        macro_breakdown: {
          calories: '190',
          protein: '7g',
          carbs: '18g',
          fat: '11g',
          sugar: '7g',
          sodium: '210mg',
        },
        health_risks: ['Allergen exposure'],
        better_alternatives: [{ name: 'Seed butter', why_better: 'No peanut allergen' }],
        cart_impact: { summary: 'High risk for this profile', running_score: '2/10' },
        meal_plan_hint: '',
      } as any,
      headline as any,
      details as any,
      alternatives as any,
      cartSummary as any,
    );

    expect(headline.text.length).toBeGreaterThan(0);
    expect(details.text.length).toBeGreaterThan(0);
    expect(alternatives.text.length).toBeGreaterThan(0);
    expect(cartSummary.text.length).toBeGreaterThan(0);
  });

  it('BUG: handles null alternatives field without crashing or rendering undefined text', () => {
    // Guards against backend nullability drift causing runtime crashes in alternatives rendering.
    // TODO(prod): Null-guard better_alternatives before slice/map and render a safe fallback placeholder.
    const headline = makeTextStub();
    const details = makeTextStub();
    const alternatives = makeTextStub();
    const cartSummary = makeTextStub();

    expect(() =>
      renderVerdictTexts(
        {
          verdict: 'Caution',
          reason: 'Panel incomplete.',
          ingredients_flags: [],
          macro_breakdown: {
            calories: 'unknown',
            protein: 'unknown',
            carbs: 'unknown',
            fat: 'unknown',
            sugar: 'unknown',
            sodium: 'unknown',
          },
          health_risks: [],
          better_alternatives: null,
          cart_impact: { summary: 'Unknown', running_score: 'n/a' },
          meal_plan_hint: '',
        } as any,
        headline as any,
        details as any,
        alternatives as any,
        cartSummary as any,
      ),
    ).not.toThrow();

    expect(alternatives.text.toLowerCase()).not.toContain('undefined');
  });

  it('BUG: falls back unknown verdict display to Caution instead of throwing or showing raw Unknown', () => {
    // Guards against forward-compatibility regressions where unrecognized verdict values break user-facing severity semantics.
    // TODO(prod): Coerce unrecognized verdict values to Caution in renderer before assigning headline text/color.
    const headline = makeTextStub();
    const details = makeTextStub();
    const alternatives = makeTextStub();
    const cartSummary = makeTextStub();

    expect(() =>
      renderVerdictTexts(
        {
          verdict: 'Unknown',
          reason: 'Unrecognized verdict sample.',
          ingredients_flags: [],
          macro_breakdown: {
            calories: 'unknown',
            protein: 'unknown',
            carbs: 'unknown',
            fat: 'unknown',
            sugar: 'unknown',
            sodium: 'unknown',
          },
          health_risks: [],
          better_alternatives: [],
          cart_impact: { summary: 'Unknown', running_score: 'n/a' },
          meal_plan_hint: '',
        } as any,
        headline as any,
        details as any,
        alternatives as any,
        cartSummary as any,
      ),
    ).not.toThrow();

    expect(headline.text).toBe('Caution');
  });
});
