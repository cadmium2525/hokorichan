// ゲームの状態とルール。描画やDOMに依存しない純粋なロジックだけを置く。
// 時刻は引数 now（ミリ秒）で受け取り、テストで固定できるようにする。

import {
  ACCESSORIES,
  AREA_NAMES,
  AREA_REP,
  COLLECT_LINES,
  CONTEST,
  CONTEST_MAX,
  CONTEST_REP,
  CONTEST_XP,
  DUST_TYPES,
  FRIEND_UNLOCK_XP,
  HABITATS,
  LAND_PRICE,
  LOST_ITEMS,
  PERSON_IDS,
  RAINY,
  SHAPE_LIMITS,
  SKY,
  SPOT_IDS,
  SPOT_READY_RATIO,
  SPOTS,
  TOOL_ORDER,
  TOOLS,
  type AccessoryId,
  type Area,
  type DustType,
  type Habitat,
  type Hero,
  type PersonId,
  type PetShape,
  type SpotDef,
  type SpotId,
  type ToolDef,
  type ToolId,
} from './catalog.ts';

export const SAVE_VERSION = 5 as const;

/** 場所ごとの積もり具合。at の時点で fullness（0〜1）だった */
export type SpotState = { fullness: number; at: number };

/** ホコリの種類ごとの数 */
export type Bag = Record<DustType, number>;

export type RequestKind = 'collect' | 'speed' | 'lost';

/** 掲示板の依頼 */
export type Request = {
  id: number;
  kind: RequestKind;
  client: string;
  line: string;
  reward: number;
  rep: number;
  spot?: SpotId;
  dust?: DustType;
  count?: number;
  seconds?: number;
  item?: string;
};

/** 一度だけ起きる出来事（見たら記録） */
export type EventId =
  | 'town'
  | 'friend'
  | 'board'
  | 'landMeeting'
  | 'container'
  | 'street'
  | 'together'
  | 'contestNotice'
  | 'contestWon'
  | 'warehouseLetter'
  | 'warehouse'
  | 'sky'
  | 'cityTown'
  | 'rainy'
  | 'rainyDone';

export const EVENT_IDS: readonly EventId[] = [
  'town',
  'friend',
  'board',
  'landMeeting',
  'container',
  'street',
  'together',
  'contestNotice',
  'contestWon',
  'warehouseLetter',
  'warehouse',
  'sky',
  'cityTown',
  'rainy',
  'rainyDone',
];

/** 図鑑：見つけたホコリ・落とし物・出会った人 */
export type Dex = { dust: DustType[]; items: string[]; people: PersonId[] };

export type SaveData = {
  version: typeof SAVE_VERSION;
  coins: number;
  /** バッグのホコリ（種類別） */
  bag: Bag;
  /** これまでに食べたホコリ（種類別）。毛並みが決まる */
  diet: Bag;
  growthXp: number;
  /** 0=勉強机の上、1〜3=ケース、4=空き地のコンテナ */
  habitat: Habitat;
  damp: boolean;
  cleanedSessions: number;
  soundEnabled: boolean;
  tutorialDone: boolean;
  hero: Hero | null;
  tools: ToolId[];
  accessories: AccessoryId[];
  equippedAccessory: AccessoryId | null;
  shape: PetShape;
  spots: Record<SpotId, SpotState>;
  /** 評判（★）。依頼で上がり、新しい場所を紹介してもらえる */
  rep: number;
  requests: Request[];
  /** 次の依頼が届く時刻 */
  requestClock: number;
  requestSeq: number;
  events: EventId[];
  dex: Dex;
  /** 大掃除大会の自己ベスト（集めた数） */
  contestBest: number;
  /** 最後に大会に出た時刻（次の大会まで待つ） */
  contestAt: number;
  /** 空の雲の積もり具合（3章） */
  sky: SpotState;
};

export const REWARD_PER_DUST = 2;
export const CLEAR_RATIO = 0.8;
export const DAMP_CHANCE = 0.2;
export const DAMP_SCALE = 0.7;
export const REQUEST_MAX = 3;
export const REQUEST_INTERVAL_MINUTES = 20;
const MINUTE = 60_000;

