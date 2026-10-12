// ゲームの状態とルール。描画やDOMに依存しない純粋なロジックだけを置く。

export const SAVE_VERSION = 1 as const;

export type CaseLevel = 1 | 2 | 3;

export type SaveData = {
  version: typeof SAVE_VERSION;
  coins: number;
  dustBag: number;
  growthXp: number;
  caseLevel: CaseLevel;
  damp: boolean;
  cleanedSessions: number;
  soundEnabled: boolean;
  tutorialDone: boolean;
};

export const CASE_CAPACITY: Record<CaseLevel, number> = { 1: 30, 2: 100, 3: 300 };
export const UPGRADE_COST: Record<2 | 3, number> = { 2: 80, 3: 220 };

export const REWARD_BASE = 20;
export const REWARD_PER_DUST = 2;
export const CLEAR_RATIO = 0.8;
export const DAMP_CHANCE = 0.2;
export const DUST_MIN = 15;
export const DUST_MAX = 30;
export const DAMP_SCALE = 0.7;

export function createInitialSave(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 0,
    dustBag: 0,
    growthXp: 0,
    caseLevel: 1,
    damp: false,
    cleanedSessions: 0,
    soundEnabled: true,
    tutorialDone: false,
  };
}

// ---- 飼育 ----

export function caseCapacity(level: CaseLevel): number {
  return CASE_CAPACITY[level];
}

/** 今あげられる量。容量の残りとバッグの少ない方。 */
export function feedableAmount(save: SaveData): number {
  const room = caseCapacity(save.caseLevel) - save.growthXp;
  return Math.max(0, Math.min(save.dustBag, room));
}

export function isCaseFull(save: SaveData): boolean {
  return save.growthXp >= caseCapacity(save.caseLevel);
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

export function nextUpgradeCost(save: SaveData): number | null {
  if (save.caseLevel === 1) return UPGRADE_COST[2];
  if (save.caseLevel === 2) return UPGRADE_COST[3];
  return null;
}

export function canUpgrade(save: SaveData): boolean {
  const cost = nextUpgradeCost(save);
  return cost !== null && save.coins >= cost;
}

export function upgradeCase(save: SaveData): { save: SaveData; ok: boolean } {
  const cost = nextUpgradeCost(save);
  if (cost === null || save.coins < cost) return { save, ok: false };
  const caseLevel = (save.caseLevel + 1) as CaseLevel;
  return { save: { ...save, coins: save.coins - cost, caseLevel }, ok: true };
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

/** ケース内寸（ワールド単位）。PetSceneと表示スケールのクランプで共有する。 */
export const CASE_INNER: Record<CaseLevel, number> = { 1: 1.8, 2: 2.5, 3: 3.3 };

/** XPから本体の直径を決める。sqrtで序盤は大きく、後半もじわじわ育つ。 */
export function baseBodySize(xp: number): number {
  return 0.7 + 0.1 * Math.sqrt(Math.max(0, xp));
}

/** 表示用の直径。ケースに収まるようクランプし、湿気中は縮める。 */
export function petDisplaySize(xp: number, level: CaseLevel, damp: boolean): number {
  const size = Math.min(baseBodySize(xp), CASE_INNER[level] * 0.85);
  return damp ? size * DAMP_SCALE : size;
}

// ---- 清掃セッション ----

export type CleaningSession = {
  id: number;
  total: number;
  collected: Set<number>;
  rewardClaimed: boolean;
};

export function createSession(id: number, total: number): CleaningSession {
  return { id, total, collected: new Set(), rewardClaimed: false };
}

/** 回収を記録する。同じホコリは二度数えない。 */
export function collectDust(session: CleaningSession, dustId: number): boolean {
  if (dustId < 0 || dustId >= session.total || session.collected.has(dustId)) return false;
  session.collected.add(dustId);
  return true;
}

export function clearRatio(session: CleaningSession): number {
  return session.total > 0 ? session.collected.size / session.total : 0;
}

/** 達成に必要な回収数（80%を切り上げ） */
export function requiredCount(session: CleaningSession): number {
  // 浮動小数の誤差で1個ずれないよう、割合を整数比で計算する
  return Math.ceil((session.total * Math.round(CLEAR_RATIO * 100)) / 100);
}

export function canClaimReward(session: CleaningSession): boolean {
  return !session.rewardClaimed && session.collected.size >= requiredCount(session);
}

export function rewardFor(collected: number): number {
  return REWARD_BASE + collected * REWARD_PER_DUST;
}

/** 報酬確定。セッションにつき1回だけ。 */
export function claimReward(
  save: SaveData,
  session: CleaningSession,
): { save: SaveData; reward: number } | null {
  if (!canClaimReward(session)) return null;
  session.rewardClaimed = true;
  const reward = rewardFor(session.collected.size);
  return {
    save: { ...save, coins: save.coins + reward, cleanedSessions: save.cleanedSessions + 1 },
    reward,
  };
}
