import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber } from './numfmt.js';

test('plain integers below 1000 are unsuffixed', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(7), '7');
  assert.equal(formatNumber(42), '42');
  assert.equal(formatNumber(999), '999');
});

test('contract suffix-table boundaries', () => {
  assert.equal(formatNumber(1234), '1.2K');
  assert.equal(formatNumber(8.1e6), '8.1M');
  assert.equal(formatNumber(3.7e9), '3.7B');
  assert.equal(formatNumber(1.2e12), '1.2T');
  assert.equal(formatNumber(4.5e15), '4.5Qa');
});

test('scientific (lowercased toExponential(1)) at and beyond 1e18', () => {
  assert.equal(formatNumber(1e18), '1.0e18');
  assert.equal(formatNumber(1e21), '1.0e21');
});

test('exact suffix thresholds round-trip', () => {
  assert.equal(formatNumber(1000), '1.0K');
  assert.equal(formatNumber(1e6), '1.0M');
  assert.equal(formatNumber(1e9), '1.0B');
  assert.equal(formatNumber(1e12), '1.0T');
  assert.equal(formatNumber(1e15), '1.0Qa');
});

test('negative numbers keep their sign', () => {
  assert.equal(formatNumber(-1234), '-1.2K');
  assert.equal(formatNumber(-999), '-999');
  assert.equal(formatNumber(-1e18), '-1.0e18');
});

test('never returns NaN/undefined/null for junk input', () => {
  assert.equal(formatNumber(NaN), '0');
  assert.equal(formatNumber(undefined), '0');
  assert.equal(formatNumber(null), '0');
  assert.equal(formatNumber(Infinity), '0');
  assert.equal(formatNumber(-Infinity), '0');
});

test('one decimal place under each suffix', () => {
  assert.equal(formatNumber(1500), '1.5K');
  assert.equal(formatNumber(12345), '12.3K');
  assert.equal(formatNumber(123456), '123.5K');
});