export function emptyBag(): Bag {
  return { cotton: 0, lint: 0, sand: 0, fur: 0, pollen: 0, flour: 0, kosa: 0, soot: 0, chalk: 0 };
}

export function bagTotal(bag: Bag): number {
  return DUST_TYPES.reduce((sum, t) => sum + bag[t], 0);
}

export function defaultShape(): PetShape {
  return { width: 1, height: 1, fluff: 1 };
}

export function fullSpots(): Record<SpotId, SpotState> {
  return Object.fromEntries(SPOT_IDS.map((id) => [id, { fullness: 1, at: 0 }])) as Record<SpotId, SpotState>;
}

export function createInitialSave(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 0,
    bag: emptyBag(),
    diet: emptyBag(),
    growthXp: 0,
    habitat: 0,
    damp: false,
    cleanedSessions: 0,
    soundEnabled: true,
    tutorialDone: false,
    hero: null,
    tools: ['hand'],
    accessories: ['ribbon'],
    equippedAccessory: null,
    shape: defaultShape(),
    spots: fullSpots(),
    rep: 0,
    requests: [],
    requestClock: 0,
    requestSeq: 0,
    events: [],
    dex: { dust: [], items: [], people: [] },
    contestBest: 0,
    contestAt: 0,
    sky: { fullness: 1, at: 0 },
  };
}

// ---- 出来事・章 ----

export function hasEvent(save: SaveData, id: EventId): boolean {
  return save.events.includes(id);
}

export function addEvent(save: SaveData, id: EventId): SaveData {
  return hasEvent(save, id) ? save : { ...save, events: [...save.events, id] };
}

// ---- 図鑑 ----

export type DexKind = keyof Dex;

/** 図鑑に記録する。はじめて載ったら added=true */
export function dexAdd<K extends DexKind>(save: SaveData, kind: K, id: Dex[K][number]): { save: SaveData; added: boolean } {
  const list = save.dex[kind] as string[];
  if (list.includes(id)) return { save, added: false };
  return { save: { ...save, dex: { ...save.dex, [kind]: [...list, id] } }, added: true };
}

export function dexProgress(save: SaveData): { dust: [number, number]; items: [number, number]; people: [number, number] } {
  return {
    dust: [save.dex.dust.length, DUST_TYPES.length],
    items: [save.dex.items.length, LOST_ITEMS.length],
    people: [save.dex.people.length, PERSON_IDS.length],
  };
}

// ---- 2章の山場：大掃除大会 ----

/** 大会のおしらせを出すころか */
export function contestDue(save: SaveData): boolean {
  return chapter(save) === 2 && save.growthXp >= CONTEST_XP && save.rep >= CONTEST_REP && !hasEvent(save, 'contestNotice');
}

export type ContestEntry = { name: string; score: number; you: boolean };

/** 順位表。同点ならほかのチームが上（追いつくだけでは勝てない） */
export function contestRanking(score: number, youName = 'ほこりちゃんチーム'): ContestEntry[] {
  const rivals = CONTEST.rivals.map((r) => ({ name: r.name, score: r.score, you: false }));
  const list = [...rivals, { name: youName, score, you: true }];
  return list.sort((a, b) => b.score - a.score || (a.you ? 1 : 0) - (b.you ? 1 : 0));
}

/** 次の大会までの残り分（0なら出られる） */
export function contestWaitMinutes(save: SaveData, now: number, speed = 1): number {
  if (save.contestAt <= 0) return 0;
  const passed = ((now - save.contestAt) / MINUTE) * speed;
  return Math.max(0, Math.ceil(CONTEST.cooldownMinutes - passed));
}

/** 出場する（出た時刻を記録。途中でやめても次の大会まで待つ） */
export function enterContest(save: SaveData, now: number, speed = 1): { save: SaveData; ok: boolean } {
  if (!hasEvent(save, 'contestNotice') || contestWaitMinutes(save, now, speed) > 0) return { save, ok: false };
  return { save: { ...save, contestAt: now }, ok: true };
}

