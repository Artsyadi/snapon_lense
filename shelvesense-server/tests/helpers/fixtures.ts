import fs from 'fs';
import path from 'path';
import type { HealthProfile } from '../../src/types';

const samplesRoot = path.join(process.cwd(), '..', 'samples');

export const profiles = {
  relaxed: {
    cholesterol: 'unknown',
    bloodSugar: 'normal',
    allergies: [],
    deficiencies: [],
    sodiumSensitivity: 'unknown',
    sugarSensitivity: 'unknown',
    dietaryConstraints: [],
    notes: '',
  } satisfies HealthProfile,
  peanut: {
    cholesterol: 'unknown',
    bloodSugar: 'normal',
    allergies: ['peanut'],
    deficiencies: [],
    sodiumSensitivity: 'unknown',
    sugarSensitivity: 'unknown',
    dietaryConstraints: [],
    notes: '',
  } satisfies HealthProfile,
  sodiumSugarLimit: {
    cholesterol: 'high',
    bloodSugar: 'at-risk',
    allergies: [],
    deficiencies: [],
    sodiumSensitivity: 'limit',
    sugarSensitivity: 'elevated',
    dietaryConstraints: [],
    notes: '',
  } satisfies HealthProfile,
  sodiumOnlyLimit: {
    cholesterol: 'unknown',
    bloodSugar: 'normal',
    allergies: [],
    deficiencies: [],
    sodiumSensitivity: 'limit',
    sugarSensitivity: 'unknown',
    dietaryConstraints: [],
    notes: '',
  } satisfies HealthProfile,
};

export function samplePath(fileName: string): string {
  return path.join(samplesRoot, fileName);
}

export function realSamplePath(fileName: string): string {
  return path.join(samplesRoot, 'real-products', fileName);
}

export function readSampleBuffer(fileName: string): Buffer {
  return fs.readFileSync(samplePath(fileName));
}

export function readRealSampleBuffer(fileName: string): Buffer {
  return fs.readFileSync(realSamplePath(fileName));
}

export function sampleBase64(fileName: string): string {
  return readSampleBuffer(fileName).toString('base64');
}

export function realSampleBase64(fileName: string): string {
  return readRealSampleBuffer(fileName).toString('base64');
}

export function randomBytesBase64(length = 256): string {
  const buf = Buffer.alloc(length);
  for (let i = 0; i < buf.length; i += 1) {
    buf[i] = (i * 31) % 256;
  }
  return buf.toString('base64');
}

export function tinyPngBuffer(): Buffer {
  return Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63606060000000040001f61738550000000049454e44ae426082',
    'hex',
  );
}

export function wordCount(text: string): number {
  return (text.match(/[A-Za-z]{2,}/g) ?? []).length;
}
