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

export type DustType = 'cotton' | 'lint' | 'sand' | 'fur' | 'pollen' | 'flour' | 'kosa' | 'soot' | 'chalk' | 'ash' | 'star' | 'cosmic';

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
  soot: { id: 'soot', name: 'すす', colors: ['#6e6a78', '#5a5664', '#8a8696', '#4a4654'], tint: '#b8b4c8', trait: 'いぶし銀', traitDesc: '毛並みがちょっと渋いグレーになる（見た目）' },
  chalk: { id: 'chalk', name: 'チョークの粉', colors: ['#ffffff', '#f6cfd8', '#cfe6f8', '#fbe9a0'], tint: '#f6dde6', trait: 'すべすべ', traitDesc: '空を飛ぶのが速くなる' },
  ash: { id: 'ash', name: '火山灰', colors: ['#8a8292', '#a39aa8', '#6e6676', '#c4b8b0'], tint: '#cfc6e6', trait: 'ほかほか', traitDesc: '世界のおそうじで、長押しが短くてすむ' },
  kosa: { id: 'kosa', name: '黄砂', colors: ['#e8c27a', '#d9ad5c', '#f2d699', '#c99a4a'], tint: '#f0cf8a', trait: 'ずっしり', traitDesc: '空のおそうじで吸い込む範囲が広がる' },
  star: { id: 'star', name: '星くず', colors: ['#fff6b8', '#ffe27a', '#ffffff', '#cfe6ff'], tint: '#fff2a8', trait: 'きらきら', traitDesc: '宇宙のおそうじで、軌道を変えるのが速くなる' },
  cosmic: { id: 'cosmic', name: '宇宙のちり', colors: ['#8e7cc8', '#6f6aa8', '#b49ce0', '#5a6a9e'], tint: '#b8a8ec', trait: 'ふわり', traitDesc: '宇宙のおそうじで、小惑星にぶつかってもへっちゃら' },
};

export const DUST_TYPES: readonly DustType[] = ['cotton', 'lint', 'sand', 'fur', 'pollen', 'flour', 'kosa', 'soot', 'chalk', 'ash', 'star', 'cosmic'];

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
  | 'grandmaRoom'
  | 'station'
  | 'classroom'
  | 'oldWarehouse';

/** 掃除場所がある建物 */
export type Area = 'home' | 'friend' | 'flower' | 'bakery' | 'grandma' | 'station' | 'school' | 'base';

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
  { id: 'station', area: 'station', name: '駅のホーム', desc: '電車が運んでくるすすと砂ぼこり', maxDust: 30, rewardBase: 55, regenMinutes: 60, minTier: 0, dust: { soot: 7, sand: 2, cotton: 1 } },
  { id: 'oldWarehouse', area: 'base', name: '思い出の倉庫', desc: 'ほこりちゃんの写真と歴代の掃除道具', maxDust: 30, rewardBase: 50, regenMinutes: 60, minTier: 0, dust: { cotton: 5, lint: 2, fur: 1, sand: 1, pollen: 1 } },
  { id: 'classroom', area: 'school', name: '学校の教室', desc: '黒板のチョークの粉がいっぱい', maxDust: 32, rewardBase: 60, regenMinutes: 60, minTier: 0, dust: { chalk: 7, cotton: 2, lint: 1 } },
];

