import { fetchJson } from './utils/network';
import type { Delayer } from './utils/network';
import type { HealthProfile, LabelAnalysis } from './types';

/**
 * ShelfSenseQuickStart - connectivity-first bootstrap.
 *
 * It waits a short delay after lens start and sends one backend request
 * without pinch/camera dependencies to verify Spectacles -> Railway -> backend.
 */
@component
export class ShelfSenseQuickStart extends BaseScriptComponent {
  @input
  apiBaseUrl: string = '';

  private readonly autoScanDelaySeconds = 10;
  private hasScanned = false;
  private startTime = 0;

  private delayer: Delayer = (ms) =>
    new Promise((resolve) => {
      const ev = this.createEvent('DelayedCallbackEvent');
      ev.bind(() => resolve());
      ev.reset(ms / 1000);
    });

  onAwake(): void {
    const api = (this.apiBaseUrl ?? '').trim().replace(/\/$/, '');
    if (!api || !/^https?:\/\//i.test(api)) {
      print('[QuickStart] ERROR: set a valid apiBaseUrl in the Inspector');
      return;
    }

    this.startTime = getTime();
    print(`[QuickStart] ready - will auto-scan in ${this.autoScanDelaySeconds} seconds`);
    print(`[QuickStart] api = ${api}`);

    const update = this.createEvent('UpdateEvent');
    update.bind(() => {
      if (this.hasScanned) {
        return;
      }

      const elapsed = getTime() - this.startTime;
      if (elapsed >= this.autoScanDelaySeconds) {
        this.hasScanned = true;
        void this.sendTestRequest(api);
      }
    });
  }

  private async sendTestRequest(api: string): Promise<void> {
    print('[QuickStart] firing test request to backend...');

    const internet = this.getInternetModule();
    if (!internet) {
      print('[QuickStart] ERROR: InternetModule unavailable');
      print('[QuickStart] check Internet capability in Project Settings');
      return;
    }

    const demoProfile: HealthProfile = {
      cholesterol: 'normal',
      bloodSugar: 'borderline',
      allergies: ['peanut'],
      sodiumSensitivity: 'limit',
      sugarSensitivity: 'limit',
      deficiencies: [],
      dietaryConstraints: [],
      notes: 'QuickStart connectivity test - tiny placeholder image',
    };

    // Valid 1x1 PNG base64 used to test end-to-end backend path without camera capture.
    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNgYGBgAAAABAAB9hc4VQAAAABJRU5ErkJggg==';

    try {
      const { json } = await fetchJson<LabelAnalysis>(
        internet,
        api,
        {
          path: '/analyze-label',
          body: {
            imageBase64: tinyPngBase64,
            imageMimeType: 'image/png',
            healthProfile: demoProfile,
          },
          maxRetries: 1,
        },
        this.delayer,
      );

      print('----------------------------------');
      print(`[QuickStart] VERDICT : ${json.verdict}`);
      print(`[QuickStart] REASON  : ${json.reason}`);
      print('[QuickStart] SUCCESS - network path is working!');
      print('----------------------------------');
    } catch (err) {
      print(`[QuickStart] network error: ${String(err)}`);
      print('[QuickStart] check Internet capability and allow-listed domain');
    }
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
}
