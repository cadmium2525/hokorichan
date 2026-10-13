import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EARTH_WRAP_XP, WORLD, FUR_IDS, furId, furName, RAINY, SPOTS, CONTEST, CONTEST_MAX, DUST_TYPES, SKY, CONTEST_REP, CONTEST_XP, FRIEND_UNLOCK_XP, HABITATS, LAND_PRICE, SPOT_READY_RATIO, spotDef, TOOLS, type DustType } from '../src/game/catalog.ts';
import {
  canFly,
  canWorld,
  earthWrapDue,
  finishWorld,
  moveToHill,
  worldHoldSeconds,
  worldLetterDue,
  worldPatches,
  worldReward,
  furOf,
  canDeliverRainy,
  cityTownDue,
  deliverRainy,
  rainyActive,
  rainyDue,
  skyBlocked,
  skySpeedMul,
  chapter,
  nextHabitat,
  contestDue,
  finishSky,
  skyClouds,
  skyRadiusMul,
  skyReward,
  speedSeconds,
  warehouseDue,
  contestRanking,
  contestResult,
  contestWaitMinutes,
  enterContest,
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
  assert.ok(petDisplaySize(10, 0, false) <= petDisplaySize(10, 1, false));
  assert.ok(petDisplaySize(30, 1, false) > petDisplaySize(10, 0, false));
  for (const h of [0, 1, 2, 3, 4, 5] as const) {
    assert.ok(petDisplaySize(HABITATS[h].capacity, h, false) <= HABITATS[h].inner * 0.85 + 1e-9);
  }
});

