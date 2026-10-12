import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTEST, CONTEST_REP, CONTEST_XP, FRIEND_UNLOCK_XP, HABITATS, LAND_PRICE, SPOT_READY_RATIO, spotDef, TOOLS, type DustType } from '../src/game/catalog.ts';
import {
  contestDue,
  contestRanking,
  contestResult,
  dexAdd,
  dexProgress,
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
  activeTraits,
  addEvent,
  areaUnlocked,
  bagTotal,
  buyLand,
  canCleanTogether,
  dampChance,
  deliverRequest,
  emptyBag,
  landMeetingDue,
  refreshRequests,
  rollDustTypes,
  type Bag,
  type SaveData,
} from '../src/game/state.ts';
import { createRandom } from '../src/game/rng.ts';

const save = (patch: Partial<SaveData> = {}): SaveData => ({ ...createInitialSave(), ...patch });
const kinds = (n: number): DustType[] => Array.from({ length: n }, () => 'cotton' as const);
const bag = (patch: Partial<Bag>): Bag => ({ ...emptyBag(), ...patch });
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
  const s = createSession(1, windowSpot, kinds(10));
  assert.equal(collectDust(s, 3), 'cotton');
  assert.equal(collectDust(s, 3), null);
  assert.equal(collectDust(s, -1), null);
  assert.equal(collectDust(s, 10), null);
  assert.equal(s.collected.size, 1);
});

test('80%の境界：必要数ちょうどで報酬を受け取れ、1つ手前では不可', () => {
  for (const total of [3, 9, 10, 12, 14, 20, 30]) {
    const s = createSession(1, windowSpot, kinds(total));
    const need = requiredCount(s);
    assert.ok(need / total >= 0.8 && (need - 1) / total < 0.8, `total=${total} need=${need}`);
    for (let i = 0; i < need - 1; i++) collectDust(s, i);
    assert.equal(canClaimReward(s), false);
    collectDust(s, need - 1);
    assert.equal(canClaimReward(s), true);
  }
});

test('お小遣いは 場所の基本額 + 回収数×2 で、同じセッションで重複獲得できない', () => {
  const s = createSession(1, windowSpot, kinds(10));
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
  const { save: s1, fed } = feed(save({ bag: bag({ cotton: 15 }), growthXp: 4 }));
  assert.equal(fed, 6);
  assert.equal(s1.growthXp, 10);
  assert.equal(s1.bag.cotton, 9);
  assert.equal(s1.diet.cotton, 6);
  assert.equal(feed(s1).fed, 0);
  assert.ok(petDisplaySize(10, 0, false) > petDisplaySize(4, 0, false));
  // ケースを買えばまた食べられる
  assert.equal(feed({ ...s1, habitat: 1 }).fed, 9);
});

