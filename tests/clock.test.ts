import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayPhase, isSleepTime } from '../src/game/clock.ts';

test('時刻から時間帯を決める', () => {
  assert.equal(dayPhase(4.9), 'night');
  assert.equal(dayPhase(5), 'morning');
  assert.equal(dayPhase(8.99), 'morning');
  assert.equal(dayPhase(9), 'day');
  assert.equal(dayPhase(15.9), 'day');
  assert.equal(dayPhase(16), 'evening');
  assert.equal(dayPhase(18.9), 'evening');
  assert.equal(dayPhase(19), 'night');
  assert.equal(dayPhase(23.5), 'night');
  assert.equal(dayPhase(-1), 'night');
});

test('ほこりちゃんは夜10時から朝6時までねむる', () => {
  assert.equal(isSleepTime(21.9), false);
  assert.equal(isSleepTime(22), true);
  assert.equal(isSleepTime(3), true);
  assert.equal(isSleepTime(5.99), true);
  assert.equal(isSleepTime(6), false);
  assert.equal(isSleepTime(12), false);
});