test('すみかがいっぱいになるまで、成長するほどずっと大きくなる。引っこしても小さくならない', () => {
  for (const h of [0, 1, 2, 3, 4, 5] as const) {
    const from = h === 0 ? 0 : HABITATS[(h - 1) as 0].capacity;
    const to = HABITATS[h].capacity;
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const size = petDisplaySize(from + ((to - from) * i) / 10, h, false);
      assert.ok(size > prev, `habitat ${h} step ${i}`);
      prev = size;
    }
    // 最後の1割でもはっきり大きくなる（頭打ちにならない）
    const nearEnd = petDisplaySize(from + (to - from) * 0.9, h, false);
    assert.ok(prev - nearEnd > (prev - petDisplaySize(from, h, false)) * 0.05, `habitat ${h} keeps growing`);
    if (h > 0) assert.ok(petDisplaySize(from, h, false) >= petDisplaySize(from, (h - 1) as 0, false) - 1e-9, `move ${h}`);
  }
  // 横長にしてもはみ出さない
  assert.ok(petDisplaySize(300, 3, false, { width: 1.35, height: 1, fluff: 1 }) * 1.35 <= HABITATS[3].inner * 0.85);
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

test('大会：同点ではライバルが上、超えれば優勝。初優勝だけごほうびと評判', () => {
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
  assert.equal(win.prize, CONTEST.prizes[0] + CONTEST.firstWinBonus);
  assert.equal(win.save.rep, 8 + CONTEST.winRep);
  assert.equal(win.save.contestBest, top + 1);
  assert.ok(win.save.events.includes('contestWon'));
  const again = contestResult(win.save, top + 2);
  assert.equal(again.firstWin, false);
  assert.equal(again.prize, CONTEST.prizes[0]);
  assert.equal(again.save.rep, win.save.rep);
  assert.equal(again.best, true);
  // 満点より多い点数は丸める
  assert.equal(contestResult(s0, 9999).save.contestBest, CONTEST_MAX);
});

test('大会は出ると次の大会まで待つ（途中でやめても同じ）', () => {
  const MIN = 60_000;
  const s0 = addEvent(createInitialSave(), 'contestNotice');
  assert.equal(enterContest(createInitialSave(), 0).ok, false);
  const a = enterContest(s0, 1000 * MIN);
  assert.equal(a.ok, true);
  assert.equal(contestWaitMinutes(a.save, 1000 * MIN), CONTEST.cooldownMinutes);
  assert.equal(enterContest(a.save, 1010 * MIN).ok, false);
  assert.equal(contestWaitMinutes(a.save, 1010 * MIN), CONTEST.cooldownMinutes - 10);
  assert.equal(enterContest(a.save, (1000 + CONTEST.cooldownMinutes) * MIN).ok, true);
});

test('大会の満点は風の回数ぶんの合計で、ライバルは満点に届かない', () => {
  assert.equal(CONTEST_MAX, CONTEST.waves.reduce((s, w) => s + w.count, 0));
  assert.ok(Math.max(...CONTEST.rivals.map((r) => r.score)) < CONTEST_MAX);
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
  assert.deepEqual(dexProgress(s).dust, [1, DUST_TYPES.length]);
  assert.equal(dexProgress(s).people[0], 1);
});

test('3章：清掃係になってコンテナがいっぱいになると倉庫の手紙。手紙のあとでだけ倉庫を買える', () => {
  const base = { ...createInitialSave(), habitat: 4 as const, growthXp: HABITATS[4].capacity, coins: 5000, rep: 50 };
  assert.equal(warehouseDue(base), false);
  const won = addEvent(base, 'contestWon');
  assert.equal(warehouseDue(won), true);
  assert.equal(warehouseDue({ ...won, growthXp: HABITATS[4].capacity - 1 }), false);
  assert.equal(nextHabitat(won), null);
  const letter = addEvent(won, 'warehouseLetter');
  assert.equal(warehouseDue(letter), false);
  assert.deepEqual(nextHabitat(letter), { level: 5, price: HABITATS[5].price });
  const bought = buyHabitat(letter);
  assert.equal(bought.ok, true);
  assert.equal(bought.save.habitat, 5);
  assert.equal(bought.save.coins, 5000 - HABITATS[5].price);
  assert.equal(chapter(bought.save), 3);
  assert.equal(canFly(bought.save), true);
  assert.equal(nextHabitat(bought.save), null);
});

test('空の雲は飛ぶと減り、時間で満タンまで戻る', () => {
  const MIN = 60_000;
  const s0 = { ...createInitialSave(), habitat: 5 as const };
  assert.equal(skyClouds(s0, 0), SKY.maxClouds);
  const s1 = finishSky(s0, 0, 100 * MIN);
  assert.equal(skyClouds(s1, 100 * MIN), 0);
  assert.equal(skyClouds(s1, (100 + SKY.regenMinutes / 2) * MIN), SKY.maxClouds / 2);
  assert.equal(skyClouds(s1, (100 + SKY.regenMinutes * 3) * MIN), SKY.maxClouds);
  assert.equal(skyReward(3), 3 * SKY.coinPerCloud);
  assert.equal(skyReward(-1), 0);
});

test('黄砂をたくさん食べると空で吸い込む範囲が広がる', () => {
  const s0 = createInitialSave();
  assert.equal(skyRadiusMul(s0), 1);
  const s1 = { ...s0, diet: { ...s0.diet, cotton: 60, kosa: 40 } };
  assert.ok(skyRadiusMul(s1) > 1);
});

test('章が進むとアクセサリーが入荷する（前の章では買えない）', () => {
  const rich = { ...createInitialSave(), coins: 10_000 };
  assert.equal(buyAccessory(rich, 'bandana').ok, false);
  assert.equal(buyAccessory({ ...rich, habitat: 4 as const }, 'bandana').ok, true);
  assert.equal(buyAccessory({ ...rich, habitat: 4 as const }, 'goggles').ok, false);
  assert.equal(buyAccessory({ ...rich, habitat: 5 as const }, 'goggles').ok, true);
});

test('早さの依頼の制限時間は15秒前後（短すぎず長すぎず）', () => {
  for (const spot of SPOTS) {
    const vac = speedSeconds(spot, TOOLS.vacuum);
    assert.ok(vac >= 12 && vac <= 18, `${spot.id}: ${vac}`);
    assert.ok(speedSeconds(spot, TOOLS.hand) > vac);
  }
});

test('3章：空を飛んだあと駅と学校が開き、育つと梅雨。届けると梅雨明け', () => {
  let s: SaveData = { ...createInitialSave(), habitat: 5, growthXp: 1200 };
  assert.equal(cityTownDue(s), false);
  s = addEvent(s, 'sky');
  assert.equal(cityTownDue(s), true);
  assert.equal(areaUnlocked(s, 'station'), false);
  s = addEvent(s, 'cityTown');
  assert.equal(areaUnlocked(s, 'station'), true);
  assert.equal(areaUnlocked(s, 'school'), true);
  assert.equal(rainyDue(s), false);
  s = { ...s, growthXp: RAINY.xp };
  assert.equal(rainyDue(s), true);
  s = addEvent(s, 'rainy');
  assert.equal(rainyActive(s), true);
  assert.equal(skyBlocked(s), true);
  assert.equal(dampChance(s), 1);
  assert.equal(canDeliverRainy(s), false);
  const bag = { ...s.bag };
  for (const [t, n] of Object.entries(RAINY.need)) bag[t as keyof typeof bag] = (n ?? 0) + 3;
  s = { ...s, bag, coins: 10, rep: 20 };
  assert.equal(canDeliverRainy(s), true);
  const r = deliverRainy(s);
  assert.equal(r.ok, true);
  assert.equal(rainyActive(r.save), false);
  assert.equal(skyBlocked(r.save), false);
  assert.equal(r.save.coins, 10 + RAINY.reward);
  assert.equal(r.save.rep, 20 + RAINY.rep);
  assert.ok(r.save.accessories.includes('rainhat'));
  for (const [t] of Object.entries(RAINY.need)) assert.equal(r.save.bag[t as keyof typeof bag], 3);
  assert.equal(deliverRainy(r.save).ok, false);
  // ごほうびのアクセサリーはお店では買えない
  assert.equal(buyAccessory({ ...s, coins: 9999 }, 'rainhat').ok, false);
});

test('チョークの粉を食べると空を速く飛べる', () => {
  const s0 = createInitialSave();
  assert.equal(skySpeedMul(s0), 1);
  assert.ok(skySpeedMul({ ...s0, diet: { ...s0.diet, cotton: 60, chalk: 40 } }) > 1);
});

test('毛並み図鑑：ランクが上がるときに、そのランクのあいだに食べたホコリで毛並みが決まる', () => {
  // 綿ぼこり級（0〜19）を、砂ぼこり12・綿ぼこり8で終える → まじり毛並み
  let s: SaveData = { ...createInitialSave(), habitat: 2, bag: { ...emptyBag(), sand: 12, cotton: 20 } };
  let r = feed(s, 'sand');
  assert.equal(r.furs.length, 0);
  r = feed(r.save, 'cotton');
  assert.equal(r.furs.length, 1);
  assert.equal(r.furs[0].fur, furId('sand', 'cotton'));
  assert.equal(r.furs[0].rank, '綿ぼこり級');
  assert.equal(r.furs[0].isNew, true);
  assert.deepEqual(r.save.dex.fur, [furId('cotton', 'sand')]);
  // 境目をこえた残り（綿ぼこり12）は次のランクの分になる
  assert.equal(r.save.rankDiet.cotton, 12);
  assert.equal(r.save.rankDiet.sand, 0);
  // 1種類が7割以上なら「純」
  assert.equal(furOf({ ...emptyBag(), pollen: 8, cotton: 2 }), 'pure:pollen');
  assert.equal(furOf(emptyBag()), null);
  // 名前
  assert.equal(furName('pure:cotton'), '純わたぐも毛並み');
  assert.equal(furName(furId('soot', 'pollen')), 'いぶしひまわり毛並み');
  assert.equal(FUR_IDS.length, DUST_TYPES.length + (DUST_TYPES.length * (DUST_TYPES.length - 1)) / 2);
  assert.equal(new Set(FUR_IDS).size, FUR_IDS.length);
});

test('4章：倉庫がいっぱいで世界ほこり機構→丘へ。地域は使うと減り時間で戻る。丘いっぱいで山場', () => {
  const MIN = 60_000;
  let s: SaveData = addEvent({ ...createInitialSave(), habitat: 5, growthXp: 5000, rep: 50 }, 'rainyDone');
  assert.equal(worldLetterDue(s), true);
  assert.equal(worldLetterDue({ ...s, growthXp: 4999 }), false);
  s = moveToHill(s);
  assert.equal(s.habitat, 6);
  assert.equal(chapter(s), 4);
  assert.equal(canWorld(s), true);
  assert.equal(worldLetterDue(s), false);
  assert.equal(worldPatches(s, 0), WORLD.maxPatches);
  s = finishWorld(s, 0, 10 * MIN);
  assert.equal(worldPatches(s, 10 * MIN), 0);
  assert.equal(worldPatches(s, (10 + WORLD.regenMinutes) * MIN), WORLD.maxPatches);
  assert.equal(worldReward(4), 4 * WORLD.coinPerPatch);
  assert.ok(worldHoldSeconds({ ...s, diet: { ...s.diet, cotton: 50, ash: 50 } }) < worldHoldSeconds(s));
  assert.equal(earthWrapDue(s), false);
  assert.equal(earthWrapDue({ ...s, growthXp: EARTH_WRAP_XP }), true);
  assert.equal(rankFor(EARTH_WRAP_XP).name, '地球級');
});

import { pushOutOfBlockers } from '../src/game/geometry.ts';

test('家具の中の点は、いちばん近いふちの外へ押し出される', () => {
  const b = [{ minX: 0, maxX: 2, minZ: 0, maxZ: 1 }];
  assert.deepEqual(pushOutOfBlockers(0.2, 0.5, 0, b), { x: 0, z: 0.5 });
  assert.deepEqual(pushOutOfBlockers(1.9, 0.5, 0.1, b), { x: 2.1, z: 0.5 });
  assert.deepEqual(pushOutOfBlockers(1, 0.9, 0, b), { x: 1, z: 1 });
  // 外の点はそのまま
  assert.deepEqual(pushOutOfBlockers(3, 3, 0.2, b), { x: 3, z: 3 });
});

test('5章：宇宙ほこり管制センターの連絡から月のとなりへ', async () => {
  const { spaceLetterDue, moveToSpace, chapter, canSpace, spaceClusters, finishSpace, spaceReward, solarDue, spaceCenter, addEvent, createInitialSave } = await import('../src/game/state.ts');
  const { SPACE, SOLAR_XP, HABITATS } = await import('../src/game/catalog.ts');
  let s: ReturnType<typeof createInitialSave> = { ...createInitialSave(), habitat: 6, growthXp: 30000, rep: 100 };
  assert.equal(spaceLetterDue(s), false);
  s = addEvent(s, 'earthWrap');
  assert.equal(spaceLetterDue(s), true);
  const moved = moveToSpace(s);
  assert.equal(moved.habitat, 7);
  assert.equal(chapter(moved), 5);
  assert.equal(canSpace(moved), true);
  assert.equal(spaceLetterDue(moved), false);
  assert.equal(HABITATS[7].capacity, SOLAR_XP);
  // 群れは時間で戻る
  const now = 1_000_000_000;
  const after = finishSpace(moved, 0, now);
  assert.equal(spaceClusters(after, now), 0);
  assert.equal(spaceClusters(after, now + SPACE.regenMinutes * 60_000), SPACE.maxClusters);
  assert.equal(spaceReward(3), 3 * SPACE.coinPerCluster);
  assert.equal(spaceCenter(moved), 'jupiter');
  assert.equal(spaceCenter({ ...moved, growthXp: 60000 }), 'sun');
  assert.equal(solarDue({ ...moved, growthXp: SOLAR_XP }), true);
  assert.equal(solarDue(addEvent({ ...moved, growthXp: SOLAR_XP }, 'solar')), false);
});

test('軌道は内側ほど速く回る', async () => {
  const { orbitOmega, ORBIT_MIN, ORBIT_MAX } = await import('../src/game/orbit.ts');
  assert.ok(orbitOmega(ORBIT_MIN) > orbitOmega(ORBIT_MAX) * 2);
});

test('宝物：よく積もった場所でだけ、まだ見つけていないものが出る', async () => {
  const { rollTreasure, spotTreasures, dexAdd, dexProgress, createInitialSave } = await import('../src/game/state.ts');
  const { TREASURES, SPOTS, TREASURE_MIN_FULLNESS } = await import('../src/game/catalog.ts');
  // どの掃除場所にも3つずつ、番号は重ならない
  for (const def of SPOTS) assert.equal(TREASURES.filter((t) => t.spot === def.id).length, 3, def.id);
  assert.equal(new Set(TREASURES.map((t) => t.id)).size, TREASURES.length);
  let s = createInitialSave();
  assert.equal(rollTreasure(s, 'window', TREASURE_MIN_FULLNESS - 0.01, () => 0), null);
  const t = rollTreasure(s, 'window', 1, () => 0);
  assert.ok(t && t.spot === 'window');
  assert.equal(rollTreasure(s, 'window', 1, () => 0.99), null);
  for (const x of TREASURES.filter((x) => x.spot === 'window')) s = dexAdd(s, 'items', x.id).save;
  assert.equal(spotTreasures(s, 'window').left.length, 0);
  assert.equal(rollTreasure(s, 'window', 1, () => 0), null);
  const p = dexProgress(s);
  assert.deepEqual(p.treasures, [3, TREASURES.length]);
  assert.equal(p.items[0], 0);
});

test('宝物は保存して読み直しても残る', async () => {
  const { sanitize } = await import('../src/game/save.ts');
  const { createInitialSave } = await import('../src/game/state.ts');
  const s = { ...createInitialSave(), dex: { dust: [], items: ['t_window1', 'ring', 'bogus'], people: [], fur: [] } };
  assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s))).dex.items, ['t_window1', 'ring']);
});

