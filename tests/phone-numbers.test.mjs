import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePhoneNumber, numbersFromRows, parsePhoneNumbers } from '../src/lib/phone-numbers.ts';

test('normalizes Australian and international formats to E.164', () => {
  for (const input of ['0412 345 678', '0412-345-678', '412345678', '+61 412 345 678', '61412345678', '0061412345678', '0412345678.0']) {
    assert.equal(normalizePhoneNumber(input), '+61412345678', input);
  }
  assert.equal(normalizePhoneNumber('+44 7911 123456'), '+447911123456');
  assert.equal(normalizePhoneNumber('(02) 9374 4000'), '+61293744000');
});

test('rejects things that are not phone numbers', () => {
  for (const input of ['', 'Phone', '12345', 'abc0412345678', '+0412345678', '1234567890123456']) {
    assert.equal(normalizePhoneNumber(input), null, input);
  }
});

test('parsePhoneNumbers splits, dedupes and reports invalid entries', () => {
  const result = parsePhoneNumbers('0412345678, +61412345678\n0498 765 432;nonsense\t\n');
  assert.deepEqual(result.numbers, ['+61412345678', '+61498765432']);
  assert.deepEqual(result.invalid, ['nonsense']);
  assert.equal(result.duplicates, 1);
});

test('numbersFromRows finds the phone column and skips names and the header', () => {
  const result = numbersFromRows([
    ['Name', 'Phone', 'Note'],
    ['Sam', '0412345678', 'called 2026'],
    ['Lee', '412345679', ''],
    ['Kim', 'unknown', ''],
    ['Ash', '0412345678', ''],
  ]);
  assert.deepEqual(result.numbers, ['+61412345678', '+61412345679']);
  assert.deepEqual(result.invalid, ['unknown']);
  assert.equal(result.duplicates, 1);
});

test('numbersFromRows returns nothing when no column holds numbers', () => {
  assert.deepEqual(numbersFromRows([['a', 'b'], ['c']]), { numbers: [], invalid: [], duplicates: 0 });
  assert.deepEqual(numbersFromRows([]), { numbers: [], invalid: [], duplicates: 0 });
});