/** 大会の結果を反映する。賞金・自己ベスト・初優勝（ごほうび・評判・出来事） */
export function contestResult(
  save: SaveData,
  score: number,
): { save: SaveData; rank: number; prize: number; won: boolean; firstWin: boolean; best: boolean } {
  const s = Math.max(0, Math.min(Math.floor(score), CONTEST_MAX));
  const ranking = contestRanking(s);
  const rank = ranking.findIndex((e) => e.you) + 1;
  const won = rank === 1;
  const firstWin = won && !hasEvent(save, 'contestWon');
  const prize = (CONTEST.prizes[rank - 1] ?? 0) + (firstWin ? CONTEST.firstWinBonus : 0);
  let next: SaveData = { ...save, coins: save.coins + prize, contestBest: Math.max(save.contestBest, s) };
  if (firstWin) next = addEvent({ ...next, rep: next.rep + CONTEST.winRep }, 'contestWon');
  return { save: next, rank, prize, won, firstWin, best: s > save.contestBest };
}

/** 1章：おうち編、2章：ご近所編（空き地のコンテナに住んでから） */
export function chapter(save: SaveData): 1 | 2 | 3 {
  return save.habitat >= 5 ? 3 : save.habitat >= 4 ? 2 : 1;
}

// ---- まちと場所の解禁 ----

/** 友だちの家に行けるか */
export function friendUnlocked(save: SaveData): boolean {
  return save.growthXp >= FRIEND_UNLOCK_XP;
}

export function areaUnlocked(save: SaveData, area: Area): boolean {
  if (area === 'home') return true;
  if (area === 'friend') return friendUnlocked(save);
  // 駅と学校は3章で、駅長さん・先生にたのまれてから
  if (area === 'station' || area === 'school') return chapter(save) >= 3 && hasEvent(save, 'cityTown');
  return chapter(save) >= 2 && save.rep >= (AREA_REP[area] ?? 0);
}

// ---- 飼育 ----

export function capacityOf(habitat: Habitat): number {
  return HABITATS[habitat].capacity;
}

export function isFull(save: SaveData): boolean {
  return save.growthXp >= capacityOf(save.habitat);
}

/** 今あげられる量。容量の残りと（その種類の）バッグの少ない方 */
export function feedableAmount(save: SaveData, type: DustType | 'all' = 'all'): number {
  const room = capacityOf(save.habitat) - save.growthXp;
  const have = type === 'all' ? bagTotal(save.bag) : save.bag[type];
  return Math.max(0, Math.min(have, room));
}

/**
 * バッグのホコリを与える。type='all' なら多い種類から順に。
 * 容量を超える分はバッグに残る。食べた種類は diet に記録する。
 */
export function feed(save: SaveData, type: DustType | 'all' = 'all'): { save: SaveData; fed: number } {
  let room = capacityOf(save.habitat) - save.growthXp;
  if (room <= 0) return { save, fed: 0 };
  const bag = { ...save.bag };
  const diet = { ...save.diet };
  const order = type === 'all' ? [...DUST_TYPES].sort((a, b) => bag[b] - bag[a]) : [type];
  let fed = 0;
  for (const t of order) {
    const n = Math.min(bag[t], room);
    if (n <= 0) continue;
    bag[t] -= n;
    diet[t] += n;
    room -= n;
    fed += n;
  }
  if (fed === 0) return { save, fed: 0 };
  return { save: { ...save, bag, diet, growthXp: save.growthXp + fed }, fed };
}

// ---- 毛並み（食べ合わせ） ----

/** 食べたホコリの割合（0〜1） */
export function dietRatios(diet: Bag): Bag {
  const total = bagTotal(diet);
  const r = emptyBag();
  if (total === 0) return r;
  for (const t of DUST_TYPES) r[t] = diet[t] / total;
  return r;
}

/** これだけの割合を食べると毛並みとして現れる */
export const TRAIT_RATIO = 0.15;
const TRAIT_MIN_EATEN = 20;

/** 現れている毛並み（綿ぼこりは基本なので除く） */
export function activeTraits(diet: Bag): DustType[] {
  if (bagTotal(diet) < TRAIT_MIN_EATEN) return [];
  const r = dietRatios(diet);
  return DUST_TYPES.filter((t) => t !== 'cotton' && r[t] >= TRAIT_RATIO);
}

