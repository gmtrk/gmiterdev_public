import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORES_UPGRADES } from './config.js';
import { buildWorld } from './physics.js';
import { upgradeCost } from './economy.js';
import { buyCoresUpgrade, coresOfflineBonuses } from './coresshop.js';

function freshState() {
  return {
    version: 1,
    credits: 0,
    cores: 1000,
    lifetimeCores: 1000,
    upgrades: {},
    specials: {
      clacker: { unlocked: false, capacity: 0 },
      splitter: { unlocked: false, capacity: 0 },
      burster: { unlocked: false, capacity: 0 },
    },
    coresShop: {},
    placed: { pegs: [], blocks: [], paddle: { x: 500, width: 120 } },
    stats: { recentEarnRate: 0, lastSaveTime: 0, lastSubmittedCores: 0 },
  };
}

test('coresOfflineBonuses reads derived offline numbers off the world (values, not functions)', () => {
  const state = freshState();
  const world = buildWorld(state);
  const bonuses = coresOfflineBonuses(world);
  assert.equal(typeof bonuses.efficiencyAdd, 'number');
  assert.equal(typeof bonuses.capAdd, 'number');
  // With an empty coresShop the additive offline bonuses are 0.
  assert.equal(bonuses.efficiencyAdd, 0);
  assert.equal(bonuses.capAdd, 0);
});

test('buying an offline-group Cores level makes coresOfflineBonuses non-zero', () => {
  const offDef = CORES_UPGRADES.find((u) => u.group === 'offline');
  assert.ok(offDef, 'expected at least one offline-group cores-upgrade in CORES_UPGRADES');
  const state = freshState();
  const world = buildWorld(state);
  assert.equal(coresOfflineBonuses(world).efficiencyAdd + coresOfflineBonuses(world).capAdd, 0);
  const ok = buyCoresUpgrade(world, state, offDef.id);
  assert.equal(ok, true, 'the offline level is affordable with 1000 cores');
  const bonuses = coresOfflineBonuses(world);
  // The bought offline lever now contributes a positive additive bonus on the world.
  assert.ok(bonuses.efficiencyAdd + bonuses.capAdd > 0, 'an offline lever bonus becomes non-zero after buying');
});

test('buyCoresUpgrade spends cores, writes state.coresShop, and re-derives world', () => {
  const def = CORES_UPGRADES.find((u) => u.group === 'power');
  assert.ok(def, 'expected at least one power cores-upgrade in CORES_UPGRADES');
  const state = freshState();
  const world = buildWorld(state);
  const multBefore = world.globalValueMult;
  const coresBefore = state.cores;
  const cost = upgradeCost(def, 0);

  const ok = buyCoresUpgrade(world, state, def.id);
  assert.equal(ok, true);
  assert.equal(state.coresShop[def.id], 1);            // level written to state.coresShop
  assert.equal(state.cores, coresBefore - cost);       // cores spent
  // permanent global ×mult read off world.globalValueMult (a value), now larger
  assert.ok(world.globalValueMult > multBefore, 'permanent mult should grow after a power buy');
});

test('buyCoresUpgrade refuses when cores are insufficient (no state mutation)', () => {
  const def = CORES_UPGRADES.find((u) => u.group === 'power');
  const state = freshState();
  state.cores = 0;
  const world = buildWorld(state);
  const ok = buyCoresUpgrade(world, state, def.id);
  assert.equal(ok, false);
  assert.equal(state.coresShop[def.id], undefined);
  assert.equal(state.cores, 0);
});

test('buyCoresUpgrade returns false for an unknown id', () => {
  const state = freshState();
  const world = buildWorld(state);
  assert.equal(buyCoresUpgrade(world, state, 'no-such-cores-upgrade'), false);
});
