import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSave, sanitize, SAVE_KEY, writeSave, type StorageLike } from '../src/game/save.ts';
import { createInitialSave } from '../src/game/state.ts';

function memoryStorage(initial?: string): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SAVE_KEY, initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

test('保存して読み込むと同じ内容に戻る', () => {
  const st = memoryStorage();
  const s = { ...createInitialSave(), coins: 123, dustBag: 4, growthXp: 56, caseLevel: 2 as const, damp: true, tutorialDone: true };
  assert.equal(writeSave(s, st), true);
  assert.deepEqual(loadSave(st), s);
});

test('データなし・壊れたJSON・ストレージ無しは初期値', () => {
  assert.deepEqual(loadSave(memoryStorage()), createInitialSave());
  assert.deepEqual(loadSave(memoryStorage('{oops')), createInitialSave());
  assert.deepEqual(loadSave(memoryStorage('null')), createInitialSave());
  assert.deepEqual(loadSave(memoryStorage('[1,2]')), createInitialSave());
  assert.deepEqual(loadSave(null), createInitialSave());
});

test('未知のバージョンは初期化する', () => {
  assert.deepEqual(sanitize({ version: 99, coins: 500 }), createInitialSave());
  assert.deepEqual(sanitize({ coins: 500 }), createInitialSave());
});

test('不正な値は項目ごとに初期値へ、範囲外は丸める', () => {
  const s = sanitize({
    version: 1,
    coins: -5,
    dustBag: 'many',
    growthXp: 12.7,
    caseLevel: 4,
    damp: 'yes',
    cleanedSessions: Number.POSITIVE_INFINITY,
    soundEnabled: false,
    tutorialDone: 1,
  });
  assert.equal(s.coins, 0);
  assert.equal(s.dustBag, 0);
  assert.equal(s.growthXp, 12);
  assert.equal(s.caseLevel, 1);
  assert.equal(s.damp, false);
  assert.equal(s.cleanedSessions, 0);
  assert.equal(s.soundEnabled, false);
  assert.equal(s.tutorialDone, false);
  assert.equal(sanitize({ version: 1, coins: 1e15 }).coins, 1_000_000_000);
});

test('読み書きで例外が出てもゲームは止まらない', () => {
  const throwing: StorageLike = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.deepEqual(loadSave(throwing), createInitialSave());
  assert.equal(writeSave(createInitialSave(), throwing), false);
});
