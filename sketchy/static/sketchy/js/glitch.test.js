import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGlitchEngine } from './glitch.js';

function engine(opts) {
  let t = 0;
  const e = createGlitchEngine({
    rng: opts.rng, now: () => t,
    baseP: opts.baseP ?? 0.1, rampPerMin: 0, cooldown: 2, guaranteeMs: 60000,
  });
  return { e, adv: (ms) => { t += ms; } };
}

test('does not fire when rng above baseP', () => {
  const { e } = engine({ rng: () => 0.99, baseP: 0.1 });
  assert.equal(e.roll({}), null);
});

test('fires when rng below baseP and returns an effect', () => {
  const { e } = engine({ rng: () => 0.0, baseP: 0.1 });
  const beat = e.roll({ signals: {} });
  assert.ok(beat && typeof beat.effect === 'string');
});

test('cooldown suppresses immediately-following rolls', () => {
  const { e } = engine({ rng: () => 0.0, baseP: 1 });
  assert.ok(e.roll({ signals: {} }));      // fires
  assert.equal(e.roll({ signals: {} }), null); // cooldown 1
  assert.equal(e.roll({ signals: {} }), null); // cooldown 2
  assert.ok(e.roll({ signals: {} }));      // free again
});

test('guarantee forces a fire after guaranteeMs even with bad rng', () => {
  const { e, adv } = engine({ rng: () => 0.99, baseP: 0.0 });
  assert.equal(e.roll({ signals: {} }), null);
  adv(60001);
  assert.ok(e.roll({ signals: {} }));
});
