import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSave, sanitize, SAVE_KEY, writeSave, type StorageLike } from '../src/game/save.ts';
import { createInitialSave, type SaveData } from '../src/game/state.ts';

function memoryStorage(initial?: string): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SAVE_KEY, initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

test('保存して読み込むと同じ内容に戻る', () => {
  const st = memoryStorage();
  const s: SaveData = {
    ...createInitialSave(),
    coins: 123,
    bag: { ...createInitialSave().bag, cotton: 4, pollen: 2 },
    diet: { ...createInitialSave().diet, cotton: 50, sand: 6 },
    rep: 5,
    events: ['town', 'board'],
    requests: [{ id: 3, kind: 'lost', client: 'お母さん', line: 'なくした', spot: 'window', item: 'ring', reward: 50, rep: 2 }],
    requestSeq: 3,
    requestClock: 12345,
    growthXp: 56,
    habitat: 2,
    damp: true,
    tutorialDone: true,
    hero: 'girl',
    tools: ['hand', 'rag'],
    accessories: ['ribbon', 'hat'],
    equippedAccessory: 'hat',
    shape: { width: 1.2, height: 0.8, fluff: 1.5 },
  };
  s.spots.window = { fullness: 0.25, at: 1000 };
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

test('v1のデータはケース・掃除機を持った状態で引き継ぐ', () => {
  const v1 = { version: 1, coins: 50, dustBag: 3, growthXp: 40, caseLevel: 2, damp: false, cleanedSessions: 4, soundEnabled: false, tutorialDone: true };
  const s = sanitize(v1);
  assert.equal(s.version, 5);
  assert.equal(s.bag.cotton, 3);
  assert.equal(s.coins, 50);
  assert.equal(s.growthXp, 40);
  assert.equal(s.habitat, 2);
  assert.deepEqual(s.tools, ['hand', 'vacuum']);
  assert.equal(s.hero, null);
  assert.equal(s.tutorialDone, true);
  assert.equal(s.soundEnabled, false);
});

test('v2のデータはまちの説明・友だちイベントを未読にして引き継ぐ', () => {
  const s = sanitize({ version: 2, coins: 7, dustBag: 9, growthXp: 45, habitat: 1, hero: 'boy', tutorialDone: true });
  assert.equal(s.version, 5);
  assert.equal(s.coins, 7);
  assert.equal(s.growthXp, 45);
  assert.equal(s.hero, 'boy');
  assert.deepEqual(s.events, []);
  assert.equal(s.bag.cotton, 9);
});

test('v3のデータはバッグと食べた量を綿ぼこりとして、既読イベントを引き継ぐ', () => {
  const s = sanitize({ version: 3, coins: 1, dustBag: 12, growthXp: 80, habitat: 2, townIntroDone: true, friendIntroDone: false });
  assert.equal(s.version, 5);
  assert.equal(s.bag.cotton, 12);
  assert.equal(s.diet.cotton, 80);
  assert.deepEqual(s.events, ['town']);
  assert.equal(s.rep, 0);
  assert.deepEqual(s.requests, []);
});

test('未知のバージョンは初期化する', () => {
  assert.deepEqual(sanitize({ version: 99, coins: 500 }), createInitialSave());
  assert.deepEqual(sanitize({ coins: 500 }), createInitialSave());
});

test('不正な値は項目ごとに初期値へ、範囲外は丸める', () => {
  const s = sanitize(
    {
      version: 4,
      coins: -5,
      bag: { cotton: 'many', sand: -3, pollen: 2.9 },
      requests: [{ id: 1, kind: 'collect', client: 'a', line: 'b', dust: 'gold', count: 3 }, { id: 2, kind: 'lost', client: 'a', line: 'b', spot: 'window', item: 'ring', reward: 1e9 }, 'x'],
      events: ['town', 'nope', 'town'],
      growthXp: 12.7,
      habitat: 10,
      damp: 'yes',
      cleanedSessions: Number.POSITIVE_INFINITY,
      hero: 'cat',
      tools: ['vacuum', 'laser', 'vacuum'],
      accessories: 'all',
      equippedAccessory: 'crown',
      shape: { width: 99, height: 'tall' },
      spots: { window: { fullness: 7, at: 9e15 }, washer: 'x' },
    },
    1000,
  );
  assert.equal(s.coins, 0);
  assert.deepEqual(s.bag, { ...createInitialSave().bag, pollen: 2 });
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].reward, 10_000);
  assert.deepEqual(s.events, ['town']);
  assert.equal(s.growthXp, 12);
  assert.equal(s.habitat, 0);
  assert.equal(s.damp, false);
  assert.equal(s.cleanedSessions, 0);
  assert.equal(s.hero, null);
  assert.deepEqual(s.tools, ['hand', 'vacuum']);
  assert.deepEqual(s.accessories, ['ribbon']);
  assert.equal(s.equippedAccessory, null);
  assert.equal(s.shape.width, 1.35);
  assert.equal(s.shape.height, 1);
  // 未来の時刻は今に丸め、積もり具合は0〜1
  assert.deepEqual(s.spots.window, { fullness: 1, at: 1000 });
  assert.deepEqual(s.spots.washer, { fullness: 1, at: 0 });
  assert.equal(sanitize({ version: 4, coins: 1e15 }).coins, 1_000_000_000);
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

test('v4のデータは図鑑を分かっていることから埋め、大会の記録は0から', () => {
  const s = sanitize({
    version: 4,
    tutorialDone: true,
    bag: { pollen: 2 },
    diet: { cotton: 40, sand: 3 },
    rep: 5,
    events: ['town', 'friend', 'street'],
  });
  assert.equal(s.version, 5);
  assert.deepEqual([...s.dex.dust].sort(), ['cotton', 'pollen', 'sand']);
  assert.deepEqual(s.dex.people, ['mother', 'shopkeeper', 'friend', 'friendMom', 'florist', 'baker']);
  assert.deepEqual(s.dex.items, []);
  assert.equal(s.contestBest, 0);
});

test('図鑑と大会記録の不正値は捨てる', () => {
  const s = sanitize({ version: 5, dex: { dust: ['cotton', 'gold', 'cotton'], items: ['ring', 'ufo'], people: 'all' }, contestBest: -3 });
  assert.deepEqual(s.dex, { dust: ['cotton'], items: ['ring'], people: [], fur: [] });
  assert.equal(s.contestBest, 0);
});
