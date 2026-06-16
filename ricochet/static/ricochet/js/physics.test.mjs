import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAG_GOLDEN, FLAG_CAP_EXEMPT,
  TYPE_NORMAL, TYPE_CLACKER, TYPE_SPLITTER, TYPE_BURSTER,
} from './physics.js';

test('flag constants are distinct power-of-two bits', () => {
  assert.equal(FLAG_GOLDEN, 1);
  assert.equal(FLAG_CAP_EXEMPT, 2);
  assert.equal(FLAG_GOLDEN & FLAG_CAP_EXEMPT, 0);
});

test('type constants are distinct small integers', () => {
  assert.equal(TYPE_NORMAL, 0);
  assert.equal(TYPE_CLACKER, 1);
  assert.equal(TYPE_SPLITTER, 2);
  assert.equal(TYPE_BURSTER, 3);
});
