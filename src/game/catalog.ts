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

// ---- ホコリの種類 ----

export type DustType = 'cotton' | 'lint' | 'sand' | 'fur' | 'pollen' | 'flour';

export type DustDef = {
  id: DustType;
  name: string;
  /** 掃除シーンでの色（3〜4色からランダム） */
  colors: string[];
  /** たくさん食べたときの毛並みの色味 */
  tint: string;
  /** 毛並みの名前と効果の説明 */
  trait: string;
  traitDesc: string;
};

export const DUSTS: Record<DustType, DustDef> = {
  cotton: { id: 'cotton', name: '綿ぼこり', colors: ['#c3bbd3', '#b3abc6', '#d4cddf', '#bfb3b8'], tint: '#fff8ef', trait: 'ふつう', traitDesc: 'ふわふわの基本の毛並み' },
  lint: { id: 'lint', name: '糸くず', colors: ['#dcd6e8', '#cfd9ea', '#e8c9d6', '#c9e0d4'], tint: '#e6c8f0', trait: 'カラフル', traitDesc: '毛並みに色とりどりの糸がまじる' },
  sand: { id: 'sand', name: '砂ぼこり', colors: ['#cdb79a', '#bfa889', '#d9c6aa', '#b59c7e'], tint: '#e6cb9c', trait: 'ころころ', traitDesc: '一緒の掃除で転がるのが速くなる' },
  fur: { id: 'fur', name: '猫の毛', colors: ['#f2c38f', '#ffffff', '#e8a868', '#d9d2c8'], tint: '#f4c08e', trait: 'もふもふ', traitDesc: '一緒の掃除で吸い寄せる範囲が広がる' },
  pollen: { id: 'pollen', name: '花粉', colors: ['#f6dd6a', '#f3cf4c', '#fbe9a0', '#e9c44a'], tint: '#ffe06a', trait: 'くしゃみ', traitDesc: '一緒の掃除で一度だけ「くしゃみ」で広く吸い込む' },
  flour: { id: 'flour', name: '粉ぼこり', colors: ['#fbf8f2', '#efe9df', '#f6f1e6', '#e6ddd0'], tint: '#ffffff', trait: 'さらさら', traitDesc: '湿気に強くなる' },
};

export const DUST_TYPES: readonly DustType[] = ['cotton', 'lint', 'sand', 'fur', 'pollen', 'flour'];

// ---- 掃除場所 ----

export type SpotId =
  | 'window'
  | 'washer'
  | 'myroom'
  | 'shelf'
  | 'living'
  | 'friendEntrance'
  | 'friendRoom'
  | 'flowerShop'
  | 'bakery'
  | 'grandmaRoom';

/** 掃除場所がある建物 */
export type Area = 'home' | 'friend' | 'flower' | 'bakery' | 'grandma';

export type SpotDef = {
  id: SpotId;
  area: Area;
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
  /** 出てくるホコリの種類と割合 */
  dust: Partial<Record<DustType, number>>;
};

export const SPOTS: readonly SpotDef[] = [
  { id: 'window', area: 'home', name: '窓のさん', desc: 'レールのすみに砂ぼこり', maxDust: 10, rewardBase: 10, regenMinutes: 20, minTier: 0, dust: { sand: 6, cotton: 4 } },
  { id: 'washer', area: 'home', name: '洗濯機のフィルター', desc: 'ドラム式の乾燥フィルター', maxDust: 12, rewardBase: 12, regenMinutes: 30, minTier: 0, dust: { lint: 1 } },
  { id: 'myroom', area: 'home', name: '自分の部屋', desc: '床いっぱいのホコリ', maxDust: 20, rewardBase: 20, regenMinutes: 45, minTier: 0, dust: { cotton: 8, lint: 2 } },
  { id: 'shelf', area: 'home', name: '本棚の上', desc: '手が届かない高いところ', maxDust: 14, rewardBase: 30, regenMinutes: 40, minTier: 2, dust: { cotton: 1 } },
  { id: 'living', area: 'home', name: 'リビング', desc: '家族みんなの広い部屋', maxDust: 30, rewardBase: 40, regenMinutes: 60, minTier: 3, dust: { cotton: 6, lint: 3, sand: 1 } },
  { id: 'friendEntrance', area: 'friend', name: '友だちの家の玄関', desc: 'くつのまわりに砂ぼこり', maxDust: 14, rewardBase: 20, regenMinutes: 30, minTier: 0, dust: { sand: 8, cotton: 2 } },
  { id: 'friendRoom', area: 'friend', name: '友だちの部屋', desc: '猫がいる部屋。毛がいっぱい', maxDust: 24, rewardBase: 30, regenMinutes: 50, minTier: 0, dust: { cotton: 5, fur: 4, lint: 1 } },
  { id: 'flowerShop', area: 'flower', name: '花屋さん', desc: '花粉がふわふわ舞っている', maxDust: 22, rewardBase: 35, regenMinutes: 40, minTier: 0, dust: { pollen: 7, cotton: 2, sand: 1 } },
  { id: 'bakery', area: 'bakery', name: 'パン屋さん', desc: '粉ぼこりで床がまっしろ', maxDust: 24, rewardBase: 40, regenMinutes: 45, minTier: 0, dust: { flour: 8, cotton: 2 } },
  { id: 'grandmaRoom', area: 'grandma', name: 'おばあちゃんの家', desc: '猫が5匹いるたたみの部屋', maxDust: 28, rewardBase: 45, regenMinutes: 55, minTier: 0, dust: { fur: 8, cotton: 2 } },
];