test('なつかしの味：4章から町のホコリは1個で何倍も育ち、好物はさらに倍', async () => {
  const { feed, feedableAmount, dustValue, favoriteDust, localDay, emptyBag, createInitialSave, furOf } = await import('../src/game/state.ts');
  const { NOSTALGIA_MUL, FAVORITE_MUL, NOSTALGIC_DUSTS } = await import('../src/game/catalog.ts');
  const base = createInitialSave();
  // 2章まではふつう、3章は少しだけ（×2）
  const ch2 = { ...base, habitat: 4 as const, growthXp: 500, bag: { ...emptyBag(), cotton: 10 } };
  assert.equal(dustValue(ch2, 'cotton'), 1);
  assert.equal(feed(ch2, 'cotton').growth, 10);
  const ch3 = { ...base, habitat: 5 as const, growthXp: 1000, bag: { ...emptyBag(), cotton: 10 } };
  assert.equal(dustValue(ch3, 'cotton'), 2);
  assert.equal(feed(ch3, 'cotton').growth, 20);
  // 4章：綿ぼこりは×10、黄砂（世界でも集まる）はふつう
  const ch4 = { ...base, habitat: 6 as const, growthXp: 10000, bag: { ...emptyBag(), cotton: 10, kosa: 10 } };
  const mul = NOSTALGIA_MUL[4] ?? 1;
  assert.equal(dustValue(ch4, 'cotton'), mul);
  assert.equal(dustValue(ch4, 'kosa'), 1);
  assert.equal(dustValue(ch4, 'cotton', 'cotton'), mul * FAVORITE_MUL);
  const r = feed(ch4, 'cotton');
  assert.equal(r.fed, 10);
  assert.equal(r.growth, 10 * mul);
  assert.equal(r.save.diet.cotton, 10 * mul);
  // いっぱい近くでは、必要な個数だけ食べて容量で止まる
  const near = { ...ch4, growthXp: 30000 - 25 };
  assert.equal(feedableAmount(near, 'cotton'), 3);
  const r2 = feed(near, 'all');
  assert.equal(r2.save.growthXp, 30000);
  assert.equal(r2.save.bag.cotton, 7);
  // 好物は毎日、なつかしの味のどれか
  for (let d = 0; d < 30; d++) assert.ok(NOSTALGIC_DUSTS.includes(favoriteDust(d)));
  assert.notEqual(new Set(Array.from({ length: 14 }, (_, d) => favoriteDust(d))).size, 1);
  assert.equal(localDay(Date.UTC(2026, 0, 2, 0, 30), -540), localDay(Date.UTC(2026, 0, 2, 14, 0), -540));
  // 毛並みは育った量で数える
  assert.equal(furOf({ ...emptyBag(), cotton: 100, star: 10 }), 'pure:cotton');
});

