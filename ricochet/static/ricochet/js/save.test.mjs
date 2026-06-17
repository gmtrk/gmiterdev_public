import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_VERSION, defaultSave, serialize, deserialize, migrate } from './save.js';
import { STARTING_CREDITS } from './config.js';

test('CURRENT_VERSION is 1', () => {
  assert.equal(CURRENT_VERSION, 1);
});

test('defaultSave has the v1 shape with string credits and empty coresShop', () => {
  const s = defaultSave();
  assert.equal(s.version, 1);
  assert.equal(s.credits, String(STARTING_CREDITS));
  assert.equal(typeof s.credits, 'string');
  assert.equal(s.cores, 0);
  assert.equal(s.lifetimeCores, 0);
  assert.deepEqual(s.upgrades, {});
  assert.deepEqual(s.coresShop, {});
});

test('defaultSave specials are all locked at capacity 0', () => {
  const s = defaultSave();
  for (const t of ['clacker', 'splitter', 'burster']) {
    assert.equal(s.specials[t].unlocked, false, `${t} unlocked`);
    assert.equal(s.specials[t].capacity, 0, `${t} capacity`);
  }
});

test('defaultSave is a minimal cold-open: 2 pegs, no blocks, paddle entry present', () => {
  const s = defaultSave();
  assert.ok(Array.isArray(s.placed.pegs));
  assert.equal(s.placed.pegs.length, 2, `expected exactly 2 starter pegs, got ${s.placed.pegs.length}`);
  for (const p of s.placed.pegs) {
    assert.equal(typeof p.x, 'number');
    assert.equal(typeof p.y, 'number');
  }
  // No blocks at the start — they are bought via the Block Budget upgrade.
  assert.ok(Array.isArray(s.placed.blocks));
  assert.equal(s.placed.blocks.length, 0, 'no starter blocks');
  // The paddle entry carries position/width but is not "owned" — ownership is the
  // paddleWidth upgrade level (world.paddle.present), derived at runtime.
  assert.equal(typeof s.placed.paddle.x, 'number');
  assert.equal(typeof s.placed.paddle.width, 'number');
});

test('defaultSave stats has the three tracked fields', () => {
  const s = defaultSave();
  assert.equal(s.stats.recentEarnRate, 0);
  assert.equal(typeof s.stats.lastSaveTime, 'number');
  assert.equal(s.stats.lastSubmittedCores, 0);
});

test('serialize writes credits/cores/lifetimeCores as strings', () => {
  const s = defaultSave();
  s.credits = '123456';
  s.cores = 7;
  s.lifetimeCores = 42;
  const obj = JSON.parse(serialize(s));
  assert.equal(obj.credits, '123456');
  assert.equal(obj.cores, '7');
  assert.equal(obj.lifetimeCores, '42');
});

test('deserialize returns credits as a runtime Number (CONTRACT line 21)', () => {
  const s = defaultSave();
  s.credits = '123456';
  const round = deserialize(serialize(s));
  assert.equal(round.credits, 123456);
  assert.equal(typeof round.credits, 'number');
});

test('deserialize returns cores/lifetimeCores as numbers from string disk form', () => {
  const s = defaultSave();
  s.cores = 12;
  s.lifetimeCores = 412;
  const round = deserialize(serialize(s));
  assert.equal(round.cores, 12);
  assert.equal(round.lifetimeCores, 412);
});

// The migrate() fallback returns defaultSave() with the runtime numerics coerced
// to Number (the load boundary, CONTRACT line 21). defaultSave() keeps them as
// strings on disk, so the expected fallback shape coerces them.
function defaultRuntimeSave() {
  const d = defaultSave();
  d.credits = Number(d.credits);
  d.cores = Number(d.cores);
  d.lifetimeCores = Number(d.lifetimeCores);
  return d;
}

test('deserialize guards null/empty/corrupt input so migrate falls back to defaults', () => {
  assert.equal(deserialize(null), null);
  assert.equal(deserialize(undefined), null);
  assert.equal(deserialize('{not json'), null);
  assert.deepEqual(migrate(deserialize(null)), defaultRuntimeSave());
});

test('migrate returns defaultSave for corrupt/unknown input', () => {
  const d = defaultRuntimeSave();
  assert.deepEqual(migrate(null), d);
  assert.deepEqual(migrate(undefined), d);
  assert.deepEqual(migrate(42), d);
  assert.deepEqual(migrate('garbage'), d);
  assert.deepEqual(migrate([]), d);
  assert.deepEqual(migrate({}), d); // empty object has no recognizable fields
});

