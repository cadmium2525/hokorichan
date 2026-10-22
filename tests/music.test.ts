import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bgmFor, type MusicContext } from '../src/game/music.ts';

const base: MusicContext = { mode: 'HOME', contest: false, sleepy: false, finale: false };

test('場面ごとの曲', () => {
  assert.equal(bgmFor(base), 'home');
  assert.equal(bgmFor({ ...base, sleepy: true }), 'night');
  assert.equal(bgmFor({ ...base, mode: 'TOWN' }), 'town');
  assert.equal(bgmFor({ ...base, mode: 'CLEANING' }), 'cleaning');
  assert.equal(bgmFor({ ...base, mode: 'CLEANING', contest: true }), 'contest');
  assert.equal(bgmFor({ ...base, mode: 'GALAXY' }), 'galaxy');
  assert.equal(bgmFor({ ...base, mode: 'BOOT' }), 'home');
});

test('結果画面は曲を変えない・おしまいは何より優先', () => {
  assert.equal(bgmFor({ ...base, mode: 'RESULT' }), null);
  assert.equal(bgmFor({ ...base, mode: 'RESULT', finale: true }), 'finale');
  assert.equal(bgmFor({ ...base, sleepy: true, finale: true }), 'finale');
});
