import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CASE_CAPACITY,
  canClaimReward,
  claimReward,
  collectDust,
  createInitialSave,
  createSession,
  dry,
  feed,
  petDisplaySize,
  rankFor,
  requiredCount,
  rollDamp,
  upgradeCase,
  type SaveData,
} from '../src/game/state.ts';

const save = (patch: Partial<SaveData> = {}): SaveData => ({ ...createInitialSave(), ...patch });

test('同じホコリは二度回収できない・範囲外IDは無視', () => {
  const s = createSession(1, 20);
  assert.equal(collectDust(s, 3), true);
  assert.equal(collectDust(s, 3), false);
  assert.equal(collectDust(s, -1), false);
  assert.equal(collectDust(s, 20), false);
  assert.equal(s.collected.size, 1);
});

test('80%の境界：必要数ちょうどで報酬を受け取れ、1つ手前では不可', () => {
  for (const total of [15, 16, 22, 25, 30]) {
    const s = createSession(1, total);
    const need = requiredCount(s);
    assert.ok(need / total >= 0.8 && (need - 1) / total < 0.8, `total=${total} need=${need}`);
    for (let i = 0; i < need - 1; i++) collectDust(s, i);
    assert.equal(canClaimReward(s), false);
    collectDust(s, need - 1);
    assert.equal(canClaimReward(s), true);
  }
});

test('報酬は 基本20 + 回収数×2 で、同じセッションで重複獲得できない', () => {
  const s = createSession(1, 20);
  for (let i = 0; i < 18; i++) collectDust(s, i);
  const first = claimReward(save({ coins: 5 }), s);
  assert.ok(first);
  assert.equal(first.reward, 20 + 18 * 2);
  assert.equal(first.save.coins, 5 + 56);
  assert.equal(first.save.cleanedSessions, 1);
  assert.equal(claimReward(first.save, s), null);
  collectDust(s, 18);
  assert.equal(claimReward(first.save, s), null);
});

test('餌やり：バッグが減りXPが増え、見た目が大きくなる', () => {
  const before = save({ dustBag: 12 });
  const { save: after, fed } = feed(before);
  assert.equal(fed, 12);
  assert.equal(after.dustBag, 0);
  assert.equal(after.growthXp, 12);
  assert.ok(petDisplaySize(after.growthXp, 1, false) > petDisplaySize(before.growthXp, 1, false));
});

test('ケース容量を超えて与えられず、余りはバッグに残る', () => {
  const { save: s1, fed } = feed(save({ dustBag: 50, growthXp: 25 }));
  assert.equal(fed, 5);
  assert.equal(s1.growthXp, CASE_CAPACITY[1]);
  assert.equal(s1.dustBag, 45);
  const again = feed(s1);
  assert.equal(again.fed, 0);
  assert.equal(again.save, s1);
  assert.equal(feed(save({ dustBag: 0 })).fed, 0);
});

test('ケース拡張：費用 80 / 220、足りなければ不可、Lv3で最大', () => {
  assert.equal(upgradeCase(save({ coins: 79 })).ok, false);
  const l2 = upgradeCase(save({ coins: 80 }));
  assert.equal(l2.ok, true);
  assert.equal(l2.save.caseLevel, 2);
  assert.equal(l2.save.coins, 0);
  assert.equal(upgradeCase({ ...l2.save, coins: 219 }).ok, false);
  const l3 = upgradeCase({ ...l2.save, coins: 300 });
  assert.equal(l3.save.caseLevel, 3);
  assert.equal(l3.save.coins, 80);
  assert.equal(upgradeCase({ ...l3.save, coins: 9999 }).ok, false);
  // 拡張後は餌やり再開できる
  assert.equal(feed({ ...l2.save, growthXp: 30, dustBag: 10 }).fed, 10);
});

test('湿気：XPと容量は減らず、乾燥で見た目が元に戻る', () => {
  const wet = save({ damp: true, growthXp: 40, caseLevel: 2 });
  const dried = dry(wet);
  assert.equal(dried.damp, false);
  assert.equal(dried.growthXp, 40);
  assert.equal(dried.caseLevel, 2);
  assert.ok(petDisplaySize(40, 2, true) < petDisplaySize(40, 2, false));
  assert.equal(petDisplaySize(40, 2, false), petDisplaySize(dried.growthXp, dried.caseLevel, dried.damp));
  assert.equal(rollDamp(() => 0.19), true);
  assert.equal(rollDamp(() => 0.2), false);
});

test('ランクの境界値', () => {
  assert.equal(rankFor(0).name, '綿ぼこり級');
  assert.equal(rankFor(19).name, '綿ぼこり級');
  assert.equal(rankFor(20).name, '手のひら級');
  assert.equal(rankFor(49).name, '手のひら級');
  assert.equal(rankFor(50).name, 'ぬいぐるみ級');
  assert.equal(rankFor(100).name, 'お部屋級');
});

test('表示サイズは各ケースの上限XPでもケース内に収まる', () => {
  for (const level of [1, 2, 3] as const) {
    assert.ok(petDisplaySize(CASE_CAPACITY[level], level, false) <= [1.8, 2.5, 3.3][level - 1] * 0.85 + 1e-9);
  }
});
