// セーブデータの読み書き。不正データは項目単位で初期値に戻し、例外は外に出さない。

import { createInitialSave, SAVE_VERSION, type CaseLevel, type SaveData } from './state.ts';

export const SAVE_KEY = 'hokorichan.save.v1';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const MAX_COUNT = 1_000_000_000;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Safariのプライベートモードやストレージ無効時はアクセス自体が例外になる
    return null;
  }
}

function toCount(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  return Math.min(Math.floor(value), MAX_COUNT);
}

function toBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toCaseLevel(value: unknown): CaseLevel {
  return value === 1 || value === 2 || value === 3 ? value : 1;
}

/**
 * 旧バージョンのデータを最新形式へ変換する。
 * 未来のバージョンや解釈できない形式は null（=初期化）を返す。
 */
export function migrate(raw: Record<string, unknown>): Record<string, unknown> | null {
  const version = raw.version;
  if (version === SAVE_VERSION) return raw;
  // v2以降を追加するときはここに v1→v2 の変換を積み上げる
  return null;
}

/** 任意の値を正しい SaveData に整える。 */
export function sanitize(raw: unknown): SaveData {
  const init = createInitialSave();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return init;
  const data = migrate(raw as Record<string, unknown>);
  if (!data) return init;
  return {
    version: SAVE_VERSION,
    coins: toCount(data.coins, init.coins),
    dustBag: toCount(data.dustBag, init.dustBag),
    growthXp: toCount(data.growthXp, init.growthXp),
    caseLevel: toCaseLevel(data.caseLevel),
    damp: toBool(data.damp, init.damp),
    cleanedSessions: toCount(data.cleanedSessions, init.cleanedSessions),
    soundEnabled: toBool(data.soundEnabled, init.soundEnabled),
    tutorialDone: toBool(data.tutorialDone, init.tutorialDone),
  };
}

export function loadSave(storage: StorageLike | null = defaultStorage()): SaveData {
  if (!storage) return createInitialSave();
  try {
    const text = storage.getItem(SAVE_KEY);
    if (!text) return createInitialSave();
    return sanitize(JSON.parse(text));
  } catch {
    return createInitialSave();
  }
}

/** 保存に成功したら true。容量超過などの例外は握りつぶしてゲームを止めない。 */
export function writeSave(data: SaveData, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