export const AREA_NAMES: Record<Area, string> = {
  home: '自分の家',
  friend: '友だちの家',
  flower: '花屋さん',
  bakery: 'パン屋さん',
  grandma: 'おばあちゃんの家',
};

/** 商店街の店や家は、評判（★）がこれだけたまると紹介してもらえる（2章から） */
export const AREA_REP: Partial<Record<Area, number>> = { flower: 0, bakery: 4, grandma: 8 };

/** ほこりちゃんがこの成長に達すると、友だちから声がかかって友だちの家に行けるようになる */
export const FRIEND_UNLOCK_XP = 30;

export const SPOT_IDS: readonly SpotId[] = SPOTS.map((s) => s.id);

export function spotDef(id: SpotId): SpotDef {
  const def = SPOTS.find((s) => s.id === id);
  if (!def) throw new Error(`unknown spot: ${id}`);
  return def;
}

/** 積もり具合がこれ未満の場所は「まだきれい」で入れない */
export const SPOT_READY_RATIO = 0.3;

// ---- ほこりちゃんの住まい ----

export type Habitat = 0 | 1 | 2 | 3 | 4;

export type HabitatDef = { name: string; capacity: number; price: number; inner: number };

/** 0 は勉強机の上（出会いの場所）。1〜3 はショップで買うケース。4 は空き地に置くコンテナ（2章） */
export const HABITATS: Record<Habitat, HabitatDef> = {
  0: { name: '勉強机の上', capacity: 10, price: 0, inner: 1.0 },
  1: { name: 'ケース（小）', capacity: 30, price: 40, inner: 1.8 },
  2: { name: 'ケース（中）', capacity: 100, price: 120, inner: 2.5 },
  3: { name: 'ケース（大）', capacity: 300, price: 300, inner: 3.3 },
  4: { name: '空き地のコンテナ', capacity: 1000, price: 0, inner: 4.6 },
};

/** 1章の山場で買う空き地（コンテナ付き）の値段 */
export const LAND_PRICE = 400;

// ---- 依頼 ----

export type LostItem = { id: string; name: string; color: string };

export const LOST_ITEMS: readonly LostItem[] = [
  { id: 'ring', name: '指輪', color: '#f2c94c' },
  { id: 'key', name: '家の鍵', color: '#b6bcc7' },
  { id: 'marble', name: 'ビー玉', color: '#8ec1ea' },
  { id: 'hairpin', name: 'ヘアピン', color: '#e98aa6' },
  { id: 'button', name: 'コートのボタン', color: '#9c6438' },
  { id: 'figure', name: '小さなフィギュア', color: '#7fb77e' },
];

/** 種類指定の依頼のセリフ（町の人は真顔でホコリを欲しがる） */
export const COLLECT_LINES: Record<DustType, { client: string; line: string }> = {
  cotton: { client: '近所のおねえさん', line: '綿ぼこりでクッションを作りたいの' },
  lint: { client: '友だちのお母さん', line: 'カラフルな糸くずを手芸に使いたくて' },
  sand: { client: '公園のおじいさん', line: '砂ぼこりで盆栽の土をつくるんじゃ' },
  fur: { client: 'おばあちゃん', line: '猫の毛でフェルトの人形をつくるのよ' },
  pollen: { client: '花屋さん', line: '花粉を集めて新しい品種を育てたいの' },
  flour: { client: 'パン屋さん', line: '粉ぼこり……捨てるのはもったいなくてね' },
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