/** 一緒に掃除するときの能力 */
export function helperStats(save: SaveData): { speedMul: number; radiusMul: number; sneeze: boolean } {
  const traits = activeTraits(save.diet);
  const r = dietRatios(save.diet);
  return {
    speedMul: traits.includes('sand') ? 1 + r.sand * 2 : 1,
    radiusMul: traits.includes('fur') ? 1 + r.fur * 1.5 : 1,
    sneeze: traits.includes('pollen'),
  };
}

/** 粉ぼこりを食べていると湿気にくい。梅雨のあいだは必ずしっとりする */
export function dampChance(save: SaveData): number {
  if (rainyActive(save)) return 1;
  if (!activeTraits(save.diet).includes('flour')) return DAMP_CHANCE;
  return DAMP_CHANCE * Math.max(0.25, 1 - dietRatios(save.diet).flour * 3);
}

/** 一緒に掃除できるのは、おうち級（コンテナ）になってから */
export function canCleanTogether(save: SaveData): boolean {
  return save.habitat >= 4;
}

// ---- ショップ ----

/** ショップで買えるのはケース（大）まで。その先は空き地 */
export function nextHabitat(save: SaveData): { level: Habitat; price: number } | null {
  // 3章の倉庫は、市役所の許可（手紙）が届いてからショップで注文できる
  if (save.habitat === 4 && hasEvent(save, 'warehouseLetter')) return { level: 5, price: HABITATS[5].price };
  if (save.habitat >= 3) return null;
  const level = (save.habitat + 1) as Habitat;
  return { level, price: HABITATS[level].price };
}

export function buyHabitat(save: SaveData): { save: SaveData; ok: boolean } {
  const next = nextHabitat(save);
  if (!next || save.coins < next.price) return { save, ok: false };
  return { save: { ...save, coins: save.coins - next.price, habitat: next.level }, ok: true };
}

// ---- 3章：倉庫と空のおそうじ ----

/** 町の清掃係になり、コンテナがいっぱいになったら市役所から倉庫の許可が届く */
export function warehouseDue(save: SaveData): boolean {
  return save.habitat === 4 && hasEvent(save, 'contestWon') && save.growthXp >= HABITATS[4].capacity && !hasEvent(save, 'warehouseLetter');
}

// ---- 3章：駅と学校、梅雨の大湿気事件 ----

/** 駅長さん・先生が声をかけてくるころ（倉庫で空を飛んだあと） */
export function cityTownDue(save: SaveData): boolean {
  return chapter(save) >= 3 && hasEvent(save, 'sky') && !hasEvent(save, 'cityTown');
}

/** 梅雨が来るころ */
export function rainyDue(save: SaveData): boolean {
  return chapter(save) >= 3 && hasEvent(save, 'cityTown') && save.growthXp >= RAINY.xp && !hasEvent(save, 'rainy');
}

/** 梅雨のまっさいちゅう（町じゅうしっとり、空は飛べない） */
export function rainyActive(save: SaveData): boolean {
  return hasEvent(save, 'rainy') && !hasEvent(save, 'rainyDone');
}

/** 乾燥パウダー大作戦：バッグのホコリが足りているか */
export function canDeliverRainy(save: SaveData): boolean {
  return rainyActive(save) && DUST_TYPES.every((t) => save.bag[t] >= (RAINY.need[t] ?? 0));
}

/** 届けて梅雨を終わらせる。ごほうびはコイン・評判・レインハット */
export function deliverRainy(save: SaveData): { save: SaveData; ok: boolean } {
  if (!canDeliverRainy(save)) return { save, ok: false };
  const bag = { ...save.bag };
  for (const t of DUST_TYPES) bag[t] -= RAINY.need[t] ?? 0;
  const accessories: AccessoryId[] = save.accessories.includes('rainhat') ? save.accessories : [...save.accessories, 'rainhat'];
  const next: SaveData = { ...save, bag, coins: save.coins + RAINY.reward, rep: save.rep + RAINY.rep, accessories, damp: false };
  return { save: addEvent(next, 'rainyDone'), ok: true };
}

/** ほこりちゃんに乗って空へ行ける（倉庫に住んでから） */
export function canFly(save: SaveData): boolean {
  return save.habitat >= 5;
}