test('6章：銀河ほこり連合の呼び出しから天の川のほとりへ', async () => {
  const { galaxyLetterDue, moveToGalaxy, chapter, canGalaxy, galaxyNebulae, finishGalaxy, galaxyReward, clusterDue, addEvent, createInitialSave, dustValue } = await import('../src/game/state.ts');
  const { GALAXY, CLUSTER_XP, HABITATS, NOSTALGIA_MUL } = await import('../src/game/catalog.ts');
  let s: ReturnType<typeof createInitialSave> = { ...createInitialSave(), habitat: 7, growthXp: 80000, rep: 100 };
  assert.equal(galaxyLetterDue(s), false);
  s = addEvent(s, 'solar');
  assert.equal(galaxyLetterDue(s), true);
  const moved = moveToGalaxy(s);
  assert.equal(moved.habitat, 8);
  assert.equal(chapter(moved), 6);
  assert.equal(canGalaxy(moved), true);
  assert.equal(HABITATS[8].capacity, CLUSTER_XP);
  assert.equal(dustValue(moved, 'cotton'), NOSTALGIA_MUL[6]);
  const now = 2_000_000_000;
  const after = finishGalaxy(moved, 3, now);
  assert.equal(galaxyNebulae(after, now), 3);
  assert.equal(galaxyNebulae(after, now + GALAXY.regenMinutes * 60_000), GALAXY.maxNebulae);
  assert.equal(galaxyReward(GALAXY.motesPerNebula * 2), GALAXY.coinPerNebula * 2);
  assert.equal(clusterDue({ ...moved, growthXp: CLUSTER_XP }), true);
});

