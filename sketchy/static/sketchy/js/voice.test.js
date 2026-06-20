import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLine, runnerUps } from './voice.js';

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('empty topk → prompt to draw', () => {
  assert.match(pickLine([], { rng: () => 0 }), /draw something/i);
});

test('high confidence line includes word, percent, grammatical article', () => {
  const line = pickLine([{ label: 'owl', prob: 0.87 }], { rng: () => 0 });
  assert.match(line, /\b87%/);
  assert.match(line, /\bowl\b/);
  assert.match(line, /\ban owl\b/); // vowel → "an"
});

test('low confidence uses a sheepish line', () => {
  const line = pickLine([{ label: 'blob', prob: 0.19 }], { rng: () => 0 });
  assert.match(line, /19%/);
  assert.match(line, /a blob/);
});

test('rng selects different templates deterministically', () => {
  const a = pickLine([{ label: 'cat', prob: 0.9 }], { rng: seq([0]) });
  const b = pickLine([{ label: 'cat', prob: 0.9 }], { rng: seq([0.99]) });
  assert.notEqual(a, b);
});

test('runnerUps skips the top guess and formats percents', () => {
  const r = runnerUps([{ label: 'cat', prob: 0.8 }, { label: 'rabbit', prob: 0.42 }, { label: 'bear', prob: 0.31 }], 2);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { label: 'rabbit', pct: 42 });
  assert.deepEqual(r[1], { label: 'bear', pct: 31 });
});
