import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRound, isRecognized, recordResult, currentPrompt, isOver } from './challenge.js';

test('isRecognized is strict top-1', () => {
  assert.equal(isRecognized('cat', 'cat'), true);
  assert.equal(isRecognized('tree', 'cactus'), false);
});

test('round advances and scores', () => {
  let r = createRound(['cat', 'anvil', 'star'], 20);
  assert.equal(currentPrompt(r), 'cat');
  r = recordResult(r, { won: true, secondsLeft: 13 });   // +13
  assert.equal(currentPrompt(r), 'anvil');
  r = recordResult(r, { won: false, secondsLeft: 0 });    // timeout +0
  r = recordResult(r, { won: true, secondsLeft: 17 });   // +17
  assert.ok(isOver(r));
  assert.deepEqual(r.results.map((x) => x.points), [13, 0, 17]);
  assert.deepEqual(r.results.map((x) => x.target), ['cat', 'anvil', 'star']);
});

test('currentPrompt null when over', () => {
  let r = createRound(['cat']);
  r = recordResult(r, { won: false, secondsLeft: 0 });
  assert.equal(currentPrompt(r), null);
});
