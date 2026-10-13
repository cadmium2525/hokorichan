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
  BIG_REQUESTS,
  BIG_REQUEST_CHANCE,
  CHAPTER_REP,
  REQUEST_SCALE,
  NOSTALGIA_MUL,
  NOSTALGIC_DUSTS,
  FAVORITE_MUL,
  TREASURES,
  TREASURE_CHANCE,
  TOWN_PERKS,
  TOWN_PROJECTS,
  type TownProjectId,
  TREASURE_MIN_FULLNESS,
  type Treasure,
  FUR_IDS,
  FUR_PURE_RATIO,
  furId,
  PERSON_IDS,
  RAINY,
  WORLD,
  EARTH_WRAP_XP,
  SOLAR_XP,
  CLUSTER_XP,
  BUBBLES,
  PEEK_XP,
  FINAL_XP,
  GALAXY,
  SPACE,
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
  type Rival,
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
  | 'rainyDone'
  | 'worldLetter'
  | 'world'
  | 'earthWrap'
  | 'shrink'
  | 'spaceLetter'
  | 'space'
  | 'solar'
  | 'galaxyLetter'
  | 'galaxy'
  | 'cluster'
  | 'universeLetter'
  | 'universe'
  | 'peek'
  | 'finale';

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
  'worldLetter',
  'world',
  'earthWrap',
  'shrink',
  'spaceLetter',
  'space',
  'solar',
  'galaxyLetter',
  'galaxy',
  'cluster',
  'universeLetter',
  'universe',
  'peek',
  'finale',
];

/** 図鑑：見つけたホコリ・落とし物・出会った人 */
export type Dex = { dust: DustType[]; items: string[]; people: PersonId[]; fur: string[] };

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
  /** いまのランクになってから食べたホコリ。ランクが上がるときに毛並みが決まる */
  rankDiet: Bag;
  /** 地球のホコリの地域の積もり具合（4章） */
  world: SpotState;
  /** 宇宙の星くずの群れの積もり具合（5章） */
  space: SpotState;
  /** 銀河の星雲の積もり具合（6章） */
  galaxy: SpotState;
  /** しゃぼん玉の宇宙の積もり具合（終章） */
  bubbles: SpotState;
  /** 夢からさめた回数（0 なら1周目） */
  loop: number;
  /** 初優勝までに大会で負けた回数（ほかのチームが少しずつ弱くなる） */
  contestLosses: number;
  /** 寄付してできた町づくり */
  town: TownProjectId[];
};

export const REWARD_PER_DUST = 2;
export const CLEAR_RATIO = 0.8;
export const DAMP_CHANCE = 0.2;
export const DAMP_SCALE = 0.7;
export const REQUEST_MAX = 3;
export const REQUEST_INTERVAL_MINUTES = 20;
const MINUTE = 60_000;