/** 梅雨のあいだは雨で飛べない */
export function skyBlocked(save: SaveData): boolean {
  return rainyActive(save);
}

/** 空を飛ぶ速さの倍率（チョークの粉の毛並み「すべすべ」で速くなる） */
export function skySpeedMul(save: SaveData): number {
  const r = dietRatios(save.diet);
  return activeTraits(save.diet).includes('chalk') ? 1 + r.chalk * 1.5 : 1;
}

/** いま空に浮かんでいる雲の数 */
export function skyClouds(save: SaveData, now: number, speed = 1): number {
  const elapsed = Math.max(0, now - save.sky.at) * speed;
  const fullness = Math.min(1, save.sky.fullness + elapsed / (SKY.regenMinutes * MINUTE));
  return Math.floor(SKY.maxClouds * fullness + 1e-9);
}

/** 飛び終えたら、残った雲の数を記録する */
export function finishSky(save: SaveData, remaining: number, now: number): SaveData {
  const fullness = Math.max(0, Math.min(1, remaining / SKY.maxClouds));
  return { ...save, sky: { fullness, at: now } };
}

/** 空のお礼（市役所から） */
export function skyReward(clouds: number): number {
  return Math.max(0, Math.floor(clouds)) * SKY.coinPerCloud;
}

/** 空で雲を吸い込む範囲の倍率（黄砂の毛並み「ずっしり」で広がる） */
export function skyRadiusMul(save: SaveData): number {
  const r = dietRatios(save.diet);
  return activeTraits(save.diet).includes('kosa') ? 1 + r.kosa * 1.5 : 1;
}

export function buyTool(save: SaveData, id: ToolId): { save: SaveData; ok: boolean } {
  const tool = TOOLS[id];
  if (save.tools.includes(id) || save.coins < tool.price) return { save, ok: false };
  return { save: { ...save, coins: save.coins - tool.price, tools: [...save.tools, id] }, ok: true };
}

/** 持っている道具のうち一番いいもの。掃除ではこれを使う */
export function bestTool(save: SaveData): ToolDef {
  let best = TOOLS.hand;
  for (const id of TOOL_ORDER) if (save.tools.includes(id) && TOOLS[id].tier > best.tier) best = TOOLS[id];
  return best;
}

export function buyAccessory(save: SaveData, id: AccessoryId): { save: SaveData; ok: boolean } {
  const def = ACCESSORIES.find((a) => a.id === id);
  if (!def || def.reward || def.chapter > chapter(save) || save.accessories.includes(id) || save.coins < def.price) return { save, ok: false };
  return {
    save: { ...save, coins: save.coins - def.price, accessories: [...save.accessories, id], equippedAccessory: id },
    ok: true,
  };
}

/** 付け替え。同じものを選ぶと外す。持っていないものは付けられない */
export function toggleAccessory(save: SaveData, id: AccessoryId): SaveData {
  if (!save.accessories.includes(id)) return save;
  return { ...save, equippedAccessory: save.equippedAccessory === id ? null : id };
}

export function clampShape(shape: PetShape): PetShape {
  const c = (key: keyof PetShape) => {
    const v = shape[key];
    const { min, max } = SHAPE_LIMITS[key];
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 1;
  };
  return { width: c('width'), height: c('height'), fluff: c('fluff') };
}

// ---- 1章の山場：空き地とコンテナ ----

/** ケース（大）がいっぱいになったら家族会議が開かれる */
export function landMeetingDue(save: SaveData): boolean {
  return save.habitat === 3 && isFull(save) && !hasEvent(save, 'landMeeting');
}

export function canBuyLand(save: SaveData): boolean {
  return save.habitat === 3 && hasEvent(save, 'landMeeting') && save.coins >= LAND_PRICE;
}

export function buyLand(save: SaveData): { save: SaveData; ok: boolean } {
  if (!canBuyLand(save)) return { save, ok: false };
  return { save: { ...save, coins: save.coins - LAND_PRICE, habitat: 4 }, ok: true };
}

// ---- 掃除場所とホコリの復活 ----

/**
 * 今の積もり具合（0〜1）。最後に掃除した時点から実時間で少しずつ戻る。
 * speed はテスト用の早回し倍率。
 */
