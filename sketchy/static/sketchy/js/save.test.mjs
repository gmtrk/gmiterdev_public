import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, mergeSave } from './save.js';

test('defaultSave shape', () => {
  assert.deepEqual(defaultSave(), { playerId: '', initials: '', bestPoints: 0 });
});

test('mergeSave backfills missing fields', () => {
  assert.deepEqual(mergeSave({ bestPoints: 40 }), { playerId: '', initials: '', bestPoints: 40 });
  assert.deepEqual(mergeSave(null), defaultSave());
  assert.equal(mergeSave({ bestPoints: 'x' }).bestPoints, 0);
});
