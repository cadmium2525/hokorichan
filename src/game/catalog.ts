// ゲーム内の定義データ（掃除場所・道具・住まい・アクセサリー・形）。数値の調整はここで行う。

export type Hero = 'boy' | 'girl';

// ---- 掃除道具 ----

export type ToolId = 'hand' | 'rag' | 'mop' | 'vacuum';

export type ToolDef = {
  id: ToolId;
  name: string;
  /** 上位ほど大きい。掃除場所の必要ランクと比べる */
  tier: number;
  price: number;
  /** 吸い取り半径（床を基準にしたワールド単位） */
  radius: number;
  /** 1個を取り終えるまでの秒数 */
  pickTime: number;
  /** この半径倍率の内側のホコリを引き寄せる（0なら引き寄せない） */
  pull: number;
  desc: string;
};

export const TOOLS: Record<ToolId, ToolDef> = {
  hand: { id: 'hand', name: '素手', tier: 0, price: 0, radius: 0.42, pickTime: 0.45, pull: 0, desc: '指でつまんで集める。' },
  rag: { id: 'rag', name: 'ぞうきん', tier: 1, price: 30, radius: 0.6, pickTime: 0.34, pull: 0, desc: 'ひと拭きで広く取れる。' },
  mop: { id: 'mop', name: 'ハンディモップ', tier: 2, price: 120, radius: 0.72, pickTime: 0.28, pull: 0, desc: '高いところに届く。' },
  vacuum: { id: 'vacuum', name: '掃除機', tier: 3, price: 300, radius: 0.9, pickTime: 0.22, pull: 1.8, desc: '近くのホコリを吸い寄せる。' },
};

export const TOOL_ORDER: readonly ToolId[] = ['hand', 'rag', 'mop', 'vacuum'];

// ---- 掃除場所（一軒家の中） ----

export type SpotId = 'window' | 'washer' | 'myroom' | 'shelf' | 'living';

export type SpotDef = {
  id: SpotId;
  name: string;
  desc: string;
  /** 満タン時のホコリの数 */
  maxDust: number;
  /** お小遣いの基本額（＋回収数×2） */
  rewardBase: number;
  /** 空から満タンまで積もる時間（実時間・分） */
  regenMinutes: number;
  /** 入るのに必要な道具ランク */
  minTier: number;
};

export const SPOTS: readonly SpotDef[] = [
  { id: 'window', name: '窓のさん', desc: 'レールのすみに綿ぼこり', maxDust: 10, rewardBase: 10, regenMinutes: 20, minTier: 0 },
  { id: 'washer', name: '洗濯機のフィルター', desc: 'ドラム式の乾燥フィルター', maxDust: 12, rewardBase: 12, regenMinutes: 30, minTier: 0 },
  { id: 'myroom', name: '自分の部屋', desc: '床いっぱいのホコリ', maxDust: 20, rewardBase: 20, regenMinutes: 45, minTier: 0 },
  { id: 'shelf', name: '本棚の上', desc: '手が届かない高いところ', maxDust: 14, rewardBase: 30, regenMinutes: 40, minTier: 2 },
  { id: 'living', name: 'リビング', desc: '家族みんなの広い部屋', maxDust: 30, rewardBase: 40, regenMinutes: 60, minTier: 3 },
];

export const SPOT_IDS: readonly SpotId[] = SPOTS.map((s) => s.id);

export function spotDef(id: SpotId): SpotDef {
  const def = SPOTS.find((s) => s.id === id);
  if (!def) throw new Error(`unknown spot: ${id}`);
  return def;
}

/** 積もり具合がこれ未満の場所は「まだきれい」で入れない */
export const SPOT_READY_RATIO = 0.3;

// ---- ほこりちゃんの住まい ----

export type Habitat = 0 | 1 | 2 | 3;

export type HabitatDef = { name: string; capacity: number; price: number; inner: number };

/** 0 は勉強机の上（出会いの場所）。1〜3 はショップで買うケース */
export const HABITATS: Record<Habitat, HabitatDef> = {
  0: { name: '勉強机の上', capacity: 10, price: 0, inner: 1.0 },
  1: { name: 'ケース（小）', capacity: 30, price: 40, inner: 1.8 },
  2: { name: 'ケース（中）', capacity: 100, price: 120, inner: 2.5 },
  3: { name: 'ケース（大）', capacity: 300, price: 300, inner: 3.3 },
};

// ---- アクセサリー ----

export type AccessoryId = 'ribbon' | 'leaf' | 'flower' | 'glasses' | 'hat' | 'crown';

export type AccessoryDef = { id: AccessoryId; name: string; price: number };

export const ACCESSORIES: readonly AccessoryDef[] = [
  { id: 'ribbon', name: 'リボン', price: 0 },
  { id: 'leaf', name: 'はっぱ', price: 15 },
  { id: 'flower', name: 'おはな', price: 25 },
  { id: 'glasses', name: 'メガネ', price: 40 },
  { id: 'hat', name: 'ぼうし', price: 60 },
  { id: 'crown', name: 'おうかん', price: 150 },
];

export const ACCESSORY_IDS: readonly AccessoryId[] = ACCESSORIES.map((a) => a.id);

// ---- 形 ----

export type PetShape = { width: number; height: number; fluff: number };

export const SHAPE_LIMITS: Record<keyof PetShape, { min: number; max: number }> = {
  width: { min: 0.75, max: 1.35 },
  height: { min: 0.7, max: 1.3 },
  fluff: { min: 0.4, max: 1.8 },
};

export const SHAPE_PRESETS: ReadonlyArray<{ name: string; shape: PetShape }> = [
  { name: 'まんまる', shape: { width: 1, height: 1, fluff: 1 } },
  { name: 'おもち', shape: { width: 1.3, height: 0.72, fluff: 0.7 } },
  { name: 'たまご', shape: { width: 0.82, height: 1.25, fluff: 0.8 } },
  { name: 'もっふもふ', shape: { width: 1.08, height: 1.05, fluff: 1.8 } },
];