export function spotFullness(state: SpotState, def: SpotDef, now: number, speed = 1): number {
  const elapsed = Math.max(0, now - state.at) * speed;
  return Math.min(1, state.fullness + elapsed / (def.regenMinutes * MINUTE));
}

export type SpotStatus = {
  fullness: number;
  dust: number;
  /** 道具が足りない・まだ紹介されていないなどで入れない */
  locked: boolean;
  /** 掃除できるだけ積もっている */
  ready: boolean;
  /** 入れるようになるまでの分（ready なら 0） */
  minutesToReady: number;
  /** 満タンまでの分 */
  minutesToFull: number;
};

export function spotStatus(save: SaveData, def: SpotDef, now: number, speed = 1): SpotStatus {
  const fullness = spotFullness(save.spots[def.id], def, now, speed);
  const perMinute = 1 / def.regenMinutes;
  return {
    fullness,
    dust: Math.round(fullness * def.maxDust),
    locked: !areaUnlocked(save, def.area) || bestTool(save).tier < def.minTier,
    ready: fullness >= SPOT_READY_RATIO - 1e-9,
    minutesToReady: Math.max(0, Math.ceil((SPOT_READY_RATIO - fullness) / perMinute / speed)),
    minutesToFull: Math.max(0, Math.ceil((1 - fullness) / perMinute / speed)),
  };
}

/**
 * 掃除を始める。ホコリの数を確定し、その場所は空になったとして記録する
 * （途中でリロードしても同じホコリを取り直せない）。
 */
export function startSpot(
  save: SaveData,
  def: SpotDef,
  now: number,
  speed = 1,
): { save: SaveData; dust: number } | null {
  const status = spotStatus(save, def, now, speed);
  if (status.locked || !status.ready || status.dust <= 0) return null;
  return {
    save: { ...save, spots: { ...save.spots, [def.id]: { fullness: 0, at: now } } },
    dust: status.dust,
  };
}

/** 掃除を終える。取り残したホコリはその場所に残る */
export function finishSpot(save: SaveData, def: SpotDef, remaining: number, now: number): SaveData {
  const fullness = Math.min(1, Math.max(0, remaining / def.maxDust));
  return { ...save, spots: { ...save.spots, [def.id]: { fullness, at: now } } };
}

/** 場所の割合にしたがって、ホコリ1個ずつの種類を決める */
export function rollDustTypes(def: Pick<SpotDef, 'dust'>, count: number, random: () => number): DustType[] {
  const entries = DUST_TYPES.filter((t) => (def.dust[t] ?? 0) > 0).map((t) => [t, def.dust[t] as number] as const);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  const out: DustType[] = [];
  for (let i = 0; i < count; i++) {
    let r = random() * total;
    let pick: DustType = entries[0][0];
    for (const [t, w] of entries) {
      r -= w;
      if (r < 0) {
        pick = t;
        break;
      }
    }
    out.push(pick);
  }
  return out;
}

// ---- 湿気 ----

export function rollDamp(random: () => number, chance = DAMP_CHANCE): boolean {
  return random() < chance;
}

/** 乾燥は無料で即回復。XPや容量は一切変えない。 */
export function dry(save: SaveData): SaveData {
  return save.damp ? { ...save, damp: false } : save;
}

// ---- 依頼（掲示板）と評判 ----

const AREA_CLIENT: Record<Area, string> = {
  home: 'お母さん',
  friend: '友だちのお母さん',
  flower: '花屋さん',
  bakery: 'パン屋さん',
  grandma: 'おばあちゃん',
  station: '駅長さん',
  school: '先生',
};

/** 今のプレイヤーが行ける掃除場所（道具・解禁を満たす） */
export function availableSpots(save: SaveData): SpotDef[] {
  return SPOTS.filter((d) => areaUnlocked(save, d.area) && bestTool(save).tier >= d.minTier);
}

/**
 * 「○秒以内に掃除」の制限時間。13〜18秒くらい（広い場所ほど少し長い）。
 * 素手・ぞうきんしかないときは少しおまけする。
 */
