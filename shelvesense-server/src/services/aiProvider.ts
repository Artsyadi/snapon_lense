import OpenAI from 'openai';
import { config, assertOpenAiConfigured } from '../config.js';
import { mockVisionJsonFromImageAndPrompt } from './labelOcrHeuristic.js';

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

/**
 * Pluggable multimodal AI — swap OpenAI for local/Anthropic/etc. without touching routes.
 */
export interface AiProvider {
  completeJsonText(params: {
    model: string;
    system: string;
    user: string;
    timeoutMs: number;
  }): Promise<string>;

  completeJsonVision(params: {
    model: string;
    system: string;
    userParts: ChatContentPart[];
    timeoutMs: number;
  }): Promise<string>;
}

function openaiClient(): OpenAI {
  assertOpenAiConfigured();
  return new OpenAI({ apiKey: config.openai.apiKey, timeout: config.ai.requestTimeoutMs });
}

export class OpenAiAiProvider implements AiProvider {
  async completeJsonText(params: {
    model: string;
    system: string;
    user: string;
    timeoutMs: number;
  }): Promise<string> {
    const openai = openaiClient();
    const res = await openai.chat.completions.create(
      {
        model: params.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
      },
      { timeout: params.timeoutMs },
    );
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error('Empty completion');
    return text;
  }

  async completeJsonVision(params: {
    model: string;
    system: string;
    userParts: ChatContentPart[];
    timeoutMs: number;
  }): Promise<string> {
    const openai = openaiClient();
    const res = await openai.chat.completions.create(
      {
        model: params.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: params.system },
          {
            role: 'user',
            content: params.userParts as unknown as OpenAI.Chat.Completions.ChatCompletionContentPart[],
          },
        ],
      },
      { timeout: params.timeoutMs },
    );
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error('Empty completion');
    return text;
  }
}

/** Deterministic lab-ish parsing without any cloud call — good for CI / beginners. */
function heuristicProfileWire(raw: string): Record<string, unknown> {
  const t = raw.toLowerCase();
  const allergies: string[] = [];
  if (/\bpeanut\b/.test(t)) allergies.push('peanut');
  if (/\btree nut\b|\bnuts?\b/.test(t)) allergies.push('tree nuts');
  if (/\bmilk\b|\bdairy\b|\blactose\b/.test(t)) allergies.push('dairy');
  if (/\begg\b|\beggs\b/.test(t)) allergies.push('egg');
  if (/\bsoy\b/.test(t)) allergies.push('soy');
  if (/\bwheat\b|\bgluten\b/.test(t)) allergies.push('gluten');

  const cholesterol =
    /\bldl\b.*\b1[4-9][0-9]\b|\bldl\b.*\b2[0-9][0-9]\b|\bhigh cholesterol\b|\bhyperlipidemia\b/.test(t) ||
    /\bcholesterol\b.*\bhigh\b/.test(t)
      ? 'high'
      : /\bcholesterol\b/.test(t)
        ? 'borderline'
        : 'unknown';

  const blood_sugar =
    /\ba1c\b.*\b6\.[5-9]\b|\ba1c\b.*\b[7-9]\./.test(t) || /\bhba1c\b.*\b6\.[5-9]/.test(t) || /\bdiabetes\b|\bpre-?diabetes\b/.test(t)
      ? 'at-risk'
      : /\bsugar\b|\bglucose\b/.test(t)
        ? 'monitor'
        : 'unknown';

  const sodium_sensitivity = /\blow sodium\b|\bhypertension\b|\bhigh blood pressure\b|\bbp\b.*\bhigh\b/.test(t) ? 'limit' : 'unknown';
  const sugar_sensitivity = blood_sugar === 'at-risk' || /\bsugar\b.*\bwatch\b/.test(t) ? 'elevated' : 'unknown';

  const dietary_constraints: string[] = [];
  if (allergies.length) dietary_constraints.push('avoid listed allergens');
  if (/\bultra[- ]?processed\b|\bupf\b/.test(t)) dietary_constraints.push('reduce ultra-processed foods');

  return {
    cholesterol,
    blood_sugar,
    allergies,
    deficiencies: /\bvitamin d\b|\biron\b|\bb12\b|\bfolate\b/.test(t) ? ['per lab — confirm with clinician'] : [],
    sodium_sensitivity,
    sugar_sensitivity,
    dietary_constraints,
    notes: 'Heuristic parse (AI_ENGINE=mock). Replace with cloud AI for production accuracy.',
  };
}

const MOCK_ALTS = [
  { name: 'Plain whole-food swap', why_better: 'Fewer additives; demo alternatives mode.' },
  { name: 'Lower-sugar same category', why_better: 'Check label for under 5g added sugar per serving.' },
  { name: 'No-salt-added variant', why_better: 'Cuts sodium for most profiles.' },
];

const MOCK_MEALS = {
  meals: [
    {
      title: 'Beans + greens bowl',
      ingredients: ['canned beans', 'frozen spinach', 'olive oil', 'lemon', 'brown rice'],
      rationale: 'High fiber, low cost — demo meal plan mode.',
      estimated_cost_band: 'low' as const,
    },
    {
      title: 'Egg + veggie scramble',
      ingredients: ['eggs', 'peppers', 'onion', 'whole-wheat toast'],
      rationale: 'Protein-forward breakfast for busy days.',
      estimated_cost_band: 'low' as const,
    },
    {
      title: 'Lentil soup',
      ingredients: ['red lentils', 'carrots', 'celery', 'canned tomatoes', 'spices'],
      rationale: 'Batch-friendly; gentle on sodium if unsalted tomatoes.',
      estimated_cost_band: 'low' as const,
    },
  ],
};

export class MockAiProvider implements AiProvider {
  async completeJsonText(params: { model: string; system: string; user: string; timeoutMs: number }): Promise<string> {
    void params.model;
    void params.system;
    void params.timeoutMs;
    const u = params.user;
    if (u.includes('Task: Suggest 3 better grocery alternatives')) {
      return JSON.stringify(MOCK_ALTS);
    }
    if (u.includes('Task: Propose 3 budget-friendly meals')) {
      return JSON.stringify(MOCK_MEALS);
    }
    const raw = u.split('Lab report text:').pop() ?? u;
    return JSON.stringify(heuristicProfileWire(raw.trim()));
  }

  async completeJsonVision(params: {
    model: string;
    system: string;
    userParts: ChatContentPart[];
    timeoutMs: number;
  }): Promise<string> {
    void params.model;
    void params.system;
    void params.timeoutMs;
    return mockVisionJsonFromImageAndPrompt(params.userParts);
  }
}

export function createAiProvider(): AiProvider {
  const mode = config.aiEngine;
  if (mode === 'mock') return new MockAiProvider();
  if (mode === 'openai') return new OpenAiAiProvider();
  return config.openai.apiKey ? new OpenAiAiProvider() : new MockAiProvider();
}

/** Single shared instance for the HTTP layer (stateless providers). */
export const shelfSenseAi: AiProvider = createAiProvider();
