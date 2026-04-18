import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { mockVisionJsonFromImageAndPrompt } from './labelOcrHeuristic.js';

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

/**
 * Pluggable multimodal AI interface used by routes and services.
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

function stripCodeFences(text: string): string {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

function extractTextBlocks(content: Array<{ type: string; text?: string }>): string {
  return stripCodeFences(
    content
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('\n'),
  );
}

type AnthropicImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function normalizeAnthropicImageMime(value: string): AnthropicImageMediaType | null {
  switch (value.toLowerCase()) {
    case 'image/jpg':
    case 'image/jpeg':
      return 'image/jpeg';
    case 'image/png':
      return 'image/png';
    case 'image/gif':
      return 'image/gif';
    case 'image/webp':
      return 'image/webp';
    default:
      return null;
  }
}

function toAnthropicContent(parts: ChatContentPart[]): Anthropic.Messages.ContentBlockParam[] {
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  for (const part of parts) {
    if (part.type === 'text') {
      content.push({ type: 'text', text: part.text });
      continue;
    }

    const match = part.image_url.url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
    if (!match) {
      content.push({ type: 'text', text: '[unsupported image payload]' });
      continue;
    }

    const mediaType = normalizeAnthropicImageMime(match[1]);
    if (!mediaType) {
      content.push({ type: 'text', text: '[unsupported image mime type]' });
      continue;
    }

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: match[2],
      },
    });
  }

  return content;
}

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (anthropicClient) {
    return anthropicClient;
  }
  if (!config.anthropic.apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Use AI_ENGINE=mock for offline mode.');
  }
  anthropicClient = new Anthropic({ apiKey: config.anthropic.apiKey });
  return anthropicClient;
}

export class ClaudeAiProvider implements AiProvider {
  async completeJsonText(params: {
    model: string;
    system: string;
    user: string;
    timeoutMs: number;
  }): Promise<string> {
    const client = getAnthropicClient();
    const res = await client.messages.create(
      {
        model: params.model,
        max_tokens: 1024,
        system: params.system,
        messages: [{ role: 'user', content: params.user }],
      },
      { timeout: params.timeoutMs },
    );

    const text = extractTextBlocks(res.content as Array<{ type: string; text?: string }>);
    if (!text) {
      throw new Error('Empty completion');
    }
    return text;
  }

  async completeJsonVision(params: {
    model: string;
    system: string;
    userParts: ChatContentPart[];
    timeoutMs: number;
  }): Promise<string> {
    const client = getAnthropicClient();
    const content = toAnthropicContent(params.userParts);
    const res = await client.messages.create(
      {
        model: params.model,
        max_tokens: 1024,
        system: params.system,
        messages: [{ role: 'user', content }],
      },
      { timeout: params.timeoutMs },
    );

    const text = extractTextBlocks(res.content as Array<{ type: string; text?: string }>);
    if (!text) {
      throw new Error('Empty completion');
    }
    return text;
  }
}

/** Deterministic parsing for local tests and offline mode. */
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
    /\bldl\b.*\b1[3-9][0-9]\b|\bldl\b.*\b2[0-9][0-9]\b|\bhigh cholesterol\b|\bhyperlipidemia\b/.test(t) ||
    /\bcholesterol\b.*\bhigh\b/.test(t)
      ? 'high'
      : /\bcholesterol\b/.test(t)
        ? 'borderline'
        : 'unknown';

  const hba1cMatch = t.match(/\bhba1c\b[^0-9]*([0-9]+(?:\.[0-9]+)?)/) ?? t.match(/\ba1c\b[^0-9]*([0-9]+(?:\.[0-9]+)?)/);
  let blood_sugar = 'unknown';
  if (hba1cMatch) {
    const hba1c = Number(hba1cMatch[1]);
    if (Number.isFinite(hba1c)) {
      if (hba1c >= 6.5) {
        blood_sugar = 'high';
      } else if (hba1c >= 5.7) {
        blood_sugar = 'borderline';
      } else {
        blood_sugar = 'normal';
      }
    }
  } else if (/\bdiabetes\b/.test(t)) {
    blood_sugar = 'high';
  } else if (/\bpre-?diabetes\b/.test(t)) {
    blood_sugar = 'borderline';
  } else if (/\bsugar\b|\bglucose\b/.test(t)) {
    blood_sugar = 'monitor';
  }

  const sodium_sensitivity = /\blow sodium\b|\bhypertension\b|\bhigh blood pressure\b|\bbp\b.*\bhigh\b/.test(t) ? 'limit' : 'unknown';
  const sugar_sensitivity = blood_sugar === 'high' || blood_sugar === 'borderline' || /\bsugar\b.*\bwatch\b/.test(t) ? 'elevated' : 'unknown';

  const dietary_constraints: string[] = [];
  if (allergies.length) dietary_constraints.push('avoid listed allergens');
  if (/\bultra[- ]?processed\b|\bupf\b/.test(t)) dietary_constraints.push('reduce ultra-processed foods');

  return {
    cholesterol,
    blood_sugar,
    allergies,
    deficiencies: /\bvitamin d\b|\biron\b|\bb12\b|\bfolate\b/.test(t) ? ['per lab - confirm with clinician'] : [],
    sodium_sensitivity,
    sugar_sensitivity,
    dietary_constraints,
    notes: 'Heuristic parse (AI_ENGINE=mock). Replace with Claude API for production accuracy.',
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
      rationale: 'High fiber, low cost - demo meal plan mode.',
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
  if (config.aiEngine === 'mock' || !config.anthropic.apiKey) {
    return new MockAiProvider();
  }
  return new ClaudeAiProvider();
}

/** Single shared instance for the HTTP layer (stateless providers). */
export const shelfSenseAi: AiProvider = createAiProvider();
