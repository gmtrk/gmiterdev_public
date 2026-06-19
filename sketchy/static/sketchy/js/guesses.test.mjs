import { test } from 'node:test';
import assert from 'node:assert/strict';
import { article } from './guesses.js';

test('article picks an before vowel-initial words', () => {
  assert.equal(article('apple'), 'an');
  assert.equal(article('eye'), 'an');
  assert.equal(article('octopus'), 'an');
  assert.equal(article('umbrella'), 'an');
  assert.equal(article('anvil'), 'an');
});

test('article picks a before consonant-initial words', () => {
  assert.equal(article('cat'), 'a');
  assert.equal(article('tree'), 'a');
  assert.equal(article('  star'), 'a'); // trims
});
