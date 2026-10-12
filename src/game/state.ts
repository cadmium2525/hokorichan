// ゲームの状態とルール。描画やDOMに依存しない純粋なロジックだけを置く。
// 時刻は引数 now（ミリ秒）で受け取り、テストで固定できるようにする。

import {
  ACCESSORIES,
  HABITATS,
  SHAPE_LIMITS,
  SPOT_IDS,
  SPOT_READY_RATIO,
  TOOL_ORDER,
  TOOLS,
  type AccessoryId,
  type Habitat,
  type Hero,
  type PetShape,
  type SpotDef,
  type SpotId,
  type ToolDef,
  type ToolId,
} from './catalog.ts';

export const SAVE_VERSION = 2 as const;

/** 場所ごとの積もり具合。at の時点で fullness（0〜1）だった */
export type SpotState = { fullness: number; at: number };

export type SaveData = {
  version: typeof SAVE_VERSION;
  coins: number;
  dustBag: number;
  growthXp: number;
  /** 0=勉強机の上、1〜3=ケース */
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
};

export const REWARD_PER_DUST = 2;
export const CLEAR_RATIO = 0.8;
export const DAMP_CHANCE = 0.2;
export const DAMP_SCALE = 0.7;
const MINUTE = 60_000;

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
    dustBag: 0,
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
  };
}

// ---- 飼育 ----

export function capacityOf(habitat: Habitat): number {
  return HABITATS[habitat].capacity;
}

/** 今あげられる量。容量の残りとバッグの少ない方。 */
export function feedableAmount(save: SaveData): number {
  const room = capacityOf(save.habitat) - save.growthXp;
  return Math.max(0, Math.min(save.dustBag, room));
}

export function isFull(save: SaveData): boolean {
  return save.growthXp >= capacityOf(save.habitat);
}

/** バッグのホコリを与える。容量を超える分はバッグに残る。 */
export function feed(save: SaveData): { save: SaveData; fed: number } {
  const fed = feedableAmount(save);
  if (fed <= 0) return { save, fed: 0 };
  return {
    save: { ...save, dustBag: save.dustBag - fed, growthXp: save.growthXp + fed },
    fed,
  };
}

// ---- ショップ ----

export function nextHabitat(save: SaveData): { level: Habitat; price: number } | null {
  if (save.habitat >= 3) return null;
  const level = (save.habitat + 1) as Habitat;
  return { level, price: HABITATS[level].price };
}

export function buyHabitat(save: SaveData): { save: SaveData; ok: boolean } {
  const next = nextHabitat(save);
  if (!next || save.coins < next.price) return { save, ok: false };
  return { save: { ...save, coins: save.coins - next.price, habitat: next.level }, ok: true };
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
  if (!def || save.accessories.includes(id) || save.coins < def.price) return { save, ok: false };
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
  /** 道具が足りずに入れない */
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
    locked: bestTool(save).tier < def.minTier,
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

// ---- 湿気 ----

export function rollDamp(random: () => number): boolean {
  return random() < DAMP_CHANCE;
}

/** 乾燥は無料で即回復。XPや容量は一切変えない。 */
export function dry(save: SaveData): SaveData {
  return save.damp ? { ...save, damp: false } : save;
}

// ---- 成長の見た目 ----

export type Rank = { name: string; min: number };

export const RANKS: readonly Rank[] = [
  { name: '綿ぼこり級', min: 0 },
  { name: '手のひら級', min: 20 },
  { name: 'ぬいぐるみ級', min: 50 },
  { name: 'お部屋級', min: 100 },
];

export function rankFor(xp: number): Rank {
  let rank = RANKS[0];
  for (const r of RANKS) if (xp >= r.min) rank = r;
  return rank;
}

/** XPから本体の直径を決める。sqrtで序盤は大きく、後半もじわじわ育つ。 */
export function baseBodySize(xp: number): number {
  return 0.7 + 0.1 * Math.sqrt(Math.max(0, xp));
}

/** 机の上では小さな綿ぼこりとして見せる */
const DESK_SCALE = 0.55;

/** 表示用の直径。住まいに収まるようクランプし、湿気中は縮める。 */
export function petDisplaySize(xp: number, habitat: Habitat, damp: boolean): number {
  const base = habitat === 0 ? baseBodySize(xp) * DESK_SCALE : baseBodySize(xp);
  const size = Math.min(base, HABITATS[habitat].inner * 0.85);
  return damp ? size * DAMP_SCALE : size;
}

// ---- 清掃セッション ----

export type CleaningSession = {
  id: number;
  spot: SpotId;
  rewardBase: number;
  total: number;
  collected: Set<number>;
  rewardClaimed: boolean;
};

export function createSession(id: number, def: SpotDef, total: number): CleaningSession {
  return { id, spot: def.id, rewardBase: def.rewardBase, total, collected: new Set(), rewardClaimed: false };
}

/** 回収を記録する。同じホコリは二度数えない。 */
export function collectDust(session: CleaningSession, dustId: number): boolean {
  if (dustId < 0 || dustId >= session.total || session.collected.has(dustId)) return false;
  session.collected.add(dustId);
  return true;
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
