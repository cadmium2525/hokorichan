import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRIEND_UNLOCK_XP, HABITATS, SPOT_READY_RATIO, spotDef, TOOLS } from '../src/game/catalog.ts';
import {
  bestTool,
  buyAccessory,
  buyHabitat,
  buyTool,
  canClaimReward,
  clampShape,
  claimReward,
  collectDust,
  createInitialSave,
  createSession,
  dry,
  feed,
  finishSpot,
  friendUnlocked,
  petDisplaySize,
  rankFor,
  requiredCount,
  rollDamp,
  spotStatus,
  startSpot,
  toggleAccessory,
  type SaveData,
} from '../src/game/state.ts';

const save = (patch: Partial<SaveData> = {}): SaveData => ({ ...createInitialSave(), ...patch });
const MIN = 60_000;
const windowSpot = spotDef('window');

test('はじめは素手・勉強机の上・主人公未選択', () => {
  const s = createInitialSave();
  assert.deepEqual(s.tools, ['hand']);
  assert.equal(bestTool(s).id, 'hand');
  assert.equal(s.habitat, 0);
  assert.equal(s.hero, null);
});

test('同じホコリは二度回収できない・範囲外IDは無視', () => {
  const s = createSession(1, windowSpot, 10);
  assert.equal(collectDust(s, 3), true);
  assert.equal(collectDust(s, 3), false);
  assert.equal(collectDust(s, -1), false);
  assert.equal(collectDust(s, 10), false);
  assert.equal(s.collected.size, 1);
});

test('80%の境界：必要数ちょうどで報酬を受け取れ、1つ手前では不可', () => {
  for (const total of [3, 9, 10, 12, 14, 20, 30]) {
    const s = createSession(1, windowSpot, total);
    const need = requiredCount(s);
    assert.ok(need / total >= 0.8 && (need - 1) / total < 0.8, `total=${total} need=${need}`);
    for (let i = 0; i < need - 1; i++) collectDust(s, i);
    assert.equal(canClaimReward(s), false);
    collectDust(s, need - 1);
    assert.equal(canClaimReward(s), true);
  }
});

test('お小遣いは 場所の基本額 + 回収数×2 で、同じセッションで重複獲得できない', () => {
  const s = createSession(1, windowSpot, 10);
  for (let i = 0; i < 9; i++) collectDust(s, i);
  const first = claimReward(save({ coins: 5 }), s);
  assert.ok(first);
  assert.equal(first.reward, windowSpot.rewardBase + 9 * 2);
  assert.equal(first.save.coins, 5 + first.reward);
  assert.equal(first.save.cleanedSessions, 1);
  assert.equal(claimReward(first.save, s), null);
  collectDust(s, 9);
  assert.equal(claimReward(first.save, s), null);
});

test('ホコリは時間で少しずつ積もり、3割未満の場所には入れない', () => {
  const t0 = 1_000_000;
  const started = startSpot(save(), windowSpot, t0);
  assert.ok(started);
  assert.equal(started.dust, windowSpot.maxDust);
  // 直後はまだきれい
  assert.equal(startSpot(started.save, windowSpot, t0), null);
  const regen = windowSpot.regenMinutes * MIN;
  const st = spotStatus(started.save, windowSpot, t0 + regen * 0.1);
  assert.equal(st.ready, false);
  assert.ok(st.minutesToReady > 0);
  const ready = spotStatus(started.save, windowSpot, t0 + regen * SPOT_READY_RATIO);
  assert.equal(ready.ready, true);
  assert.equal(ready.dust, Math.round(windowSpot.maxDust * SPOT_READY_RATIO));
  // 満タンより多くは積もらない
  assert.equal(spotStatus(started.save, windowSpot, t0 + regen * 5).dust, windowSpot.maxDust);
  // 早回し倍率
  assert.equal(spotStatus(started.save, windowSpot, t0 + regen / 60, 60).fullness, 1);
});

test('取り残したホコリはその場所に残る', () => {
  const t0 = 5_000_000;
  const started = startSpot(save(), windowSpot, t0);
  assert.ok(started);
  const left = finishSpot(started.save, windowSpot, 4, t0);
  assert.equal(spotStatus(left, windowSpot, t0).dust, 4);
  assert.equal(spotStatus(left, windowSpot, t0).ready, true);
});

test('道具が足りない場所には入れない（本棚の上はモップ、リビングは掃除機）', () => {
  const t = 0;
  assert.equal(spotStatus(save(), spotDef('shelf'), t).locked, true);
  assert.equal(startSpot(save(), spotDef('shelf'), t), null);
  assert.equal(spotStatus(save({ tools: ['hand', 'mop'] }), spotDef('shelf'), t).locked, false);
  assert.equal(spotStatus(save({ tools: ['hand', 'mop'] }), spotDef('living'), t).locked, true);
  assert.equal(spotStatus(save({ tools: ['hand', 'vacuum'] }), spotDef('living'), t).locked, false);
});