export function emptyBag(): Bag {
  return { cotton: 0, lint: 0, sand: 0, fur: 0, pollen: 0, flour: 0, kosa: 0, soot: 0, chalk: 0, ash: 0, star: 0, cosmic: 0, nebula: 0, other: 0 };
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
    dex: { dust: [], items: [], people: [], fur: [] },
    contestBest: 0,
    contestAt: 0,
    sky: { fullness: 1, at: 0 },
    rankDiet: emptyBag(),
    world: { fullness: 1, at: 0 },
    space: { fullness: 1, at: 0 },
    galaxy: { fullness: 1, at: 0 },
    bubbles: { fullness: 1, at: 0 },
    loop: 0,
    contestLosses: 0,
    town: [],
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

export function dexProgress(save: SaveData): {
  dust: [number, number];
  items: [number, number];
  treasures: [number, number];
  people: [number, number];
  fur: [number, number];
} {
  const lost = LOST_ITEMS.map((i) => i.id);
  return {
    fur: [save.dex.fur.length, FUR_IDS.length],
    dust: [save.dex.dust.length, DUST_TYPES.length],
    items: [save.dex.items.filter((id) => lost.includes(id)).length, LOST_ITEMS.length],
    treasures: [save.dex.items.filter((id) => !lost.includes(id)).length, TREASURES.length],
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
/**
 * ほかのチームの点数。初優勝の前に何度も負けていると、3回目から少しずつ弱くなる
 * （優勝しないと3章へ進めないので、苦手な人でもいつかは勝てるように）
 */
export function contestRivals(save: SaveData): readonly Rival[] {
  if (hasEvent(save, 'contestWon')) return CONTEST.rivals;
  const ease = Math.max(0, save.contestLosses - 1) * 3;
  return CONTEST.rivals.map((r) => ({ name: r.name, score: Math.max(Math.round(r.score * 0.6), r.score - ease) }));
}

export function contestRanking(score: number, rivalList: readonly Rival[] = CONTEST.rivals, youName = 'ほこりちゃんチーム'): ContestEntry[] {
  const rivals = rivalList.map((r) => ({ name: r.name, score: r.score, you: false }));
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
): { save: SaveData; rank: number; prize: number; won: boolean; firstWin: boolean; best: boolean; rivals: readonly Rival[] } {
  const s = Math.max(0, Math.min(Math.floor(score), CONTEST_MAX));
  const rivals = contestRivals(save);
  const ranking = contestRanking(s, rivals);
  const rank = ranking.findIndex((e) => e.you) + 1;
  const won = rank === 1;
  const firstWin = won && !hasEvent(save, 'contestWon');
  const prize = (CONTEST.prizes[rank - 1] ?? 0) + (firstWin ? CONTEST.firstWinBonus : 0);
  let next: SaveData = { ...save, coins: save.coins + prize, contestBest: Math.max(save.contestBest, s) };
  if (firstWin) next = addEvent({ ...next, rep: next.rep + CONTEST.winRep }, 'contestWon');
  else if (!won && !hasEvent(save, 'contestWon')) next = { ...next, contestLosses: save.contestLosses + 1 };
  return { save: next, rank, prize, won, firstWin, best: s > save.contestBest, rivals };
}

/** 1章：おうち編、2章：ご近所編（空き地のコンテナに住んでから） */
/** 7は終章 */
export function chapter(save: SaveData): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  return save.habitat >= 9 ? 7 : save.habitat >= 8 ? 6 : save.habitat >= 7 ? 5 : save.habitat >= 6 ? 4 : save.habitat >= 5 ? 3 : save.habitat >= 4 ? 2 : 1;
}

// ---- 宝物 ----

/** その掃除場所の宝物（見つけたものと、まだのもの） */
export function spotTreasures(save: SaveData, spot: SpotId): { found: Treasure[]; left: Treasure[] } {
  const all = TREASURES.filter((t) => t.spot === spot);
  return { found: all.filter((t) => save.dex.items.includes(t.id)), left: all.filter((t) => !save.dex.items.includes(t.id)) };
}

/**
 * 掃除を始めるときに、宝物をまぜるか決める。よく積もっている（fullness 以上）ときだけ、
 * まだ見つけていない宝物から1つ。
 */
export function rollTreasure(save: SaveData, spot: SpotId, fullness: number, random: () => number): Treasure | null {
  if (fullness < TREASURE_MIN_FULLNESS) return null;
  const { left } = spotTreasures(save, spot);
  const chance = hasProject(save, 'museum') ? TOWN_PERKS.museumTreasure : TREASURE_CHANCE;
  if (left.length === 0 || random() >= chance) return null;
  return left[Math.floor(random() * left.length)];
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
  // 丘に引っこしたあと、空いた倉庫を掃除できる
  if (area === 'base') return save.habitat >= 6;
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
export function feedableAmount(save: SaveData, type: DustType | 'all' = 'all', favorite: DustType | null = null): number {
  const room = capacityOf(save.habitat) - save.growthXp;
  if (room <= 0) return 0;
  if (type === 'all') return feed(save, 'all', favorite).fed;
  return Math.max(0, Math.min(save.bag[type], Math.ceil(room / dustValue(save, type, favorite))));
}

// ---- なつかしの味 ----

/** ローカル時刻での日付の番号（日が変わるとかわる） */
export function localDay(now: number, tzOffsetMinutes = new Date(now).getTimezoneOffset()): number {
  return Math.floor((now - tzOffsetMinutes * MINUTE) / (24 * 60 * MINUTE));
}

/** きょうの好物（日ごとに、なつかしの味から1つ） */
export function favoriteDust(day: number): DustType {
  let h = Math.imul(day ^ 0x9e3779b9, 2654435761) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return NOSTALGIC_DUSTS[h % NOSTALGIC_DUSTS.length];
}

/** なつかしの味が効いているか（4章から） */
export function nostalgiaActive(save: SaveData): boolean {
  return (NOSTALGIA_MUL[chapter(save)] ?? 1) > 1;
}

/** ホコリ1個で育つ量。4章からは、なつかしの味が何倍にもなる（きょうの好物はさらに倍） */
export function dustValue(save: SaveData, type: DustType, favorite: DustType | null = null): number {
  const mul = NOSTALGIA_MUL[chapter(save)] ?? 1;
  if (mul <= 1 || !NOSTALGIC_DUSTS.includes(type)) return 1;
  return type === favorite ? mul * FAVORITE_MUL : mul;
}

/**
 * バッグのホコリを与える。type='all' なら多い種類から順に。
 * 容量を超える分はバッグに残る。食べた種類は diet に記録する。
 */
/** ランクが上がったときに決まった毛並み */
export type FurRecord = { rank: string; fur: string; isNew: boolean };

/** そのランクのあいだに食べたホコリから毛並みを決める（いちばん多い種類と、2番目） */
export function furOf(rankDiet: Bag): string | null {
  const total = bagTotal(rankDiet);
  if (total <= 0) return null;
  const sorted = [...DUST_TYPES].sort((a, b) => rankDiet[b] - rankDiet[a] || DUST_TYPES.indexOf(a) - DUST_TYPES.indexOf(b));
  const [top, second] = sorted;
  if (rankDiet[top] / total >= FUR_PURE_RATIO || rankDiet[second] <= 0) return furId(top, null);
  return furId(top, second);
}

/**
 * fed は食べた個数、growth は育った量（なつかしの味は1個で何倍にも育つ）。
 * 毛並みの割合（diet・rankDiet）は育った量で数える。
 */
export function feed(
  save: SaveData,
  type: DustType | 'all' = 'all',
  favorite: DustType | null = null,
): { save: SaveData; fed: number; growth: number; furs: FurRecord[] } {
  let room = capacityOf(save.habitat) - save.growthXp;
  if (room <= 0) return { save, fed: 0, growth: 0, furs: [] };
  const bag = { ...save.bag };
  const diet = { ...save.diet };
  let rankDiet = { ...save.rankDiet };
  const furDex = [...save.dex.fur];
  const furs: FurRecord[] = [];
  let xp = save.growthXp;
  const order = type === 'all' ? [...DUST_TYPES].sort((a, b) => bag[b] - bag[a]) : [type];
  let fed = 0;
  for (const t of order) {
    if (room <= 0) break;
    const value = dustValue(save, t, favorite);
    const count = Math.min(bag[t], Math.ceil(room / value));
    if (count <= 0) continue;
    // いっぱいを超える分は育たない（最後の1個は少しだけ）
    let n = Math.min(count * value, room);
    bag[t] -= count;
    diet[t] += n;
    room -= n;
    fed += count;
    // ランクの境目で区切り、そこまでに食べた分で毛並みを確定する
    while (n > 0) {
      const next = RANKS.find((r) => r.min > xp);
      const take = next ? Math.min(n, next.min - xp) : n;
      rankDiet[t] += take;
      xp += take;
      n -= take;
      if (next && xp >= next.min) {
        const fur = furOf(rankDiet);
        if (fur) {
          const isNew = !furDex.includes(fur);
          if (isNew) furDex.push(fur);
          furs.push({ rank: rankFor(xp - 1).name, fur, isNew });
        }
        rankDiet = emptyBag();
      }
    }
  }
  if (fed === 0) return { save, fed: 0, growth: 0, furs: [] };
  return { save: { ...save, bag, diet, rankDiet, growthXp: xp, dex: { ...save.dex, fur: furDex } }, fed, growth: xp - save.growthXp, furs };
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
  const base = hasProject(save, 'arcade') ? DAMP_CHANCE * TOWN_PERKS.arcadeDamp : DAMP_CHANCE;
  if (!activeTraits(save.diet).includes('flour')) return base;
  return base * Math.max(0.25, 1 - dietRatios(save.diet).flour * 3);
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
  return warehouseReady(save) && save.rep >= CHAPTER_REP.warehouseLetter;
}

function warehouseReady(save: SaveData): boolean {
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

// ---- 4章：地球編 ----

/** 梅雨明けのあと倉庫がいっぱいになると、世界ほこり機構から手紙が届く */
export function worldLetterDue(save: SaveData): boolean {
  return worldReady(save) && save.rep >= CHAPTER_REP.worldLetter;
}

function worldReady(save: SaveData): boolean {
  return save.habitat === 5 && hasEvent(save, 'rainyDone') && save.growthXp >= HABITATS[5].capacity && !hasEvent(save, 'worldLetter');
}

/** 手紙を読んだら町はずれの丘へお引っこし（世界ほこり機構の手配なので無料） */
export function moveToHill(save: SaveData): SaveData {
  if (save.habitat !== 5) return save;
  return addEvent({ ...addEvent(save, 'worldLetter'), habitat: 6 }, 'world');
}

/** 世界のおそうじができる（丘に住んでから） */
export function canWorld(save: SaveData): boolean {
  return save.habitat >= 6;
}

/** いま地球にあるホコリの地域の数 */
export function worldPatches(save: SaveData, now: number, speed = 1): number {
  const elapsed = Math.max(0, now - save.world.at) * speed;
  const fullness = Math.min(1, save.world.fullness + elapsed / (WORLD.regenMinutes * MINUTE));
  return Math.floor(WORLD.maxPatches * fullness + 1e-9);
}

export function finishWorld(save: SaveData, remaining: number, now: number): SaveData {
  return { ...save, world: { fullness: Math.max(0, Math.min(1, remaining / WORLD.maxPatches)), at: now } };
}

export function worldReward(patches: number): number {
  return Math.max(0, Math.floor(patches)) * WORLD.coinPerPatch;
}

/** 長押しの秒数（火山灰の毛並み「ほかほか」で短くなる） */
export function worldHoldSeconds(save: SaveData): number {
  const r = dietRatios(save.diet);
  return activeTraits(save.diet).includes('ash') ? WORLD.holdSeconds / (1 + r.ash * 1.5) : WORLD.holdSeconds;
}

/** 4章の山場：丘がいっぱい（地球をひと回りできる大きさ）になった */
export function earthWrapDue(save: SaveData): boolean {
  return save.habitat >= 6 && save.growthXp >= EARTH_WRAP_XP && !hasEvent(save, 'earthWrap');
}

// ---- 5章 宇宙編 ----

/** 4章の山場のあと、宇宙ほこり管制センターから連絡が来る */
export function spaceLetterDue(save: SaveData): boolean {
  return spaceReady(save) && save.rep >= CHAPTER_REP.spaceLetter;
}

function spaceReady(save: SaveData): boolean {
  return save.habitat === 6 && hasEvent(save, 'earthWrap') && !hasEvent(save, 'spaceLetter');
}

/** 連絡を受けたら月のとなりへお引っこし（管制センターの手配なので無料） */
export function moveToSpace(save: SaveData): SaveData {
  if (save.habitat !== 6) return save;
  return addEvent({ ...addEvent(save, 'spaceLetter'), habitat: 7 }, 'space');
}

/** 宇宙のおそうじができる（月のとなりに住んでから） */
export function canSpace(save: SaveData): boolean {
  return save.habitat >= 7;
}

/** いま宇宙に浮かんでいる星くずの群れの数 */
export function spaceClusters(save: SaveData, now: number, speed = 1): number {
  const elapsed = Math.max(0, now - save.space.at) * speed;
  const fullness = Math.min(1, save.space.fullness + elapsed / (SPACE.regenMinutes * MINUTE));
  return Math.floor(SPACE.maxClusters * fullness + 1e-9);
}

export function finishSpace(save: SaveData, remaining: number, now: number): SaveData {
  return { ...save, space: { fullness: Math.max(0, Math.min(1, remaining / SPACE.maxClusters)), at: now } };
}

export function spaceReward(clusters: number): number {
  return Math.max(0, Math.floor(clusters)) * SPACE.coinPerCluster;
}

/** 軌道を変える速さの倍率（星くずの毛並み「きらきら」で速くなる） */
export function spaceTurnMul(save: SaveData): number {
  const r = dietRatios(save.diet);
  return activeTraits(save.diet).includes('star') ? 1 + r.star * 1.5 : 1;
}

/** 小惑星にぶつかったときにゆっくりになる秒数（宇宙のちりの毛並み「ふわり」で短くなる） */
export function spaceBumpSeconds(save: SaveData): number {
  const r = dietRatios(save.diet);
  return activeTraits(save.diet).includes('cosmic') ? SPACE.bumpSeconds / (1 + r.cosmic * 3) : SPACE.bumpSeconds;
}

/** 宇宙のまんなかにあるのは、太陽級になるまでは木星、なってからは太陽 */
export function spaceCenter(save: SaveData): 'jupiter' | 'sun' {
  return save.growthXp >= (RANKS.find((r) => r.name === '太陽級')?.min ?? Infinity) ? 'sun' : 'jupiter';
}

/** 5章の山場：月のとなりがいっぱい（太陽系をひと回りできる大きさ）になった */
export function solarDue(save: SaveData): boolean {
  return save.habitat >= 7 && save.growthXp >= SOLAR_XP && !hasEvent(save, 'solar');
}

// ---- 6章 銀河編 ----

/** 5章の山場のあと、銀河ほこり連合から呼び出しが来る */
export function galaxyLetterDue(save: SaveData): boolean {
  return galaxyReady(save) && save.rep >= CHAPTER_REP.galaxyLetter;
}

function galaxyReady(save: SaveData): boolean {
  return save.habitat === 7 && hasEvent(save, 'solar') && !hasEvent(save, 'galaxyLetter');
}

/** 天の川のほとりへお引っこし（連合の手配なので無料） */
export function moveToGalaxy(save: SaveData): SaveData {
  if (save.habitat !== 7) return save;
  return addEvent({ ...addEvent(save, 'galaxyLetter'), habitat: 8 }, 'galaxy');
}

/** 銀河のおそうじができる（天の川のほとりに住んでから） */
export function canGalaxy(save: SaveData): boolean {
  return save.habitat >= 8;
}

/** いま銀河に浮かんでいる星雲の数 */
export function galaxyNebulae(save: SaveData, now: number, speed = 1): number {
  const elapsed = Math.max(0, now - save.galaxy.at) * speed;
  const fullness = Math.min(1, save.galaxy.fullness + elapsed / (GALAXY.regenMinutes * MINUTE));
  return Math.floor(GALAXY.maxNebulae * fullness + 1e-9);
}

/** 終わったら、残ったつぶの数から星雲の残りを記録する（半分以上残った星雲は残っている扱い） */
export function finishGalaxy(save: SaveData, remainingNebulae: number, now: number): SaveData {
  return { ...save, galaxy: { fullness: Math.max(0, Math.min(1, remainingNebulae / GALAXY.maxNebulae)), at: now } };
}

/** お礼：集めたつぶの数に応じて（星雲1つぶんで coinPerNebula） */
export function galaxyReward(motes: number): number {
  return Math.floor((Math.max(0, motes) / GALAXY.motesPerNebula) * GALAXY.coinPerNebula);
}

/** かき集める指の幅の倍率（星雲のもやの毛並み「ゆらゆら」で広がる） */
export function galaxySweepMul(save: SaveData): number {
  const r = dietRatios(save.diet);
  return activeTraits(save.diet).includes('nebula') ? 1 + r.nebula * 1.5 : 1;
}

/** 6章の山場：天の川のほとりがいっぱい（銀河団をひと包みできる大きさ）になった */
export function clusterDue(save: SaveData): boolean {
  return save.habitat >= 8 && save.growthXp >= CLUSTER_XP && !hasEvent(save, 'cluster');
}

// ---- 終章 ----

/** 6章の山場のあと、3つの機関がそろって迎えに来る */
export function universeLetterDue(save: SaveData): boolean {
  return universeReady(save) && save.rep >= CHAPTER_REP.universeLetter;
}

function universeReady(save: SaveData): boolean {
  return save.habitat === 8 && hasEvent(save, 'cluster') && !hasEvent(save, 'universeLetter');
}

/** 宇宙のまんなかへ */
export function moveToUniverse(save: SaveData): SaveData {
  if (save.habitat !== 8) return save;
  return addEvent({ ...addEvent(save, 'universeLetter'), habitat: 9 }, 'universe');
}

/** しゃぼん玉の宇宙をつつける（宇宙のまんなかに住んでから） */
export function canBubbles(save: SaveData): boolean {
  return save.habitat >= 9;
}

/** いま浮かんでくる、しゃぼん玉の宇宙の数 */
export function bubbleCount(save: SaveData, now: number, speed = 1): number {
  const elapsed = Math.max(0, now - save.bubbles.at) * speed;
  const fullness = Math.min(1, save.bubbles.fullness + elapsed / (BUBBLES.regenMinutes * MINUTE));
  return Math.floor(BUBBLES.maxBubbles * fullness + 1e-9);
}

export function finishBubbles(save: SaveData, remaining: number, now: number): SaveData {
  return { ...save, bubbles: { fullness: Math.max(0, Math.min(1, remaining / BUBBLES.maxBubbles)), at: now } };
}

export function bubbleReward(popped: number): number {
  return Math.max(0, Math.floor(popped)) * BUBBLES.coinPerBubble;
}

/** しゃぼん玉の浮かぶ速さの倍率（よその宇宙のちりの毛並み「ふしぎ」でゆっくりになる） */
export function bubbleRiseMul(save: SaveData): number {
  const r = dietRatios(save.diet);
  return activeTraits(save.diet).includes('other') ? 1 / (1 + r.other * 1.5) : 1;
}

/** 次元超越級になった：一度だけ、ほこりちゃんが画面からはみ出す */
export function peekDue(save: SaveData): boolean {
  return save.habitat >= 9 && save.growthXp >= PEEK_XP && !hasEvent(save, 'peek');
}

/** すべてのほこり級：最後のお話 */
export function finaleDue(save: SaveData): boolean {
  return save.habitat >= 9 && save.growthXp >= FINAL_XP && !hasEvent(save, 'finale');
}

// ---- 夢オチと2周目 ----

/** 夢からさめられる（最後の場面を見たあと） */
export function canWakeUp(save: SaveData): boolean {
  return hasEvent(save, 'finale');
}

/**
 * 夢からさめて、はじめから（2周目）。
 * 引き継ぐ：バッグのホコリ・図鑑（ホコリ・宝物と落とし物・町の人・毛並み）・アクセサリー・形・主人公・大会の自己ベスト・音の設定。
 * 最初から：コイン・道具・すみか・成長・お話・評判・依頼・場所の積もり具合・食べたもの。
 */
export function wakeUp(save: SaveData): SaveData {
  const fresh = createInitialSave();
  return {
    ...fresh,
    hero: save.hero,
    tutorialDone: false,
    soundEnabled: save.soundEnabled,
    bag: { ...save.bag },
    dex: { dust: [...save.dex.dust], items: [...save.dex.items], people: [...save.dex.people], fur: [...save.dex.fur] },
    accessories: [...save.accessories],
    equippedAccessory: save.equippedAccessory,
    shape: { ...save.shape },
    contestBest: save.contestBest,
    // まちと掲示板のはじめての説明は、もう知っているので出さない
    events: ['town', 'board'],
    loop: save.loop + 1,
  };
}

// ---- 町づくり（寄付） ----

export function hasProject(save: SaveData, id: TownProjectId): boolean {
  return save.town.includes(id);
}

/** 寄付できるか（その章になっていて、まだできていなくて、コインが足りる） */
export function canDonate(save: SaveData, id: TownProjectId): boolean {
  const def = TOWN_PROJECTS.find((p) => p.id === id);
  return !!def && chapter(save) >= def.chapter && !hasProject(save, id) && save.coins >= def.price;
}

export function donate(save: SaveData, id: TownProjectId): { save: SaveData; ok: boolean } {
  const def = TOWN_PROJECTS.find((p) => p.id === id);
  if (!def || !canDonate(save, id)) return { save, ok: false };
  return { save: { ...save, coins: save.coins - def.price, town: [...save.town, id] }, ok: true };
}

/** 町づくりを掲示板に出すか（3章から） */
export function townProjectsOpen(save: SaveData): boolean {
  return chapter(save) >= 3;
}

/** 依頼が届く間隔（駅前の時計台で短くなる） */
export function requestIntervalMinutes(save: SaveData): number {
  return hasProject(save, 'clocktower') ? TOWN_PERKS.clockMinutes : REQUEST_INTERVAL_MINUTES;
}

/** 宇宙・銀河・しゃぼん玉で、のびる秒数（町の天文台） */
export function observatoryBonus(save: SaveData): number {
  return hasProject(save, 'observatory') ? TOWN_PERKS.observatorySeconds : 0;
}

// ---- 次の章へ進むための評判 ----

/** いまの章から次の章へ進むのに必要な評判（もう進んだ・最後の章なら null） */
export function nextRepGoal(save: SaveData): number | null {
  if (save.habitat === 4 && !hasEvent(save, 'warehouseLetter')) return CHAPTER_REP.warehouseLetter;
  if (save.habitat === 5 && !hasEvent(save, 'worldLetter')) return CHAPTER_REP.worldLetter;
  if (save.habitat === 6 && !hasEvent(save, 'spaceLetter')) return CHAPTER_REP.spaceLetter;
  if (save.habitat === 7 && !hasEvent(save, 'galaxyLetter')) return CHAPTER_REP.galaxyLetter;
  if (save.habitat === 8 && !hasEvent(save, 'universeLetter')) return CHAPTER_REP.universeLetter;
  return null;
}

/** 評判だけが足りなくて次の章へ進めないときの、あといくつ（ほかの条件がそろっていなければ null） */
export function repShortfall(save: SaveData): number | null {
  const ready = warehouseReady(save) || worldReady(save) || spaceReady(save) || galaxyReady(save) || universeReady(save);
  const goal = nextRepGoal(save);
  if (!ready || goal === null || save.rep >= goal) return null;
  return goal - save.rep;
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
  // 公園の噴水があると、町の掃除場所は少し速く積もる
  if (hasProject(save, 'fountain')) speed *= TOWN_PERKS.fountainRegen;
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
  base: 'お母さん',
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
  const ch = chapter(save);
  const scale = REQUEST_SCALE[ch] ?? REQUEST_SCALE[1];
  // 4章からは、その章の依頼主の「大きな依頼」もまじる
  const big = BIG_REQUESTS[ch];
  if (big && random() < BIG_REQUEST_CHANCE) {
    const dust = big.dust[Math.floor(random() * big.dust.length)];
    const count = Math.round((big.count[0] + random() * (big.count[1] - big.count[0])) / 10) * 10;
    return { id, kind: 'collect', client: big.client, line: big.line, dust, count, reward: big.reward, rep: 2 };
  }
  const spots = availableSpots(save);
  const types = DUST_TYPES.filter((t) => spots.some((s) => (s.dust[t] ?? 0) > 0));
  const roll = random();
  const spot = spots[Math.floor(random() * spots.length)];
  if (roll < 0.45 && types.length > 0) {
    const dust = types[Math.floor(random() * types.length)];
    const base = 5 + Math.floor(random() * 8);
    const c = COLLECT_LINES[dust];
    return { id, kind: 'collect', client: c.client, line: c.line, dust, count: base * scale.count, reward: Math.round((10 + base * 4) * scale.coin), rep: 1 };
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
      reward: Math.round((30 + spot.maxDust) * scale.coin),
      rep: 1,
    };
  }
  const item = LOST_ITEMS[Math.floor(random() * LOST_ITEMS.length)];
  return {
    id,
    kind: 'lost',
    client: AREA_CLIENT[spot.area],
    line: `${spot.name}で${item.name}をなくしてしまって……。ホコリにまぎれていないかな`,
    spot: spot.id,
    item: item.id,
    reward: Math.round(50 * scale.coin),
    rep: 2,
  };
}

/**
 * 時間がたつと依頼が届く（最大3件）。遊ばない間にたまるのも3件まで。
 * random は依頼の中身を決めるのに使う。
 */
export function refreshRequests(save: SaveData, now: number, random: () => number, speed = 1): SaveData {
  const interval = (requestIntervalMinutes(save) * MINUTE) / speed;
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
/** 依頼をことわる（評判は下がらない）。こなせない依頼で掲示板がうまったままにならないように */
export function dropRequest(save: SaveData, id: number): SaveData {
  return { ...save, requests: save.requests.filter((r) => r.id !== id) };
}

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
  { name: '山級', min: 5000 },
  { name: '大陸級', min: 12000 },
  { name: '地球級', min: 22000 },
  { name: '木星級', min: 40000 },
  { name: '太陽級', min: 60000 },
  { name: '超巨星級', min: 100000 },
  { name: '太陽系級', min: 130000 },
  { name: '銀河級', min: 170000 },
  { name: '銀河団級', min: 210000 },
  { name: '宇宙級', min: 300000 },
  { name: '多元宇宙級', min: 400000 },
  { name: '次元超越級', min: PEEK_XP },
  { name: 'すべてのほこり級', min: FINAL_XP },
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
