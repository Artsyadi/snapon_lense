import { fetchJson } from './utils/network';
import type { Delayer } from './utils/network';
import type { HealthProfile, LabelAnalysis } from './types';

/**
 * ShelfSenseQuickStart - one-input Spectacles bootstrap.
 *
 * Uses UpdateEvent polling for pinch detection (no SIK wiring required),
 * captures a still frame, sends it to /api/analyze-label, and logs verdict data.
 */
@component
export class ShelfSenseQuickStart extends BaseScriptComponent {
  @input
  apiBaseUrl: string = '';

  private readonly cooldownSeconds = 8;

  private scanning = false;
  private lastScanTime = -99;
  private wasPinching = false;
  private sessionId: string | null = null;

  private delayer: Delayer = (ms) =>
    new Promise((resolve) => {
      const ev = this.createEvent('DelayedCallbackEvent');
      ev.bind(() => resolve());
      ev.reset(ms / 1000);
    });

  onAwake(): void {
    const api = (this.apiBaseUrl ?? '').trim().replace(/\/$/, '');
    if (!api) {
      print('[QuickStart] ERROR: apiBaseUrl is empty - set it in Inspector');
      return;
    }
    if (!/^https?:\/\//i.test(api)) {
      print('[QuickStart] ERROR: apiBaseUrl must start with http:// or https://');
      return;
    }

    print('[QuickStart] ready - pinch to scan');
    print(`[QuickStart] api = ${api}`);

    const update = this.createEvent('UpdateEvent');
    update.bind(() => {
      this.onUpdate(api);
    });
  }

  private onUpdate(api: string): void {
    const pinchNow = this.detectPinch();
    const pinchJustStarted = pinchNow && !this.wasPinching;
    this.wasPinching = pinchNow;

    if (!pinchJustStarted) {
      return;
    }

    if (this.scanning) {
      print('[QuickStart] still scanning - ignoring pinch');
      return;
    }

    const now = getTime();
    const elapsed = now - this.lastScanTime;
    if (elapsed < this.cooldownSeconds) {
      print(`[QuickStart] cooldown - wait ${(this.cooldownSeconds - elapsed).toFixed(1)}s`);
      return;
    }

    this.lastScanTime = now;
    void this.triggerScan(api);
  }

  private detectPinch(): boolean {
    try {
      const g = global as unknown as {
        InteractionManager?: { getHands?: () => Array<{ isPinching?: () => boolean }> };
        handTracking?: {
          getHand?: (side: 'left' | 'right') => { isPinching?: () => boolean } | null;
        };
      };

      const hands = g.InteractionManager?.getHands?.();
      if (hands && hands.length > 0) {
        return hands.some((h) => h?.isPinching?.() ?? false);
      }

      const right = g.handTracking?.getHand?.('right');
      const left = g.handTracking?.getHand?.('left');
      return Boolean(right?.isPinching?.() || left?.isPinching?.());
    } catch (_e) {
      return false;
    }
  }

  private async triggerScan(api: string): Promise<void> {
    this.scanning = true;
    print('[QuickStart] pinch detected - capturing image...');

    try {
      const cameraModule = this.getCameraModule();
      if (!cameraModule) {
        print('[QuickStart] ERROR: CameraModule unavailable');
        return;
      }

      const imageRequest = this.createStillImageRequest(cameraModule);
      const imageFrame = await cameraModule.requestImage(imageRequest);
      const imageBase64 = await this.encodeTextureJpeg(imageFrame.texture);
      await this.sendToBackend(api, imageBase64);
    } catch (e) {
      print(`[QuickStart] scan error: ${e}`);
    } finally {
      this.scanning = false;
    }
  }

  private encodeTextureJpeg(texture: Texture): Promise<string> {
    return new Promise((resolve, reject) => {
      Base64.encodeTextureAsync(
        texture,
        (encoded) => resolve(encoded),
        () => reject(new Error('encode failed')),
        CompressionQuality.IntermediateQuality,
        EncodingType.Jpg,
      );
    });
  }

  private async sendToBackend(api: string, imageBase64: string): Promise<void> {
    const internet = this.getInternetModule();
    if (!internet) {
      print('[QuickStart] ERROR: InternetModule unavailable');
      return;
    }

    const demoProfile: HealthProfile = {
      cholesterol: 'normal',
      bloodSugar: 'borderline',
      allergies: ['peanut'],
      deficiencies: [],
      sodiumSensitivity: 'limit',
      sugarSensitivity: 'limit',
      dietaryConstraints: [],
      notes: 'QuickStart demo profile',
    };

    try {
      const { json, sessionHeader } = await fetchJson<LabelAnalysis>(
        internet,
        api,
        {
          path: '/analyze-label',
          body: {
            imageBase64,
            imageMimeType: 'image/jpeg',
            healthProfile: demoProfile,
          },
          sessionId: this.sessionId,
          maxRetries: 1,
        },
        this.delayer,
      );

      this.sessionId = sessionHeader ?? this.sessionId;

      print('----------------------------------');
      print(`[QuickStart] VERDICT: ${json.verdict}`);
      print(`[QuickStart] REASON : ${json.reason}`);
      print(`[QuickStart] RISKS  : ${(json.health_risks ?? []).join(', ')}`);
      print(
        `[QuickStart] ALTS   : ${(json.better_alternatives ?? [])
          .map((a) => a.name)
          .join(', ')}`,
      );
      print('----------------------------------');
    } catch (e) {
      print(`[QuickStart] backend error: ${e}`);
    }
  }

  private getCameraModule(): CameraModule | null {
    try {
      const cameraModule = require('LensStudio:CameraModule') as CameraModule;
      if (cameraModule && typeof cameraModule.requestImage === 'function') {
        return cameraModule;
      }
    } catch (_e) {
      // ignore
    }
    return null;
  }

  private getInternetModule(): InternetModule | null {
    try {
      const internet = require('LensStudio:InternetModule') as InternetModule;
      if (internet && typeof internet.fetch === 'function') {
        return internet;
      }
    } catch (_e) {
      // ignore
    }
    return null;
  }

  private createStillImageRequest(cameraAsset: CameraModule): CameraModule.ImageRequest {
    const ctor = cameraAsset.constructor as typeof CameraModule;
    if (typeof ctor.createImageRequest === 'function') {
      return ctor.createImageRequest();
    }

    const legacy = require('LensStudio:CameraModule') as unknown;
    const asAny = legacy as { createImageRequest?: () => CameraModule.ImageRequest };
    if (typeof asAny.createImageRequest === 'function') {
      return asAny.createImageRequest();
    }

    throw new Error('CameraModule.createImageRequest unavailable on this target.');
  }
}