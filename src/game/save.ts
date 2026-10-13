// セーブデータの読み書き。不正データは項目単位で初期値に戻し、例外は外に出さない。

import {
  ACCESSORY_IDS,
  CONTEST_MAX,
  FUR_IDS,
  DUST_TYPES,
  LOST_ITEMS,
  PERSON_IDS,
  SPOT_IDS,
  TOOLS,
  type AccessoryId,
  type DustType,
  type Habitat,
  type Hero,
  type PersonId,
  type SpotId,
  type ToolId,
} from './catalog.ts';
import {
  clampShape,
  createInitialSave,
  emptyBag,
  EVENT_IDS,
  SAVE_VERSION,
  type Bag,
  type Dex,
  type EventId,
  type Request,
  type SaveData,
  type SpotState,
} from './state.ts';

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

function toHabitat(value: unknown): Habitat {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6 || value === 7 ? value : 0;
}

function toBag(value: unknown): Bag {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const bag = emptyBag();
  for (const t of DUST_TYPES) bag[t] = toCount(raw[t], 0);
  return bag;
}

function toEvents(value: unknown): EventId[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is EventId => EVENT_IDS.includes(v as EventId)))] : [];
}

function toDex(value: unknown): Dex {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const list = <T extends string>(v: unknown, valid: readonly T[]): T[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is T => valid.includes(x as T)))] : [];
  return {
    dust: list<DustType>(raw.dust, DUST_TYPES),
    items: list<string>(raw.items, LOST_ITEMS.map((i) => i.id)),
    people: list<PersonId>(raw.people, PERSON_IDS),
    fur: list<string>(raw.fur, FUR_IDS),
  };
}

/** 依頼は形がおかしいものを捨てる（報酬や数は範囲内に丸める） */
function toRequests(value: unknown): Request[] {
  if (!Array.isArray(value)) return [];
  const out: Request[] = [];
  for (const v of value.slice(0, 3)) {
    if (typeof v !== 'object' || v === null) continue;
    const r = v as Record<string, unknown>;
    const kind = r.kind;
    if (kind !== 'collect' && kind !== 'speed' && kind !== 'lost') continue;
    const id = toCount(r.id, -1);
    if (id < 0 || typeof r.client !== 'string' || typeof r.line !== 'string') continue;
    const req: Request = { id, kind, client: r.client, line: r.line, reward: Math.min(toCount(r.reward, 0), 10_000), rep: Math.min(toCount(r.rep, 0), 10) };
    if (kind === 'collect') {
      if (!DUST_TYPES.includes(r.dust as DustType)) continue;
      req.dust = r.dust as DustType;
      req.count = Math.max(1, Math.min(toCount(r.count, 1), 999));
    } else {
      if (!SPOT_IDS.includes(r.spot as SpotId)) continue;
      req.spot = r.spot as SpotId;
      if (kind === 'speed') req.seconds = Math.max(10, Math.min(toCount(r.seconds, 60), 600));
      else {
        if (!LOST_ITEMS.some((i) => i.id === r.item)) continue;
        req.item = r.item as string;
      }
    }
    out.push(req);
  }
  return out;
}

function toHero(value: unknown): Hero | null {
  return value === 'boy' || value === 'girl' ? value : null;
}

function toIdList<T extends string>(value: unknown, valid: readonly T[], always: T): T[] {
  const list = Array.isArray(value) ? value.filter((v): v is T => valid.includes(v as T)) : [];
  return [...new Set<T>([always, ...list])];
}

function toSpotState(value: unknown, now: number): SpotState {
  const s = (typeof value === 'object' && value !== null ? value : {}) as { fullness?: unknown; at?: unknown };
  const fullness = typeof s.fullness === 'number' && Number.isFinite(s.fullness) ? Math.min(1, Math.max(0, s.fullness)) : 1;
  const at = typeof s.at === 'number' && Number.isFinite(s.at) && s.at >= 0 ? Math.min(s.at, now) : 0;
  return { fullness, at };
}

function toSpots(value: unknown, now: number): Record<string, SpotState> {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const spots: Record<string, SpotState> = {};
  for (const id of SPOT_IDS) {
    const s = raw[id] as { fullness?: unknown; at?: unknown } | undefined;
    const fullness = typeof s?.fullness === 'number' && Number.isFinite(s.fullness) ? Math.min(1, Math.max(0, s.fullness)) : 1;
    const at = typeof s?.at === 'number' && Number.isFinite(s.at) && s.at >= 0 ? Math.min(s.at, now) : 0;
    spots[id] = { fullness, at };
  }
  return spots;
}

/**
 * 旧バージョンのデータを最新形式へ変換する。
 * 未来のバージョンや解釈できない形式は null（=初期化）を返す。
 */
