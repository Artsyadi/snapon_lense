/*
 * Node-only tests for shelvesense-lens/src/utils/cooldown.ts.
 */

import { CooldownGate } from '../../../shelvesense-lens/src/utils/cooldown';

describe('lens cooldown.ts', () => {
  it('blocks a second pinch inside the cooldown window', () => {
    // Guards against double-submit regressions that can trigger duplicate API calls from rapid pinch events.
    const gate = new CooldownGate(2200);

    const first = gate.tryEnter(10_000);
    const second = gate.tryEnter(11_000);

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('allows a new pinch once cooldown expires', () => {
    // Guards against stuck cooldown regressions where users cannot rescan after waiting the required interval.
    const gate = new CooldownGate(2200);

    const first = gate.tryEnter(10_000);
    const second = gate.tryEnter(12_500);

    expect(first).toBe(true);
    expect(second).toBe(true);
  });
});