test('終章：宇宙のまんなか・しゃぼん玉の宇宙・はみ出し・最後の場面', async () => {
  const { universeLetterDue, moveToUniverse, chapter, canBubbles, bubbleCount, finishBubbles, bubbleReward, peekDue, finaleDue, addEvent, createInitialSave, rankFor } = await import('../src/game/state.ts');
  const { BUBBLES, FINAL_XP, PEEK_XP, HABITATS } = await import('../src/game/catalog.ts');
  let s: ReturnType<typeof createInitialSave> = { ...createInitialSave(), habitat: 8, growthXp: 250000, rep: 100 };
  assert.equal(universeLetterDue(s), false);
  s = addEvent(s, 'cluster');
  assert.equal(universeLetterDue(s), true);
  const moved = moveToUniverse(s);
  assert.equal(moved.habitat, 9);
  assert.equal(chapter(moved), 7);
  assert.equal(canBubbles(moved), true);
  assert.equal(HABITATS[9].capacity, FINAL_XP);
  const now = 3_000_000_000;
  const after = finishBubbles(moved, 4, now);
  assert.equal(bubbleCount(after, now), 4);
  assert.equal(bubbleCount(after, now + BUBBLES.regenMinutes * 60_000), BUBBLES.maxBubbles);
  assert.equal(bubbleReward(3), 3 * BUBBLES.coinPerBubble);
  assert.equal(peekDue({ ...moved, growthXp: PEEK_XP - 1 }), false);
  assert.equal(peekDue({ ...moved, growthXp: PEEK_XP }), true);
  assert.equal(rankFor(PEEK_XP).name, '次元超越級');
  assert.equal(rankFor(FINAL_XP).name, 'すべてのほこり級');
  assert.equal(finaleDue({ ...moved, growthXp: FINAL_XP }), true);
  assert.equal(finaleDue(addEvent({ ...moved, growthXp: FINAL_XP }, 'finale')), false);
});