export function migrate(raw: Record<string, unknown>): Record<string, unknown> | null {
  let data = raw;
  if (data.version === 1) {
    // v1はケースLv1から始まり掃除機で掃除していた。進行を失わないよう引き継ぐ
    data = {
      ...data,
      version: 2,
      habitat: data.caseLevel,
      tools: ['hand', 'vacuum'],
      hero: null,
    };
  }
  if (data.version === 2) {
    // v3でまちを追加。説明やイベントは未読から始める
    data = { ...data, version: 3, townIntroDone: false, friendIntroDone: false };
  }
  if (data.version === 3) {
    // v4でホコリに種類ができた。これまでのバッグと食べた量は綿ぼこりとして引き継ぐ
    const events: EventId[] = [];
    if (data.townIntroDone === true) events.push('town');
    if (data.friendIntroDone === true) events.push('friend');
    data = {
      ...data,
      version: 4,
      bag: { cotton: data.dustBag },
      diet: { cotton: data.growthXp },
      events,
    };
  }
  if (data.version === 4) {
    // v5で図鑑と大掃除大会を追加。これまでに分かっていることから図鑑を埋めておく
    const bag = (data.bag ?? {}) as Record<string, unknown>;
    const diet = (data.diet ?? {}) as Record<string, unknown>;
    const events = Array.isArray(data.events) ? (data.events as string[]) : [];
    const rep = typeof data.rep === 'number' ? data.rep : 0;
    const dust = DUST_TYPES.filter((t) => Number(bag[t]) > 0 || Number(diet[t]) > 0);
    const people: PersonId[] = [];
    if (data.tutorialDone === true) people.push('mother');
    if (events.includes('town')) people.push('shopkeeper');
    if (events.includes('friend')) people.push('friend', 'friendMom');
    if (events.includes('street')) {
      people.push('florist');
      if (rep >= 4) people.push('baker');
      if (rep >= 8) people.push('grandma');
    }
    data = { ...data, version: 5, dex: { dust, items: [], people }, contestBest: 0 };
  }
  if (data.version === SAVE_VERSION) return data;
  return null;
}

/** 任意の値を正しい SaveData に整える。 */
export function sanitize(raw: unknown, now = Date.now()): SaveData {
  const init = createInitialSave();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return init;
  const data = migrate(raw as Record<string, unknown>);
  if (!data) return init;
  const accessories = toIdList<AccessoryId>(data.accessories, ACCESSORY_IDS, 'ribbon');
  const equipped = accessories.includes(data.equippedAccessory as AccessoryId) ? (data.equippedAccessory as AccessoryId) : null;
  const shape = (typeof data.shape === 'object' && data.shape !== null ? data.shape : {}) as Record<string, unknown>;
  return {
    version: SAVE_VERSION,
    coins: toCount(data.coins, init.coins),
    bag: toBag(data.bag),
    diet: toBag(data.diet),
    growthXp: toCount(data.growthXp, init.growthXp),
    habitat: toHabitat(data.habitat),
    damp: toBool(data.damp, init.damp),
    cleanedSessions: toCount(data.cleanedSessions, init.cleanedSessions),
    soundEnabled: toBool(data.soundEnabled, init.soundEnabled),
    tutorialDone: toBool(data.tutorialDone, init.tutorialDone),
    hero: toHero(data.hero),
    tools: toIdList<ToolId>(data.tools, Object.keys(TOOLS) as ToolId[], 'hand'),
    accessories,
    equippedAccessory: equipped,
    shape: clampShape({ width: Number(shape.width ?? 1), height: Number(shape.height ?? 1), fluff: Number(shape.fluff ?? 1) }),
    spots: toSpots(data.spots, now) as SaveData['spots'],
    rep: toCount(data.rep, 0),
    requests: toRequests(data.requests),
    requestClock: typeof data.requestClock === 'number' && Number.isFinite(data.requestClock) ? Math.max(0, data.requestClock) : 0,
    // 番号が重ならないよう、残っている依頼の番号より大きくしておく
    requestSeq: Math.max(toCount(data.requestSeq, 0), ...toRequests(data.requests).map((r) => r.id)),
    events: toEvents(data.events),
    dex: toDex(data.dex),
    contestBest: Math.min(toCount(data.contestBest, 0), CONTEST_MAX),
    sky: toSpotState(data.sky, now),
    rankDiet: toBag(data.rankDiet),
    world: toSpotState(data.world, now),
    space: toSpotState(data.space, now),
    contestAt: typeof data.contestAt === 'number' && Number.isFinite(data.contestAt) ? Math.min(Math.max(0, data.contestAt), now) : 0,
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
