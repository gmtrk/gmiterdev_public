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

test('defaultSave includes a starter blueprint: Plinko pegs + 1-2 blocks + paddle', () => {
  const s = defaultSave();
  assert.ok(Array.isArray(s.placed.pegs));
  assert.ok(s.placed.pegs.length >= 6, `expected a triangle of pegs, got ${s.placed.pegs.length}`);
  for (const p of s.placed.pegs) {
    assert.equal(typeof p.x, 'number');
    assert.equal(typeof p.y, 'number');
  }
  assert.ok(s.placed.blocks.length >= 1 && s.placed.blocks.length <= 2, 'one or two starter blocks');
  for (const b of s.placed.blocks) {
    assert.equal(typeof b.x, 'number');
    assert.equal(typeof b.y, 'number');
    assert.equal(typeof b.level, 'number');
    assert.equal(b.golden, false);
    // block shape rule: no per-block hw/hh/w/h
    assert.equal(b.w, undefined);
    assert.equal(b.h, undefined);
  }
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

test('serialize/deserialize round-trip preserves a big exact integer', () => {
  const s = defaultSave();
  const big = '9007199254740993'; // 2^53 + 1, not exactly representable as a Number
  s.credits = big;
  const round = deserialize(serialize(s));
  assert.equal(round.credits, big);
});

test('deserialize returns cores/lifetimeCores as numbers from string disk form', () => {
  const s = defaultSave();
  s.cores = 12;
  s.lifetimeCores = 412;
  const round = deserialize(serialize(s));
  assert.equal(round.cores, 12);
  assert.equal(round.lifetimeCores, 412);
});

test('migrate returns defaultSave for corrupt/unknown input', () => {
  const d = defaultSave();
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
  assert.equal(m.credits, '500');
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
  assert.equal(m.credits, '12345');
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
