/**
 * Minimal one-input bootstrap script for Spectacles setup.
 *
 * Use this first when bringing the lens up on device to avoid crashes from
 * unassigned multi-input components. It validates only apiBaseUrl and logs
 * readiness in Lens Studio Logger.
 */
@component
export class ShelfSenseQuickStart extends BaseScriptComponent {
  @input
  apiBaseUrl: string = '';
  // Set this in Lens Studio Inspector to:
  //   Local dev (preview only): http://localhost:8787/api
  //   Deployed (Spectacles hardware): https://your-project.up.railway.app/api

  onAwake(): void {
    const api = (this.apiBaseUrl ?? '').trim().replace(/\/$/, '');
    if (!api) {
      print('[QuickStart] set apiBaseUrl in Inspector (for example https://your-project.up.railway.app/api)');
      return;
    }
    if (!/^https?:\/\//i.test(api)) {
      print('[QuickStart] apiBaseUrl must include protocol (http:// or https://)');
      return;
    }

    print('[QuickStart] ready - pinch to scan');

    const heartbeat = this.createEvent('UpdateEvent');
    let ticks = 0;
    heartbeat.bind(() => {
      ticks += 1;
      if (ticks % 180 === 0) {
        print(`[QuickStart] active t=${getTime().toFixed(2)}`);
      }
    });
  }
}
