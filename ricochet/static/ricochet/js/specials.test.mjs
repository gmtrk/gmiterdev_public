import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tickClackCooldowns,
} from './specials.js';
import { buildWorld, spawnSpecial, CLACKER } from './physics.js';
import { defaultSave } from './save.js';
import {
  CLACK_COOLDOWN,
  DT,
} from './config.js';

// Build a fresh, real world from the default save (REAL buildWorld/spawnSpecial).
function freshWorld() {
  return buildWorld(defaultSave());
}

test('tickClackCooldowns decrements each live special toward zero and clamps at 0', () => {
  const w = freshWorld();
  spawnSpecial(w, CLACKER, 500, 50);
  spawnSpecial(w, CLACKER, 520, 50);
  const sp = w.special;
  sp.clackCooldown[0] = CLACK_COOLDOWN; // 0.2
  sp.clackCooldown[1] = 0.05;
  tickClackCooldowns(sp, DT); // dt ~0.0167
  assert.ok(Math.abs(sp.clackCooldown[0] - (CLACK_COOLDOWN - DT)) < 1e-6);
  assert.ok(Math.abs(sp.clackCooldown[1] - (0.05 - DT)) < 1e-6);
  // A big tick drives both below zero -> clamps to 0, never negative.
  tickClackCooldowns(sp, 1);
  assert.equal(sp.clackCooldown[0], 0);
  assert.equal(sp.clackCooldown[1], 0);
});