test('夢からさめる：ホコリと図鑑とアクセサリーを引き継いで、はじめから', async () => {
  const { wakeUp, canWakeUp, createInitialSave, addEvent, chapter } = await import('../src/game/state.ts');
  const { sanitize } = await import('../src/game/save.ts');
  const end = addEvent(
    {
      ...createInitialSave(),
      hero: 'girl' as const,
      tutorialDone: true,
      habitat: 9 as const,
      growthXp: 600000,
      coins: 9999,
      rep: 40,
      tools: ['hand', 'rag', 'mop', 'vacuum'] as Array<'hand' | 'rag' | 'mop' | 'vacuum'>,
      accessories: ['ribbon', 'crown'] as Array<'ribbon' | 'crown'>,
      equippedAccessory: 'crown' as const,
      bag: { ...createInitialSave().bag, cotton: 50, star: 3000 },
      dex: { dust: ['cotton'], items: ['t_window1'], people: ['mother'], fur: ['pure:cotton'] },
      contestBest: 33,
    },
    'finale',
  );
  assert.equal(canWakeUp(createInitialSave()), false);
  assert.equal(canWakeUp(end), true);
  const next = wakeUp(end);
  // 引き継ぐ
  assert.equal(next.hero, 'girl');
  assert.deepEqual(next.bag, end.bag);
  assert.deepEqual(next.dex, end.dex);
  assert.deepEqual(next.accessories, ['ribbon', 'crown']);
  assert.equal(next.equippedAccessory, 'crown');
  assert.equal(next.contestBest, 33);
  assert.equal(next.loop, 1);
  // はじめから
  assert.equal(next.coins, 0);
  assert.equal(next.habitat, 0);
  assert.equal(next.growthXp, 0);
  assert.equal(next.rep, 0);
  assert.deepEqual(next.tools, ['hand']);
  assert.deepEqual(next.events, ['town', 'board']);
  assert.equal(next.tutorialDone, false);
  assert.equal(chapter(next), 1);
  assert.equal(canWakeUp(next), false);
  // 保存して読み直しても周回数は残る
  assert.equal(sanitize(JSON.parse(JSON.stringify(next))).loop, 1);
  assert.equal(wakeUp(addEvent(next, 'finale')).loop, 2);
});