test('机の上では小さく、ケースに移ると大きく見える。どの住まいでも上限XPで収まる', () => {
  assert.ok(petDisplaySize(10, 0, false) < petDisplaySize(10, 1, false));
  for (const h of [0, 1, 2, 3, 4] as const) {
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

test('種類を選んで餌をあげられ、食べた種類が記録される', () => {
  const s0 = save({ habitat: 2, growthXp: 0, bag: bag({ cotton: 5, pollen: 7 }) });
  const r = feed(s0, 'pollen');
  assert.equal(r.fed, 7);
  assert.equal(r.save.bag.pollen, 0);
  assert.equal(r.save.bag.cotton, 5);
  assert.equal(r.save.diet.pollen, 7);
  assert.equal(feed(r.save, 'pollen').fed, 0);
  const all = feed(s0, 'all');
  assert.equal(all.fed, 12);
  assert.equal(bagTotal(all.save.bag), 0);
});

test('毛並み：割合が15%以上で現れ、一緒の掃除の能力や湿気の確率が変わる', () => {
  assert.deepEqual(activeTraits(bag({ cotton: 10, pollen: 5 })), []); // 食べた量が少ない
  const diet = bag({ cotton: 60, pollen: 20, fur: 10, flour: 30 });
  const traits = activeTraits(diet);
  assert.ok(traits.includes('pollen'));
  assert.ok(traits.includes('flour'));
  assert.ok(!traits.includes('fur')); // 10/120 は 15% 未満
  assert.ok(dampChance(save({ diet })) < dampChance(save()));
});

test('ホコリの種類は場所の割合にしたがう', () => {
  const types = rollDustTypes(spotDef('washer'), 50, createRandom(1));
  assert.ok(types.every((t) => t === 'lint'));
  const mixed = rollDustTypes(spotDef('window'), 400, createRandom(2));
  const sand = mixed.filter((t) => t === 'sand').length / mixed.length;
  assert.ok(sand > 0.5 && sand < 0.7, `sand=${sand}`);
});

test('1章の山場：ケース（大）が満杯で家族会議、空き地を買うとコンテナ（容量1000）に', () => {
  const full = save({ habitat: 3, growthXp: 300, coins: LAND_PRICE });
  assert.equal(landMeetingDue(full), true);
  assert.equal(buyLand(full).ok, false); // 家族会議の前は買えない
  const met = addEvent(full, 'landMeeting');
  assert.equal(landMeetingDue(met), false);
  assert.equal(buyLand({ ...met, coins: LAND_PRICE - 1 }).ok, false);
  const bought = buyLand(met);
  assert.equal(bought.ok, true);
  assert.equal(bought.save.habitat, 4);
  assert.equal(bought.save.coins, 0);
  assert.equal(HABITATS[4].capacity, 1000);
  assert.equal(canCleanTogether(bought.save), true);
  assert.equal(canCleanTogether(full), false);
});

test('商店街は2章から、評判の★で順に紹介される', () => {
  assert.equal(areaUnlocked(save({ habitat: 3, rep: 99 }), 'flower'), false);
  const ch2 = save({ habitat: 4, growthXp: 300 });
  assert.equal(areaUnlocked(ch2, 'flower'), true);
  assert.equal(areaUnlocked(ch2, 'bakery'), false);
  assert.equal(areaUnlocked({ ...ch2, rep: 4 }, 'bakery'), true);
  assert.equal(areaUnlocked({ ...ch2, rep: 7 }, 'grandma'), false);
  assert.equal(areaUnlocked({ ...ch2, rep: 8 }, 'grandma'), true);
});

test('依頼は時間で届き最大3件。種類指定はバッグのホコリをわたして報酬と評判', () => {
  const rnd = createRandom(3);
  const t0 = 10_000_000;
  let s = refreshRequests(save(), t0, rnd);
  assert.equal(s.requests.length, 2); // 最初は2件すぐ届く
  s = refreshRequests(s, t0 + 1000, rnd);
  assert.equal(s.requests.length, 2);
  s = refreshRequests(s, t0 + 20 * 60_000, rnd);
  assert.equal(s.requests.length, 3);
  s = refreshRequests(s, t0 + 999 * 60_000, rnd);
  assert.equal(s.requests.length, 3); // ためすぎない
  const ids = s.requests.map((r) => r.id);
  assert.equal(new Set(ids).size, 3);

  const req = { id: 99, kind: 'collect' as const, client: 'x', line: 'y', dust: 'sand' as const, count: 5, reward: 30, rep: 1 };
  const withReq = { ...save({ bag: bag({ sand: 4 }) }), requests: [req] };
  assert.equal(deliverRequest(withReq, 99), null); // 足りない
  const done = deliverRequest({ ...withReq, bag: bag({ sand: 6 }) }, 99);
  assert.ok(done);
  assert.equal(done.save.bag.sand, 1);
  assert.equal(done.save.coins, 30);
  assert.equal(done.save.rep, 1);
  assert.equal(done.save.requests.length, 0);
});

test('大会のおしらせは2章・成長・評判がそろってから一度だけ', () => {
  const base = { ...createInitialSave(), habitat: 4 as const, growthXp: CONTEST_XP, rep: CONTEST_REP };
  assert.equal(contestDue(base), true);
  assert.equal(contestDue({ ...base, habitat: 3 }), false);
  assert.equal(contestDue({ ...base, growthXp: CONTEST_XP - 1 }), false);
  assert.equal(contestDue({ ...base, rep: CONTEST_REP - 1 }), false);
  assert.equal(contestDue(addEvent(base, 'contestNotice')), false);
});

test('大会：同点ではライバルが上、超えれば優勝。初優勝だけ評判が増える', () => {
  const top = Math.max(...CONTEST.rivals.map((r) => r.score));
  assert.equal(contestRanking(top)[0].you, false);
  assert.equal(contestRanking(top + 1)[0].you, true);
  const s0 = { ...createInitialSave(), coins: 10, rep: 8 };
  const lose = contestResult(s0, 0);
  assert.equal(lose.rank, 4);
  assert.equal(lose.save.coins, 10 + CONTEST.prizes[3]);
  assert.equal(lose.won, false);
  const win = contestResult(s0, top + 1);
  assert.equal(win.rank, 1);
  assert.equal(win.firstWin, true);
  assert.equal(win.save.rep, 8 + CONTEST.winRep);
  assert.equal(win.save.contestBest, top + 1);
  assert.ok(win.save.events.includes('contestWon'));
  const again = contestResult(win.save, top + 2);
  assert.equal(again.firstWin, false);
  assert.equal(again.save.rep, win.save.rep);
  assert.equal(again.best, true);
  // 範囲外の点数は丸める
  assert.equal(contestResult(s0, 9999).save.contestBest, CONTEST.maxScore);
});

test('図鑑は同じものを二度載せない', () => {
  let s = createInitialSave();
  const a = dexAdd(s, 'dust', 'pollen');
  assert.equal(a.added, true);
  s = a.save;
  const b = dexAdd(s, 'dust', 'pollen');
  assert.equal(b.added, false);
  assert.equal(b.save, s);
  s = dexAdd(s, 'people', 'grandma').save;
  assert.deepEqual(dexProgress(s).dust, [1, 6]);
  assert.equal(dexProgress(s).people[0], 1);
});
