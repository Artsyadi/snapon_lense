/*
 * Node-only tests for shelvesense-lens/src/ShelfSenseAgent.ts.
 * These rely on minimal Lens Studio global stubs and do not execute on-device native APIs.
 */

import { ShelfSenseAgent } from '../../../shelvesense-lens/src/ShelfSenseAgent';
import { makePinchInteractorStub, makeSceneObjectStub, makeTextStub } from '../helpers/lensNodeStubs';

function createWiredAgent(): any {
  const agent = new ShelfSenseAgent() as any;
  agent.cameraModule = {
    requestImage: jest.fn(),
    constructor: {
      createImageRequest: jest.fn(() => ({ quality: 'default' })),
    },
  };
  agent.remoteService = {
    fetch: jest.fn(),
    makeResourceFromBlob: jest.fn(() => ({ kind: 'resource' })),
  };
  agent.remoteMedia = {
    loadResourceAsAudioTrackAsset: jest.fn(),
  };
  agent.apiBaseUrl = 'https://example.test/api';
  agent.pinchInteractor = makePinchInteractorStub();
  agent.headlineText = makeTextStub();
  agent.detailsText = makeTextStub();
  agent.alternativesText = makeTextStub();
  agent.cartSummaryText = makeTextStub();
  agent.loadingIndicator = makeSceneObjectStub();
  agent.statusRing = makeSceneObjectStub();
  agent.resultPanel = makeSceneObjectStub();
  agent.scanAnchor = makeSceneObjectStub();
  agent.audioPlayer = {
    playbackMode: null,
    stop: jest.fn(),
    play: jest.fn(),
    audioTrack: null,
  };
  return agent;
}

function printedLines(): string[] {
  const calls = ((global as any).print as jest.Mock).mock.calls;
  return calls.map((c) => String(c[0]));
}

describe('ShelfSenseAgent init guards and audio fallback behavior (Node stubs)', () => {
  const requiredInputCases: Array<{ field: string; expectedMsg: string }> = [
    { field: 'cameraModule', expectedMsg: 'Assign cameraModule' },
    { field: 'remoteService', expectedMsg: 'Assign remoteService' },
    { field: 'remoteMedia', expectedMsg: 'Assign remoteMedia' },
    { field: 'audioPlayer', expectedMsg: 'Assign audioPlayer' },
    { field: 'pinchInteractor', expectedMsg: 'Assign pinchInteractor' },
  ];

  it.each(requiredInputCases)(
    'when $field is null it logs explicit init guidance and does not touch camera/network APIs',
    ({ field, expectedMsg }) => {
      // Guards against early native dereference crashes on Spectacles when an Inspector input is left unassigned.
      const agent = createWiredAgent();
      agent[field] = null;

      agent.onAwake();

      const logs = printedLines();
      expect(logs.some((line) => line.includes('[ShelfSense:init]') && line.includes(expectedMsg))).toBe(true);
      expect(agent.cameraModule?.requestImage ?? jest.fn()).not.toHaveBeenCalled();
      expect(agent.remoteService?.fetch ?? jest.fn()).not.toHaveBeenCalled();
    },
  );

  it('logs explicit apiBaseUrl validation message when URL is empty/too short', () => {
    // Guards against opaque startup failure where a bad endpoint is configured and users cannot diagnose why scans never begin.
    const agent = createWiredAgent();
    agent.apiBaseUrl = 'short';

    agent.onAwake();

    const logs = printedLines();
    expect(logs.some((line) => line.includes('[ShelfSense:init]') && line.includes('Set apiBaseUrl'))).toBe(true);
    expect(agent.remoteService.fetch).not.toHaveBeenCalled();
    expect(agent.cameraModule.requestImage).not.toHaveBeenCalled();
  });

  it('skips decode/play when speech payload is fallback browser_tts_hint with empty audio bytes', () => {
    // Guards against playback crashes where empty audio payloads are still decoded despite fallback hints.
    const agent = createWiredAgent();
    const decodeSpy = jest.spyOn((global as any).Base64, 'decode');

    (agent as any).playInlineSpeech({
      format: 'inline',
      mimeType: 'audio/mpeg',
      audioBase64: '',
      spokenLine: 'Caution. Watch sodium.',
      fallback: 'browser_tts_hint',
    });

    expect(decodeSpy).not.toHaveBeenCalled();
    expect(agent.remoteMedia.loadResourceAsAudioTrackAsset).not.toHaveBeenCalled();
    const logs = printedLines();
    expect(logs.some((line) => line.includes('[ShelfSense:tts] server TTS unavailable'))).toBe(true);
  });

  it('handles RemoteMedia decode failure gracefully and keeps text-only flow alive', () => {
    // Guards against hard crashes when device audio decode fails for otherwise valid MP3 bytes.
    const agent = createWiredAgent();

    agent.remoteMedia.loadResourceAsAudioTrackAsset.mockImplementation(
      (_resource: unknown, _ok: (track: unknown) => void, onErr: (err: string) => void) => {
        onErr('decode-failed');
      },
    );

    const validEnoughMp3B64 = Buffer.from('ID3MOCK_VALID_AUDIO_BYTES_FOR_TESTS').toString('base64');

    expect(() =>
      (agent as any).playInlineSpeech({
        format: 'inline',
        mimeType: 'audio/mpeg',
        audioBase64: validEnoughMp3B64,
        spokenLine: 'Avoid. Peanut allergen risk.',
        fallback: 'none',
      }),
    ).not.toThrow();

    expect(agent.remoteMedia.loadResourceAsAudioTrackAsset).toHaveBeenCalledTimes(1);
    expect(agent.audioPlayer.play).not.toHaveBeenCalled();
    const logs = printedLines();
    expect(logs.some((line) => line.includes('[ShelfSense:tts] audio load failed'))).toBe(true);
  });
});
