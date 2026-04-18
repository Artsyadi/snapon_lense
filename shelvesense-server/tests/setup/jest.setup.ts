/*
 * Node-only Lens Studio stubs for unit tests that exercise shared logic in shelvesense-lens/src.
 * These tests validate control flow and contracts, not on-device rendering or native performance.
 */

process.env.AI_ENGINE = process.env.AI_ENGINE ?? 'mock';
process.env.OCR_ENABLED = process.env.OCR_ENABLED ?? 'true';
process.env.OCR_PREPROCESS = process.env.OCR_PREPROCESS ?? 'true';
process.env.SQLITE_ENABLED = process.env.SQLITE_ENABLED ?? 'false';

const g = globalThis as Record<string, unknown>;

class MockVec4 {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly w: number,
  ) {}
}

class MockDelayedEvent {
  private handler: () => void = () => {};

  bind(fn: () => void): void {
    this.handler = fn;
  }

  reset(_seconds: number): void {
    // Intentionally no-op in unit tests; callers can invoke fire() manually if needed.
  }

  fire(): void {
    this.handler();
  }
}

class MockBaseScriptComponent {
  createEvent(_name: string): MockDelayedEvent {
    return new MockDelayedEvent();
  }
}

g.print = jest.fn();
g.component = <T>(ctor: T): T => ctor;
g.input = (): void => {
  // Decorator no-op for Node test transpilation.
};
g.isNull = (v: unknown): boolean => v === null || v === undefined;
g.getTime = (): number => Date.now() / 1000;
g.vec4 = MockVec4;
g.TextFillMode = { Solid: 'Solid' };
g.Audio = { PlaybackMode: { Immediate: 'Immediate' } };
g.CompressionQuality = { IntermediateQuality: 'IntermediateQuality' };
g.EncodingType = { Jpg: 'Jpg' };
g.BaseScriptComponent = MockBaseScriptComponent;
g.Base64 = {
  decode: (b64: string): Uint8Array => Uint8Array.from(Buffer.from(b64, 'base64')),
  encodeTextureAsync: (
    _tex: unknown,
    onSuccess: (encoded: string) => void,
    _onError: () => void,
    _quality: unknown,
    _encodingType: unknown,
  ): void => {
    onSuccess('');
  },
};

afterEach(() => {
  jest.clearAllMocks();
});