test('migrate backfills a missing coresShop from defaults', () => {
  const partial = {
    version: 1,
    credits: '500',
    cores: 3,
    lifetimeCores: 9,
    upgrades: { globalValueMult: 2 },
    specials: defaultSave().specials,
    placed: defaultSave().placed,
    stats: defaultSave().stats,
    // coresShop intentionally absent
  };
  const m = migrate(partial);
  assert.deepEqual(m.coresShop, {});
  // migrate() coerces the runtime numerics to Number (the load boundary).
  assert.equal(m.credits, 500);
  assert.deepEqual(m.upgrades, { globalValueMult: 2 });
});

test('migrate upgrades a v0-shaped object to v1 and adds coresShop', () => {
  // v0: no version, no coresShop, but has the core run fields
  const v0 = {
    credits: '12345',
    cores: 2,
    lifetimeCores: 5,
    upgrades: { ballCapacity: 4 },
    specials: defaultSave().specials,
    placed: defaultSave().placed,
    stats: { recentEarnRate: 100, lastSaveTime: 111, lastSubmittedCores: 1 },
  };
  const m = migrate(v0);
  assert.equal(m.version, 1);
  assert.deepEqual(m.coresShop, {});
  assert.equal(m.credits, 12345);
  assert.deepEqual(m.upgrades, { ballCapacity: 4 });
  assert.equal(m.stats.recentEarnRate, 100);
});

test('migrate carries an existing coresShop unchanged', () => {
  const s = defaultSave();
  s.coresShop = { globalValueMult: 3, baseCapacity: 1 };
  s.cores = 50;
  const m = migrate(s);
  assert.deepEqual(m.coresShop, { globalValueMult: 3, baseCapacity: 1 });
  assert.equal(m.cores, 50);
});

test('migrate coerces credits/cores/lifetimeCores to JS numbers (load boundary, CONTRACT line 21)', () => {
  // Fresh load: defaultSave keeps strings on disk, but migrate must yield numbers
  // so `state.credits += gained` adds rather than concatenates.
  const fresh = migrate(null);
  assert.equal(typeof fresh.credits, 'number');
  assert.equal(typeof fresh.cores, 'number');
  assert.equal(typeof fresh.lifetimeCores, 'number');

  // A migrated save with string-on-disk numerics is coerced too.
  const m = migrate({
    version: 1,
    credits: '50',
    cores: '3',
    lifetimeCores: '9',
    upgrades: {},
    specials: defaultSave().specials,
    placed: defaultSave().placed,
    stats: defaultSave().stats,
    coresShop: {},
  });
  assert.equal(typeof m.credits, 'number');
  assert.equal(typeof m.cores, 'number');
  assert.equal(typeof m.lifetimeCores, 'number');
  assert.equal(m.credits, 50);
  assert.equal(m.cores, 3);
  assert.equal(m.lifetimeCores, 9);
});

test('migrate backfills missing stats/specials/placed from defaults', () => {
  const partial = {
    version: 1,
    credits: '7',
    cores: 0,
    lifetimeCores: 0,
    upgrades: {},
    coresShop: {},
    // specials, placed, stats all missing
  };
  const m = migrate(partial);
  const d = defaultSave();
  assert.deepEqual(m.specials, d.specials);
  assert.deepEqual(m.placed, d.placed);
  assert.deepEqual(m.stats, d.stats);
});

test('defaultSave includes the round-7 leaderboard/debug fields with defaults', () => {
  const s = defaultSave();
  assert.equal(s.playerId, null);
  assert.equal(s.leaderboardInitials, null);
  assert.equal(s.debugUsed, false);
});

test('serialize+migrate round-trips playerId/leaderboardInitials/debugUsed', () => {
  const s = defaultSave();
  s.playerId = 'p-abc'; s.leaderboardInitials = 'XYZ'; s.debugUsed = true;
  const round = migrate(JSON.parse(serialize(s)));
  assert.equal(round.playerId, 'p-abc');
  assert.equal(round.leaderboardInitials, 'XYZ');
  assert.equal(round.debugUsed, true);
});

test('migrate fills round-7 defaults for an old save missing them', () => {
  const old = { credits: '100', cores: 0, upgrades: {}, placed: {}, specials: {} };
  const m = migrate(old);
  assert.equal(m.playerId, null);
  assert.equal(m.leaderboardInitials, null);
  assert.equal(m.debugUsed, false);
});