export function speedSeconds(spot: SpotDef, tool: ToolDef): number {
  const base = 10 + Math.round(spot.maxDust / 4);
  return tool.tier <= 1 ? base + 5 : base;
}

/** 新しい依頼を1件つくる。行ける場所と手に入るホコリの中から選ぶ */
export function makeRequest(save: SaveData, id: number, random: () => number): Request {
  const spots = availableSpots(save);
  const types = DUST_TYPES.filter((t) => spots.some((s) => (s.dust[t] ?? 0) > 0));
  const roll = random();
  const spot = spots[Math.floor(random() * spots.length)];
  if (roll < 0.45 && types.length > 0) {
    const dust = types[Math.floor(random() * types.length)];
    const count = 5 + Math.floor(random() * 8);
    const c = COLLECT_LINES[dust];
    return { id, kind: 'collect', client: c.client, line: c.line, dust, count, reward: 10 + count * 4, rep: 1 };
  }
  if (roll < 0.75) {
    const seconds = speedSeconds(spot, bestTool(save));
    return {
      id,
      kind: 'speed',
      client: AREA_CLIENT[spot.area],
      line: `お客さんが来るの！ ${spot.name}を${seconds}秒以内にきれいにしてほしい`,
      spot: spot.id,
      seconds,
      reward: 30 + spot.maxDust,
      rep: 1,
    };
  }
  const item = LOST_ITEMS[Math.floor(random() * LOST_ITEMS.length)];
  return {
    id,
    kind: 'lost',
    client: AREA_CLIENT[spot.area],
    line: `${spot.name}で${item.name}をなくしちゃったの。ホコリにまぎれてないかしら`,
    spot: spot.id,
    item: item.id,
    reward: 50,
    rep: 2,
  };
}

/**
 * 時間がたつと依頼が届く（最大3件）。遊ばない間にたまるのも3件まで。
 * random は依頼の中身を決めるのに使う。
 */
export function refreshRequests(save: SaveData, now: number, random: () => number, speed = 1): SaveData {
  const interval = (REQUEST_INTERVAL_MINUTES * MINUTE) / speed;
  let s = save;
  // 一度も届いていなければ、最初の2件をすぐ届ける
  if (s.requestSeq === 0 && s.requests.length === 0) s = { ...s, requestClock: now - interval };
  let changed = false;
  let requests = s.requests;
  let clock = s.requestClock;
  let seq = s.requestSeq;
  while (requests.length < REQUEST_MAX && now >= clock) {
    seq += 1;
    requests = [...requests, makeRequest(s, seq, random)];
    clock += interval;
    changed = true;
  }
  // 満杯のあいだは時計を進めておき、1件こなしたら次はしばらく後に届く
  if (requests.length >= REQUEST_MAX && clock < now) {
    clock = now + interval;
    changed = true;
  }
  return changed ? { ...s, requests, requestClock: clock, requestSeq: seq } : save;
}

export function findRequest(save: SaveData, kind: RequestKind, spot: SpotId): Request | undefined {
  return save.requests.find((r) => r.kind === kind && r.spot === spot);
}

/** 依頼を達成する（報酬と評判を受け取る） */
export function completeRequest(save: SaveData, id: number): { save: SaveData; request: Request } | null {
  const request = save.requests.find((r) => r.id === id);
  if (!request) return null;
  return {
    save: { ...save, coins: save.coins + request.reward, rep: save.rep + request.rep, requests: save.requests.filter((r) => r.id !== id) },
    request,
  };
}

/** 種類指定の依頼：バッグのホコリをわたす */
export function deliverRequest(save: SaveData, id: number): { save: SaveData; request: Request } | null {
  const r = save.requests.find((q) => q.id === id);
  if (!r || r.kind !== 'collect' || !r.dust || !r.count || save.bag[r.dust] < r.count) return null;
  const paid = { ...save, bag: { ...save.bag, [r.dust]: save.bag[r.dust] - r.count } };
  return completeRequest(paid, id);
}

export function areaClient(area: Area): string {
  return AREA_CLIENT[area];
}

export function areaName(area: Area): string {
  return AREA_NAMES[area];
}

// ---- 成長の見た目 ----

export type Rank = { name: string; min: number };