test('次の章へは評判も必要。評判だけ足りないときは、あといくつか分かる', async () => {
  const { warehouseDue, worldLetterDue, spaceLetterDue, galaxyLetterDue, universeLetterDue, repShortfall, nextRepGoal, addEvent, createInitialSave } = await import('../src/game/state.ts');
  const { CHAPTER_REP, HABITATS } = await import('../src/game/catalog.ts');
  const cases = [
    { due: warehouseDue, need: CHAPTER_REP.warehouseLetter, s: addEvent({ ...createInitialSave(), habitat: 4 as const, growthXp: HABITATS[4].capacity }, 'contestWon') },
    { due: worldLetterDue, need: CHAPTER_REP.worldLetter, s: addEvent({ ...createInitialSave(), habitat: 5 as const, growthXp: HABITATS[5].capacity }, 'rainyDone') },
    { due: spaceLetterDue, need: CHAPTER_REP.spaceLetter, s: addEvent({ ...createInitialSave(), habitat: 6 as const, growthXp: HABITATS[6].capacity }, 'earthWrap') },
    { due: galaxyLetterDue, need: CHAPTER_REP.galaxyLetter, s: addEvent({ ...createInitialSave(), habitat: 7 as const, growthXp: HABITATS[7].capacity }, 'solar') },
    { due: universeLetterDue, need: CHAPTER_REP.universeLetter, s: addEvent({ ...createInitialSave(), habitat: 8 as const, growthXp: HABITATS[8].capacity }, 'cluster') },
  ];
  for (const c of cases) {
    const low = { ...c.s, rep: c.need - 3 };
    assert.equal(c.due(low), false);
    assert.equal(repShortfall(low), 3);
    assert.equal(nextRepGoal(low), c.need);
    const ok = { ...c.s, rep: c.need };
    assert.equal(c.due(ok), true);
    assert.equal(repShortfall(ok), null);
  }
  // 育ちきっていなければ、評判の案内は出さない
  assert.equal(repShortfall({ ...cases[0].s, growthXp: 10, rep: 0 }), null);
});

test('依頼は章が進むほど大きくなり、4章からは大きな依頼もまじる', async () => {
  const { makeRequest, createInitialSave } = await import('../src/game/state.ts');
  const { createRandom } = await import('../src/game/rng.ts');
  const { BIG_REQUESTS } = await import('../src/game/catalog.ts');
  const avg = (habitat: 1 | 5 | 7, tools = ['hand'] as Array<'hand' | 'rag' | 'mop' | 'vacuum'>) => {
    const random = createRandom(11);
    const s = { ...createInitialSave(), habitat, tools, events: ['cityTown' as const, 'street' as const], rep: 30 };
    const list = Array.from({ length: 200 }, (_, i) => makeRequest(s, i, random));
    return { reward: list.reduce((a, r) => a + r.reward, 0) / list.length, list };
  };
  const ch1 = avg(1);
  const ch3 = avg(5);
  const ch5 = avg(7);
  assert.ok(ch3.reward > ch1.reward * 2);
  assert.ok(ch5.reward > ch3.reward * 2);
  const big = ch5.list.filter((r) => r.client === BIG_REQUESTS[5]?.client);
  assert.ok(big.length > 20 && big.length < 120);
  for (const r of big) assert.ok(r.dust === 'star' || r.dust === 'cosmic');
  assert.equal(ch1.list.some((r) => (r.count ?? 0) >= 300), false);
});

test('大会：初優勝の前に何度も負けると、ほかのチームが少しずつ弱くなる', async () => {
  const { contestResult, contestRivals, createInitialSave, addEvent } = await import('../src/game/state.ts');
  const { CONTEST } = await import('../src/game/catalog.ts');
  let s = addEvent({ ...createInitialSave(), habitat: 4 as const }, 'contestNotice');
  const top0 = Math.max(...contestRivals(s).map((r) => r.score));
  assert.equal(top0, Math.max(...CONTEST.rivals.map((r) => r.score)));
  for (let i = 0; i < 6; i++) s = contestResult(s, 10).save;
  assert.equal(s.contestLosses, 6);
  const top6 = Math.max(...contestRivals(s).map((r) => r.score));
  assert.ok(top6 < top0 && top6 >= Math.round(top0 * 0.6));
  // どこまで負けても、下限より弱くはならない
  for (let i = 0; i < 50; i++) s = contestResult(s, 0).save;
  assert.equal(Math.max(...contestRivals(s).map((r) => r.score)), Math.round(top0 * 0.6));
  const won = contestResult(s, top0);
  assert.equal(won.won, true);
  // 優勝したあとは、もとの強さ
  assert.equal(Math.max(...contestRivals(won.save).map((r) => r.score)), top0);
});