export const AREA_NAMES: Record<Area, string> = {
  home: '自分の家',
  friend: '友だちの家',
  flower: '花屋さん',
  bakery: 'パン屋さん',
  grandma: 'おばあちゃんの家',
  station: '駅',
  school: '学校',
  base: '思い出の倉庫',
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

export type Habitat = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type HabitatDef = { name: string; capacity: number; price: number; inner: number };

/** 0 は勉強机の上（出会いの場所）。1〜3 はショップで買うケース。4 は空き地に置くコンテナ（2章）。5 は倉庫（3章） */
export const HABITATS: Record<Habitat, HabitatDef> = {
  0: { name: '勉強机の上', capacity: 10, price: 0, inner: 1.0 },
  1: { name: 'ケース（小）', capacity: 30, price: 40, inner: 1.8 },
  2: { name: 'ケース（中）', capacity: 100, price: 120, inner: 2.5 },
  3: { name: 'ケース（大）', capacity: 300, price: 300, inner: 3.3 },
  4: { name: '空き地のコンテナ', capacity: 1000, price: 0, inner: 4.6 },
  5: { name: '空き地の倉庫', capacity: 5000, price: 1500, inner: 9.0 },
  6: { name: '町はずれの丘', capacity: 30000, price: 0, inner: 18.0 },
  7: { name: '月のとなり', capacity: 80000, price: 0, inner: 30.0 },
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

// ---- 宝物（掃除場所ごとに眠っている思い出の品） ----

export type Treasure = { id: string; name: string; spot: SpotId; color: string };

/** 掃除場所ごとに3つ。積もった場所を掃除すると、ときどきホコリの中から見つかる */
export const TREASURES: readonly Treasure[] = [
  { id: 't_window1', spot: 'window', name: 'セミのぬけがら', color: '#c8944a' },
  { id: 't_window2', spot: 'window', name: 'ガラスのおはじき', color: '#8ec1ea' },
  { id: 't_window3', spot: 'window', name: '色あせた切手', color: '#e98aa6' },
  { id: 't_washer1', spot: 'washer', name: '片方だけのくつした', color: '#f4a7b9' },
  { id: 't_washer2', spot: 'washer', name: 'ポケットの百円玉', color: '#c9ccd4' },
  { id: 't_washer3', spot: 'washer', name: '洗われたレシート', color: '#f6f0ea' },
  { id: 't_myroom1', spot: 'myroom', name: 'どんぐり', color: '#a0644a' },
  { id: 't_myroom2', spot: 'myroom', name: 'いい匂いの消しゴム', color: '#b3d67a' },
  { id: 't_myroom3', spot: 'myroom', name: 'ひみつの日記の鍵', color: '#f2c94c' },
  { id: 't_shelf1', spot: 'shelf', name: '押し花のしおり', color: '#c7b4e6' },
  { id: 't_shelf2', spot: 'shelf', name: 'へそくりの封筒', color: '#f2d699' },
  { id: 't_shelf3', spot: 'shelf', name: '小さいころの通知表', color: '#7fb3e0' },
  { id: 't_living1', spot: 'living', name: 'テレビのリモコン', color: '#5a5664' },
  { id: 't_living2', spot: 'living', name: 'パズルの最後のピース', color: '#7fb77e' },
  { id: 't_living3', spot: 'living', name: '家族旅行のキーホルダー', color: '#f08a9a' },
  { id: 't_friendEntrance1', spot: 'friendEntrance', name: 'ねずみのおもちゃ', color: '#b8b0c8' },
  { id: 't_friendEntrance2', spot: 'friendEntrance', name: '片方の手ぶくろ', color: '#e8a868' },
  { id: 't_friendEntrance3', spot: 'friendEntrance', name: '傘のキーホルダー', color: '#6fb7a0' },
  { id: 't_friendRoom1', spot: 'friendRoom', name: '猫のひげ', color: '#ffffff' },
  { id: 't_friendRoom2', spot: 'friendRoom', name: 'キラキラのレアカード', color: '#f6d55c' },
  { id: 't_friendRoom3', spot: 'friendRoom', name: '鈴つきの首輪', color: '#f2635a' },
  { id: 't_flowerShop1', spot: 'flowerShop', name: '四つ葉のクローバー', color: '#74a35a' },
  { id: 't_flowerShop2', spot: 'flowerShop', name: '花の種のふくろ', color: '#f3cf4c' },
  { id: 't_flowerShop3', spot: 'flowerShop', name: 'ラッピングのリボン', color: '#e98aa6' },
  { id: 't_bakery1', spot: 'bakery', name: 'パンの形のマグネット', color: '#e8c070' },
  { id: 't_bakery2', spot: 'bakery', name: '先代のレシピメモ', color: '#f6f0ea' },
  { id: 't_bakery3', spot: 'bakery', name: '金色のパンの袋どめ', color: '#f2c94c' },
  { id: 't_grandmaRoom1', spot: 'grandmaRoom', name: 'おじいちゃんの万年筆', color: '#43386a' },
  { id: 't_grandmaRoom2', spot: 'grandmaRoom', name: 'ちりめんのお手玉', color: '#f08a9a' },
  { id: 't_grandmaRoom3', spot: 'grandmaRoom', name: '若いころの写真', color: '#d9c6aa' },
  { id: 't_station1', spot: 'station', name: '昔のかたい切符', color: '#f2d699' },
  { id: 't_station2', spot: 'station', name: '駅長さんの予備の笛', color: '#c9ccd4' },
  { id: 't_station3', spot: 'station', name: '汽車の模型のねじ', color: '#8a8696' },
  { id: 't_classroom1', spot: 'classroom', name: '名前入りの鉛筆', color: '#7fb77e' },
  { id: 't_classroom2', spot: 'classroom', name: '虹色のちびたチョーク', color: '#f4a7b9' },
  { id: 't_classroom3', spot: 'classroom', name: '30年前の落書きノート', color: '#cfe6ff' },
  { id: 't_oldWarehouse1', spot: 'oldWarehouse', name: 'ケース（小）の値札', color: '#f6d55c' },
  { id: 't_oldWarehouse2', spot: 'oldWarehouse', name: 'はじめてのぞうきん', color: '#f3d27a' },
  { id: 't_oldWarehouse3', spot: 'oldWarehouse', name: '最初の綿ぼこりのかけら', color: '#d4cddf' },
];

/** 宝物が出てくる確率（積もり具合がこれ以上のとき） */
export const TREASURE_CHANCE = 0.5;
export const TREASURE_MIN_FULLNESS = 0.6;
/** 宝物を見つけたときのお礼 */
export const TREASURE_COINS = 30;

/** 種類指定の依頼のセリフ（町の人は真顔でホコリを欲しがる） */
export const COLLECT_LINES: Record<DustType, { client: string; line: string }> = {
  cotton: { client: '近所のおねえさん', line: '綿ぼこりでクッションを作りたいの' },
  lint: { client: '友だちのお母さん', line: 'カラフルな糸くずを手芸に使いたくて' },
  sand: { client: '公園のおじいさん', line: '砂ぼこりで盆栽の土をつくるんじゃ' },
  fur: { client: 'おばあちゃん', line: '猫の毛でフェルトの人形をつくるのよ' },
  pollen: { client: '花屋さん', line: '花粉を集めて新しい品種を育てたいの' },
  flour: { client: 'パン屋さん', line: '粉ぼこり……捨てるのはもったいなくてね' },
  kosa: { client: '市役所の人', line: '黄砂のサンプルを研究所に送りたいんです' },
  soot: { client: '駅長さん', line: 'すすを集めて、記念の墨をつくろうと思いまして' },
  chalk: { client: '先生', line: 'チョークの粉で、図工の色砂をつくりたいの' },
  ash: { client: '世界ほこり機構', line: '火山灰の標本を、各国の博物館に配りたいのです' },
  star: { client: '宇宙ほこり管制センター', line: '星くずで、夜空の地図を描きなおしたいのです' },
  cosmic: { client: '宇宙ほこり管制センター', line: '宇宙のちりを、望遠鏡のレンズみがきに使います' },
};

// ---- アクセサリー ----


export type AccessoryId =
  | 'ribbon'
  | 'leaf'
  | 'flower'
  | 'glasses'
  | 'hat'
  | 'crown'
  | 'bandana'
  | 'bell'
  | 'cap'
  | 'goggles'
  | 'propeller'
  | 'cloudpin'
  | 'rainhat'
  | 'aurora'
  | 'globecap'
  | 'saturn'
  | 'helmet';

/** chapter：その章になるとショップに入荷する。reward はお店では買えない（出来事のごほうび） */
export type AccessoryDef = { id: AccessoryId; name: string; price: number; chapter: 1 | 2 | 3 | 4 | 5; reward?: boolean };

export const ACCESSORIES: readonly AccessoryDef[] = [
  { id: 'ribbon', name: 'リボン', price: 0, chapter: 1 },
  { id: 'leaf', name: 'はっぱ', price: 15, chapter: 1 },
  { id: 'flower', name: 'おはな', price: 25, chapter: 1 },
  { id: 'glasses', name: 'メガネ', price: 40, chapter: 1 },
  { id: 'hat', name: 'ぼうし', price: 60, chapter: 1 },
  { id: 'crown', name: 'おうかん', price: 150, chapter: 1 },
  // 2章（ご近所編）
  { id: 'bandana', name: '三角巾', price: 80, chapter: 2 },
  { id: 'bell', name: '猫の鈴', price: 100, chapter: 2 },
  { id: 'cap', name: '清掃係のぼうし', price: 140, chapter: 2 },
  // 3章（まち編）
  { id: 'goggles', name: '飛行ゴーグル', price: 220, chapter: 3 },
  { id: 'propeller', name: 'プロペラぼうし', price: 280, chapter: 3 },
  { id: 'cloudpin', name: '雲の髪かざり', price: 350, chapter: 3 },
  { id: 'rainhat', name: 'レインハット', price: 0, chapter: 3, reward: true },
  // 4章（地球編）
  { id: 'aurora', name: 'オーロラのリボン', price: 600, chapter: 4 },
  { id: 'globecap', name: '地球儀ぼうし', price: 900, chapter: 4 },
  // 5章（宇宙編）
  { id: 'saturn', name: '土星のわっか', price: 1500, chapter: 5 },
  { id: 'helmet', name: '宇宙ヘルメット', price: 2000, chapter: 5 },
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

// ---- 2章の山場：町内会の大掃除大会 ----

/** 大会のおしらせが来る条件（2章で、ほこりちゃんがこれだけ育ち、評判もたまったら） */
export const CONTEST_XP = 600;
export const CONTEST_REP = 8;

export type Rival = { name: string; score: number };

export const CONTEST = {
  /** 制限時間（秒） */
  seconds: 30,
  /** 風でホコリが飛んでくるタイミング（開始からの秒）と数。合計が満点 */
  waves: [
    { at: 0, count: 15 },
    { at: 10, count: 15 },
    { at: 20, count: 15 },
  ] as ReadonlyArray<{ at: number; count: number }>,
  mix: { cotton: 4, sand: 3, pollen: 2, fur: 2, flour: 1, lint: 1 } as Partial<Record<DustType, number>>,
  /** 風の強さ（ワールド単位/秒）。ホコリが流され、通りの外へ出たら取りこぼし */
  wind: 0.45,
  /** ほかのチーム（点数は集めたホコリの数）。いちばん上を超えれば優勝 */
  rivals: [
    { name: '八百屋さんチーム', score: 20 },
    { name: '小学校のPTA', score: 27 },
    { name: '町内会 青年部', score: 34 },
  ] as readonly Rival[],
  /** 順位ごとの賞金（1位〜4位）。ふだんの掃除1回ぶんくらい */
  prizes: [40, 20, 10, 5] as const,
  /** 初優勝のごほうび */
  firstWinBonus: 300,
  winRep: 3,
  /** 次の大会までの待ち時間（実時間・分）。くり返して稼げないように */
  cooldownMinutes: 60,
};

/** 大会の満点（飛んでくるホコリの合計） */
export const CONTEST_MAX = CONTEST.waves.reduce((s, w) => s + w.count, 0);

// ---- 図鑑 ----

/** 図鑑に載る町の人 */
export type PersonId = 'mother' | 'friend' | 'friendMom' | 'shopkeeper' | 'florist' | 'baker' | 'grandma' | 'stationMaster' | 'teacher' | 'agent' | 'controller';

export const PEOPLE: ReadonlyArray<{ id: PersonId; name: string; note: string }> = [
  { id: 'mother', name: 'お母さん', note: 'お小遣いをくれる。空き地の購入をすすめた' },
  { id: 'shopkeeper', name: '店員さん', note: '道具もケースもアクセサリーも売っている' },
  { id: 'friend', name: '友だち', note: '猫を飼っている。ほこりちゃんに興味しんしん' },
  { id: 'friendMom', name: '友だちのお母さん', note: '玄関の砂ぼこりに困っている' },
  { id: 'florist', name: '花屋さん', note: '花粉で新しい品種をつくりたい' },
  { id: 'baker', name: 'パン屋さん', note: '粉ぼこりはパンのせい' },
  { id: 'grandma', name: 'おばあちゃん', note: '猫5匹と暮らす。じつは町内会長' },
  { id: 'stationMaster', name: '駅長さん', note: '電車のすすに悩んでいる。時刻表に厳しい' },
  { id: 'teacher', name: '先生', note: 'チョークの粉で図工をしたい。生徒思い' },
  { id: 'agent', name: '世界ほこり機構の人', note: '地球規模のホコリ担当。いつも真顔' },
  { id: 'controller', name: '管制官さん', note: '宇宙ほこり管制センターの人。ヘッドセットごしでも真顔' },
];

export const PERSON_IDS: readonly PersonId[] = PEOPLE.map((p) => p.id);

// ---- 3章：空のおそうじ（ほこりちゃんに乗って） ----

export const SKY = {
  /** 満タンのときに浮かんでいる雲の数 */
  maxClouds: 12,
  /** 空から満タンまで（実時間・分） */
  regenMinutes: 45,
  /** 雲1つで集まるホコリの数 */
  perCloud: 6,
  /** 雲1つあたりのお礼（市役所から） */
  coinPerCloud: 6,
  /** 雲の種類と割合 */
  mix: { kosa: 6, pollen: 3, sand: 1 } as Partial<Record<DustType, number>>,
  /** 飛べる時間（秒） */
  seconds: 40,
};

// ---- 3章の山場：梅雨の大湿気事件 ----

export const RAINY = {
  /** 3章で、駅と学校が開いてから、ほこりちゃんがこれだけ育つと梅雨が来る */
  xp: 2500,
  /** 市役所の「乾燥パウダー大作戦」に届けるホコリ（乾いた粉で湿気を吸う） */
  need: { flour: 20, soot: 20, chalk: 20 } as Partial<Record<DustType, number>>,
  reward: 500,
  rep: 5,
};

// ---- 毛並み図鑑 ----

/** 毛並みの名前に使うことば（形容とたとえ） */
export const DUST_WORDS: Record<DustType, { adj: string; noun: string }> = {
  cotton: { adj: 'ふんわり', noun: 'わたぐも' },
  lint: { adj: 'いろとりどり', noun: 'いとまり' },
  sand: { adj: 'さらさら', noun: 'すなはま' },
  fur: { adj: 'もふもふ', noun: 'こねこ' },
  pollen: { adj: 'きいろい', noun: 'ひまわり' },
  flour: { adj: 'まっしろ', noun: 'パンきじ' },
  kosa: { adj: 'こがね', noun: 'さばく' },
  soot: { adj: 'いぶし', noun: 'すみ' },
  chalk: { adj: 'パステル', noun: 'こくばん' },
  ash: { adj: 'ほかほか', noun: 'かざん' },
  star: { adj: 'きらきら', noun: 'ほしくず' },
  cosmic: { adj: 'ふしぎな', noun: 'ぎんが' },
};

/** 1種類がこの割合以上なら「純」毛並み */
export const FUR_PURE_RATIO = 0.7;

/** 毛並みの番号。純毛並みは pure:種類、まじりは 種類+種類（DUST_TYPES の順） */
export function furId(top: DustType, second: DustType | null): string {
  if (!second || second === top) return `pure:${top}`;
  const [a, b] = DUST_TYPES.indexOf(top) < DUST_TYPES.indexOf(second) ? [top, second] : [second, top];
  return `${a}+${b}`;
}

export const FUR_IDS: readonly string[] = [
  ...DUST_TYPES.map((t) => furId(t, null)),
  ...DUST_TYPES.flatMap((a, i) => DUST_TYPES.slice(i + 1).map((b) => furId(a, b))),
];

/** 毛並みの名前（例：いぶしのひまわり毛並み、純わたぐも毛並み） */
export function furName(id: string): string {
  if (id.startsWith('pure:')) return `純${DUST_WORDS[id.slice(5) as DustType].noun}毛並み`;
  const [a, b] = id.split('+') as [DustType, DustType];
  return `${DUST_WORDS[b].adj}${DUST_WORDS[a].noun}毛並み`;
}

/** 毛並みのもとになったホコリ */
export function furParts(id: string): DustType[] {
  return id.startsWith('pure:') ? [id.slice(5) as DustType] : (id.split('+') as DustType[]);
}

// ---- 4章 地球編：世界のおそうじ（地球儀） ----

export const WORLD = {
  /** 満タンのときに地球にあるホコリの地域の数 */
  maxPatches: 10,
  /** 空から満タンまで（実時間・分） */
  regenMinutes: 60,
  /** 1地域で集まるホコリの数 */
  perPatch: 120,
  /** 1地域あたりのお礼（世界ほこり機構から） */
  coinPerPatch: 25,
  /** 地域の種類と割合（砂嵐＝黄砂、火山＝火山灰） */
  mix: { kosa: 5, ash: 4, sand: 1 } as Partial<Record<DustType, number>>,
  /** 長押しで吸い込むのにかかる秒数 */
  holdSeconds: 0.9,
  /** 遊べる時間（秒） */
  seconds: 45,
};

/** 4章の山場：ほこりちゃんが地球を一周してふかふかに包む（丘がいっぱいになったら） */
export const EARTH_WRAP_XP = 30000;

// ---- 5章 宇宙編：宇宙のおそうじ（軌道に乗せて） ----

export const SPACE = {
  /** 満タンのときに浮かんでいる星くずの群れの数 */
  maxClusters: 12,
  /** 空から満タンまで（実時間・分） */
  regenMinutes: 60,
  /** 群れ1つで集まるホコリの数 */
  perCluster: 300,
  /** 群れ1つあたりのお礼（宇宙ほこり管制センターから） */
  coinPerCluster: 40,
  /** 群れの種類と割合 */
  mix: { star: 6, cosmic: 4 } as Partial<Record<DustType, number>>,
  /** 遊べる時間（秒） */
  seconds: 45,
  /** 小惑星にぶつかったとき、ゆっくりになる秒数 */
  bumpSeconds: 1.2,
};

/** 5章の山場：太陽系のおそうじ（月のとなりがいっぱいになったら） */
export const SOLAR_XP = 80000;

// ---- なつかしの味（4章から） ----

/**
 * 町の掃除場所だけで集まるホコリ。ほこりちゃんが大きくなっても「なつかしい」と喜んで食べ、
 * 1個で何倍も育つ（空・世界・宇宙でも集まる黄砂・砂ぼこりなどは入れない）
 */
export const NOSTALGIC_DUSTS: readonly DustType[] = ['cotton', 'lint', 'fur', 'pollen', 'flour', 'soot', 'chalk'];

/** 章ごとの、なつかしの味の成長の倍率 */
export const NOSTALGIA_MUL: Partial<Record<number, number>> = { 4: 10, 5: 20 };

/** きょうの好物（なつかしの味から1日1つ）はさらにこの倍 */
export const FAVORITE_MUL = 2;
