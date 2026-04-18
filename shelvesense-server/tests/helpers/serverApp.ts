import type express from 'express';

const defaultEnv = {
  AI_ENGINE: 'mock',
  OCR_ENABLED: 'true',
  OCR_PREPROCESS: 'true',
  SQLITE_ENABLED: 'false',
  ANTHROPIC_API_KEY: '',
  TTS_ENGINE: 'edge',
};

export async function createTestApp(
  envOverrides: Partial<Record<keyof typeof defaultEnv | 'SHELFSENSE_MAX_IMAGE_BYTES', string>> = {},
): Promise<express.Express> {
  jest.resetModules();
  const managedKeys: Array<keyof typeof defaultEnv | 'SHELFSENSE_MAX_IMAGE_BYTES'> = [
    'AI_ENGINE',
    'OCR_ENABLED',
    'OCR_PREPROCESS',
    'SQLITE_ENABLED',
    'ANTHROPIC_API_KEY',
    'TTS_ENGINE',
    'SHELFSENSE_MAX_IMAGE_BYTES',
  ];

  for (const key of managedKeys) {
    if (Object.prototype.hasOwnProperty.call(envOverrides, key)) {
      process.env[key] = envOverrides[key] as string;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(defaultEnv, key)) {
      process.env[key] = defaultEnv[key as keyof typeof defaultEnv];
      continue;
    }
    delete process.env[key];
  }
  const { createApp } = await import('../../src/app');
  return createApp();
}

export function sessionId(label: string): string {
  return `${label}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}