test('掃除用具の購入：所持金不足・二重購入は不可、一番いい道具を使う', () => {
  assert.equal(buyTool(save({ coins: TOOLS.rag.price - 1 }), 'rag').ok, false);
  const r = buyTool(save({ coins: 100 }), 'rag');
  assert.equal(r.ok, true);
  assert.equal(r.save.coins, 100 - TOOLS.rag.price);
  assert.equal(bestTool(r.save).id, 'rag');
  assert.equal(buyTool(r.save, 'rag').ok, false);
  assert.equal(bestTool(save({ tools: ['hand', 'vacuum', 'rag'] })).id, 'vacuum');
});

test('すみか：机(10)→ケース小(30)→中(100)→大(300)、費用どおりで最大の先は買えない', () => {
  let s = save({ coins: 10_000 });
  const caps = [10];
  for (let i = 0; i < 3; i++) {
    const before = s.coins;
    const r = buyHabitat(s);
    assert.equal(r.ok, true);
    assert.equal(before - r.save.coins, HABITATS[r.save.habitat].price);
    s = r.save;
    caps.push(HABITATS[s.habitat].capacity);
  }
  assert.deepEqual(caps, [10, 30, 100, 300]);
  assert.equal(buyHabitat(s).ok, false);
  assert.equal(buyHabitat(save({ coins: HABITATS[1].price - 1 })).ok, false);
});

test('餌やり：容量を超えて与えられず、余りはバッグに残る。見た目が大きくなる', () => {
  const { save: s1, fed } = feed(save({ dustBag: 15, growthXp: 4 }));
  assert.equal(fed, 6);
  assert.equal(s1.growthXp, 10);
  assert.equal(s1.dustBag, 9);
  assert.equal(feed(s1).fed, 0);
  assert.ok(petDisplaySize(10, 0, false) > petDisplaySize(4, 0, false));
  // ケースを買えばまた食べられる
  assert.equal(feed({ ...s1, habitat: 1 }).fed, 9);
});

test('机の上では小さく、ケースに移ると大きく見える。どの住まいでも上限XPで収まる', () => {
  assert.ok(petDisplaySize(10, 0, false) < petDisplaySize(10, 1, false));
  for (const h of [0, 1, 2, 3] as const) {
    assert.ok(petDisplaySize(HABITATS[h].capacity, h, false) <= HABITATS[h].inner * 0.85 + 1e-9);
  }
});

test('湿気：XPと容量は減らず、乾燥で見た目が元に戻る', () => {
  const wet = save({ damp: true, growthXp: 40, habitat: 2 });
  const dried = dry(wet);
  assert.equal(dried.damp, false);
  assert.equal(dried.growthXp, 40);
  assert.equal(dried.habitat, 2);
  assert.ok(petDisplaySize(40, 2, true) < petDisplaySize(40, 2, false));
  assert.equal(rollDamp(() => 0.19), true);
  assert.equal(rollDamp(() => 0.2), false);
});

test('アクセサリー：買うと付き、付け外しは持っているものだけ', () => {
  const r = buyAccessory(save({ coins: 100 }), 'hat');
  assert.equal(r.ok, true);
  assert.equal(r.save.equippedAccessory, 'hat');
  assert.equal(toggleAccessory(r.save, 'hat').equippedAccessory, null);
  assert.equal(toggleAccessory(r.save, 'crown').equippedAccessory, 'hat');
  assert.equal(buyAccessory(save({ coins: 10 }), 'crown').ok, false);
});

test('形は範囲内に丸められる', () => {
  const s = clampShape({ width: 9, height: -1, fluff: Number.NaN });
  assert.equal(s.width, 1.35);
  assert.equal(s.height, 0.7);
  assert.equal(s.fluff, 1);
});

test('ランクの境界値', () => {
  assert.equal(rankFor(19).name, '綿ぼこり級');
  assert.equal(rankFor(20).name, '手のひら級');
  assert.equal(rankFor(50).name, 'ぬいぐるみ級');
  assert.equal(rankFor(100).name, 'お部屋級');
});

test('友だちの家は成長が規定値に達すると解禁され、それまでは掃除できない', () => {
  const room = spotDef('friendRoom');
  const before = save({ growthXp: FRIEND_UNLOCK_XP - 1, habitat: 1 });
  assert.equal(friendUnlocked(before), false);
  assert.equal(spotStatus(before, room, 0).locked, true);
  assert.equal(startSpot(before, room, 0), null);
  const after = save({ growthXp: FRIEND_UNLOCK_XP, habitat: 1 });
  assert.equal(friendUnlocked(after), true);
  assert.equal(spotStatus(after, room, 0).locked, false);
  assert.ok(startSpot(after, room, 0));
});