test('依頼はことわれる。大きな依頼の数や、未来の依頼時計も読み直しでこわれない', async () => {
  const { dropRequest, refreshRequests, createInitialSave } = await import('../src/game/state.ts');
  const { sanitize } = await import('../src/game/save.ts');
  const { createRandom } = await import('../src/game/rng.ts');
  const now = 5_000_000_000;
  const s = refreshRequests({ ...createInitialSave(), tutorialDone: true }, now, createRandom(1));
  assert.ok(s.requests.length > 0);
  const dropped = dropRequest(s, s.requests[0].id);
  assert.equal(dropped.requests.length, s.requests.length - 1);
  const big = { ...s, requests: [{ id: 99, kind: 'collect' as const, client: '銀河ほこり連合', line: 'x', dust: 'other' as const, count: 15000, reward: 3500, rep: 2 }] };
  assert.equal(sanitize(JSON.parse(JSON.stringify(big)), now).requests[0].count, 15000);
  const future = { ...s, requests: [], requestClock: now + 7 * 24 * 3600_000 };
  const loaded = sanitize(JSON.parse(JSON.stringify(future)), now);
  assert.ok(refreshRequests(loaded, now + 21 * 60_000, createRandom(2)).requests.length > 0);
});

test('町づくり：章になったら寄付でき、効き目がある', async () => {
  const s0 = await import('../src/game/state.ts');
  const { TOWN_PROJECTS, TOWN_PERKS } = await import('../src/game/catalog.ts');
  const base: ReturnType<typeof s0.createInitialSave> = { ...s0.createInitialSave(), habitat: 5, coins: 100000 };
  // 2章ではまだ
  assert.equal(s0.townProjectsOpen({ ...base, habitat: 4 }), false);
  assert.equal(s0.canDonate({ ...base, habitat: 4 }, 'fountain'), false);
  assert.equal(s0.townProjectsOpen(base), true);
  // 章が足りないもの・コインが足りないもの
  assert.equal(s0.canDonate(base, 'observatory'), false);
  assert.equal(s0.canDonate({ ...base, coins: 10 }, 'fountain'), false);
  let s: ReturnType<typeof s0.createInitialSave> = base;
  for (const id of ['fountain', 'clocktower', 'arcade'] as const) {
    const r = s0.donate(s, id);
    assert.equal(r.ok, true, id);
    s = r.save;
  }
  assert.equal(s.coins, 100000 - TOWN_PROJECTS.filter((p) => ['fountain', 'clocktower', 'arcade'].includes(p.id)).reduce((a, p) => a + p.price, 0));
  assert.equal(s0.donate(s, 'fountain').ok, false); // 二重にはできない
  assert.equal(s0.requestIntervalMinutes(s), TOWN_PERKS.clockMinutes);
  assert.ok(s0.dampChance(s) < s0.dampChance(base));
  // 噴水：同じ時間でも、よく積もる
  const now = 10_000_000;
  const spot = (await import('../src/game/catalog.ts')).spotDef('myroom');
  const emptied = { ...s, spots: { ...s.spots, myroom: { fullness: 0, at: now } } };
  const emptiedBase = { ...base, spots: { ...base.spots, myroom: { fullness: 0, at: now } } };
  const later = now + 10 * 60_000;
  assert.ok(s0.spotStatus(emptied, spot, later).fullness > s0.spotStatus(emptiedBase, spot, later).fullness);
  // 天文台
  const ch4 = { ...s, habitat: 6 as const };
  assert.equal(s0.observatoryBonus(ch4), 0);
  assert.equal(s0.observatoryBonus(s0.donate(ch4, 'observatory').save), TOWN_PERKS.observatorySeconds);
  // 保存して読み直しても残る
  const { sanitize } = await import('../src/game/save.ts');
  assert.deepEqual(sanitize(JSON.parse(JSON.stringify({ ...s, town: [...s.town, 'bogus'] }))).town, s.town);
});