export const RANKS: readonly Rank[] = [
  { name: '綿ぼこり級', min: 0 },
  { name: '手のひら級', min: 20 },
  { name: 'ぬいぐるみ級', min: 50 },
  { name: 'お部屋級', min: 100 },
  { name: 'おうち級', min: 300 },
  { name: 'ビル級', min: 1500 },
];

export function rankFor(xp: number): Rank {
  let rank = RANKS[0];
  for (const r of RANKS) if (xp >= r.min) rank = r;
  return rank;
}

/** すみかがいっぱい（容量に達した）ときに、すみかの内寸に対して占める大きさ */
const FULL_FRACTION = 0.78;
/** 机の上（出会い）では小さな綿ぼこりから始まる */
const DESK_SIZE: [number, number] = [0.3, 0.6];

/** そのすみかでの大きさの範囲（入ったとき〜いっぱいのとき）。前のすみかの最大より小さくならない */
export function habitatSizeRange(habitat: Habitat): [number, number] {
  if (habitat === 0) return DESK_SIZE;
  const prevMax = habitatSizeRange((habitat - 1) as Habitat)[1];
  const max = HABITATS[habitat].inner * FULL_FRACTION;
  return [Math.min(prevMax, max), max];
}

/**
 * 表示用の直径。すみかの中での成長の割合に合わせて、いっぱいになるまでずっと大きくなり続ける。
 * 横長・縦長にしたときは、はみ出さないよう少し小さくする。湿気中は縮める。
 */
export function petDisplaySize(xp: number, habitat: Habitat, damp: boolean, shape?: PetShape): number {
  const from = habitat === 0 ? 0 : HABITATS[(habitat - 1) as Habitat].capacity;
  const to = HABITATS[habitat].capacity;
  const p = Math.min(1, Math.max(0, (xp - from) / Math.max(1, to - from)));
  const [min, max] = habitatSizeRange(habitat);
  let size = min + (max - min) * Math.pow(p, 0.85);
  if (shape) size /= Math.max(1, shape.width, shape.height);
  return damp ? size * DAMP_SCALE : size;
}

// ---- 清掃セッション ----

export type CleaningSession = {
  id: number;
  /** 'contest' は大掃除大会（場所の積もり具合には数えない） */
  spot: SpotId | 'contest';
  rewardBase: number;
  total: number;
  /** ホコリ1個ずつの種類 */
  types: DustType[];
  collected: Set<number>;
  rewardClaimed: boolean;
  /** 開始時刻（早さの依頼の判定用） */
  startedAt: number;
};

export function createSession(id: number, def: { id: SpotId | 'contest'; rewardBase: number }, types: DustType[], startedAt = 0): CleaningSession {
  return {
    id,
    spot: def.id,
    rewardBase: def.rewardBase,
    total: types.length,
    types,
    collected: new Set(),
    rewardClaimed: false,
    startedAt,
  };
}

/** 回収を記録する。同じホコリは二度数えない。回収できたらその種類を返す */
export function collectDust(session: CleaningSession, dustId: number): DustType | null {
  if (dustId < 0 || dustId >= session.total || session.collected.has(dustId)) return null;
  session.collected.add(dustId);
  return session.types[dustId];
}

/** 達成に必要な回収数（80%を切り上げ） */
export function requiredCount(session: CleaningSession): number {
  // 浮動小数の誤差で1個ずれないよう、割合を整数比で計算する
  return Math.ceil((session.total * Math.round(CLEAR_RATIO * 100)) / 100);
}

export function canClaimReward(session: CleaningSession): boolean {
  return !session.rewardClaimed && session.collected.size >= requiredCount(session);
}

export function rewardFor(session: CleaningSession): number {
  return session.rewardBase + session.collected.size * REWARD_PER_DUST;
}

/** 報酬確定。セッションにつき1回だけ。 */
export function claimReward(
  save: SaveData,
  session: CleaningSession,
): { save: SaveData; reward: number } | null {
  if (!canClaimReward(session)) return null;
  session.rewardClaimed = true;
  const reward = rewardFor(session);
  return {
    save: { ...save, coins: save.coins + reward, cleanedSessions: save.cleanedSessions + 1 },
    reward,
  };
}
