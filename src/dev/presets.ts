// 開発用：章や山場の直前など、確かめたい場面の保存データをすぐ作る。
// ゲームの仕組み（state.ts）だけを使う純粋な関数なので、テストでも検証できる。

import { ACCESSORIES, DUST_TYPES, EARTH_WRAP_XP, SOLAR_XP, FUR_IDS, LOST_ITEMS, PERSON_IDS, RAINY, type DustType, type Hero } from '../game/catalog.ts';
import { capacityOf, createInitialSave, emptyBag, type Bag, type EventId, type SaveData } from '../game/state.ts';

export type Preset = { id: string; group: string; name: string; note: string; make: (hero: Hero) => SaveData };

const CH1_EVENTS: EventId[] = ['town', 'friend', 'board'];
const CH2_EVENTS: EventId[] = [...CH1_EVENTS, 'landMeeting', 'container', 'street', 'together'];
const CH3_EVENTS: EventId[] = [...CH2_EVENTS, 'contestNotice', 'contestWon', 'warehouseLetter', 'warehouse', 'sky'];
const CH4_EVENTS: EventId[] = [...CH3_EVENTS, 'cityTown', 'rainy', 'rainyDone', 'worldLetter', 'world'];

function bagOf(n: number, types: readonly DustType[] = DUST_TYPES): Bag {
  const bag = emptyBag();
  for (const t of types) bag[t] = n;
  return bag;
}

function base(hero: Hero, patch: Partial<SaveData>): SaveData {
  const s = createInitialSave();
  return {
    ...s,
    hero,
    tutorialDone: true,
    soundEnabled: false,
    cleanedSessions: 10,
    ...patch,
    diet: patch.diet ?? { ...emptyBag(), cotton: patch.growthXp ?? 0 },
  };
}

export const PRESETS: readonly Preset[] = [
  { id: 'new', group: 'はじめ', name: 'まっさら', note: '主人公選択から（保存を消すのと同じ）', make: () => createInitialSave() },
  {
    id: 'desk',
    group: '1章 おうち編',
    name: '机の上（チュートリアル後）',
    note: '成長5・素手',
    make: (h) => base(h, { growthXp: 5, coins: 20, bag: bagOf(3, ['cotton']) }),
  },
  {
    id: 'caseM',
    group: '1章 おうち編',
    name: 'ケース（中）・友だちの家',
    note: '成長60・ぞうきん/モップ',
    make: (h) => base(h, { growthXp: 60, habitat: 2, coins: 200, tools: ['hand', 'rag', 'mop'], events: CH1_EVENTS, bag: bagOf(10, ['cotton', 'lint', 'sand']) }),
  },
  {
    id: 'landMeeting',
    group: '1章 おうち編',
    name: '家族会議の直前',
    note: 'ケース（大）がいっぱい（成長300）。帰ると家族会議',
    make: (h) => base(h, { growthXp: 300, habitat: 3, coins: 600, tools: ['hand', 'rag', 'mop', 'vacuum'], events: CH1_EVENTS }),
  },
  {
    id: 'ch2',
    group: '2章 ご近所編',
    name: 'コンテナに引っこした直後',
    note: '成長320・商店街のお話はまちに出たとき',
    make: (h) => base(h, { growthXp: 320, habitat: 4, coins: 300, tools: ['hand', 'rag', 'mop', 'vacuum'], events: [...CH1_EVENTS, 'landMeeting', 'container'] }),
  },
  {
    id: 'contestDue',
    group: '2章 ご近所編',
    name: '大掃除大会のおしらせ直前',
    note: '成長600・評判★8。帰るとおしらせ',
    make: (h) => base(h, { growthXp: 600, habitat: 4, coins: 500, rep: 8, tools: ['hand', 'rag', 'mop', 'vacuum'], events: CH2_EVENTS }),
  },
  {
    id: 'contestReady',
    group: '2章 ご近所編',
    name: '大会に出られる',
    note: '掲示板から出場（待ち時間なし）',
    make: (h) => base(h, { growthXp: 700, habitat: 4, coins: 500, rep: 10, tools: ['hand', 'rag', 'mop', 'vacuum'], events: [...CH2_EVENTS, 'contestNotice'] }),
  },
  {
    id: 'warehouseDue',
    group: '3章 まち編',
    name: '市役所の手紙の直前',
    note: '清掃係・コンテナいっぱい（成長1000）・2000コイン',
    make: (h) => base(h, { growthXp: 1000, habitat: 4, coins: 2000, rep: 13, tools: ['hand', 'rag', 'mop', 'vacuum'], events: [...CH2_EVENTS, 'contestNotice', 'contestWon'] }),
  },
  {
    id: 'ch3',
    group: '3章 まち編',
    name: '倉庫で空を飛べる',
    note: '成長1200・雲満タン。まちに出ると駅長さんと先生',
    make: (h) => base(h, { growthXp: 1200, habitat: 5, coins: 800, rep: 15, tools: ['hand', 'rag', 'mop', 'vacuum'], events: CH3_EVENTS }),
  },
  {
    id: 'rainyDue',
    group: '3章 まち編',
    name: '梅雨の直前',
    note: '駅・学校あり、成長2500。帰ると梅雨',
    make: (h) => base(h, { growthXp: RAINY.xp, habitat: 5, coins: 800, rep: 18, tools: ['hand', 'rag', 'mop', 'vacuum'], events: [...CH3_EVENTS, 'cityTown'] }),
  },
  {
    id: 'rainyReady',
    group: '3章 まち編',
    name: '梅雨中・届け物そろい',
    note: '掲示板で「届ける！」→梅雨明け',
    make: (h) => {
      const bag = emptyBag();
      for (const [t, n] of Object.entries(RAINY.need)) bag[t as DustType] = (n ?? 0) + 5;
      return base(h, { growthXp: RAINY.xp + 10, habitat: 5, coins: 800, rep: 18, damp: true, bag, tools: ['hand', 'rag', 'mop', 'vacuum'], events: [...CH3_EVENTS, 'cityTown', 'rainy'] });
    },
  },
  {
    id: 'ch3done',
    group: '3章 まち編',
    name: '3章クリア後',
    note: '梅雨明け済み・倉庫いっぱい（成長5000）',
    make: (h) =>
      base(h, {
        growthXp: 5000,
        habitat: 5,
        coins: 3000,
        rep: 25,
        tools: ['hand', 'rag', 'mop', 'vacuum'],
        accessories: ['ribbon', 'rainhat'],
        events: [...CH3_EVENTS, 'cityTown', 'rainy', 'rainyDone'],
      }),
  },
  {
    id: 'worldDue',
    group: '4章 地球編',
    name: '世界ほこり機構が来る直前',
    note: '3章クリア・倉庫いっぱい。帰ると手紙→丘へ',
    make: (h) =>
      base(h, {
        growthXp: 5000,
        habitat: 5,
        coins: 3000,
        rep: 25,
        tools: ['hand', 'rag', 'mop', 'vacuum'],
        accessories: ['ribbon', 'rainhat'],
        events: [...CH3_EVENTS, 'cityTown', 'rainy', 'rainyDone'],
      }),
  },
  {
    id: 'ch4',
    group: '4章 地球編',
    name: '丘で世界のおそうじ',
    note: '成長8000・地域満タン',
    make: (h) =>
      base(h, {
        growthXp: 8000,
        habitat: 6,
        coins: 3000,
        rep: 28,
        tools: ['hand', 'rag', 'mop', 'vacuum'],
        accessories: ['ribbon', 'rainhat'],
        events: [...CH3_EVENTS, 'cityTown', 'rainy', 'rainyDone', 'worldLetter', 'world'],
      }),
  },
  {
    id: 'earthWrapDue',
    group: '4章 地球編',
    name: '地球をひと回りする直前',
    note: '丘いっぱい（成長30000）。帰ると4章の山場',
    make: (h) =>
      base(h, {
        growthXp: EARTH_WRAP_XP,
        habitat: 6,
        coins: 5000,
        rep: 30,
        tools: ['hand', 'rag', 'mop', 'vacuum'],
        accessories: ['ribbon', 'rainhat'],
        events: [...CH3_EVENTS, 'cityTown', 'rainy', 'rainyDone', 'worldLetter', 'world'],
      }),
  },
  {
    id: 'spaceDue',
    group: '5章 宇宙編',
    name: '管制センターが来る直前',
    note: '4章クリア・丘いっぱい。帰ると連絡→月のとなりへ',
    make: (h) =>
      base(h, {
        growthXp: EARTH_WRAP_XP,
        habitat: 6,
        coins: 5000,
        rep: 30,
        tools: ['hand', 'rag', 'mop', 'vacuum'],
        accessories: ['ribbon', 'rainhat'],
        events: [...CH4_EVENTS, 'earthWrap'],
      }),
  },
  {
    id: 'ch5',
    group: '5章 宇宙編',
    name: '月のとなりで宇宙のおそうじ',
    note: '成長35000・星くず満タン',
    make: (h) =>
      base(h, {
        growthXp: 35000,
        habitat: 7,
        coins: 6000,
        rep: 32,
        tools: ['hand', 'rag', 'mop', 'vacuum'],
        accessories: ['ribbon', 'rainhat'],
        events: [...CH4_EVENTS, 'earthWrap', 'spaceLetter', 'space'],
      }),
  },
  {
    id: 'sunCenter',
    group: '5章 宇宙編',
    name: '太陽級（宇宙のまんなかが太陽）',
    note: '成長65000',
    make: (h) =>
      base(h, {
        growthXp: 65000,
        habitat: 7,
        coins: 8000,
        rep: 34,
        tools: ['hand', 'rag', 'mop', 'vacuum'],
        accessories: ['ribbon', 'rainhat'],
        events: [...CH4_EVENTS, 'earthWrap', 'spaceLetter', 'space'],
      }),
  },
  {
    id: 'solarDue',
    group: '5章 宇宙編',
    name: '太陽系をひと回りする直前',
    note: '月のとなりいっぱい（成長80000）。帰ると5章の山場',
    make: (h) =>
      base(h, {
        growthXp: SOLAR_XP,
        habitat: 7,
        coins: 9000,
        rep: 35,
        tools: ['hand', 'rag', 'mop', 'vacuum'],
        accessories: ['ribbon', 'rainhat'],
        events: [...CH4_EVENTS, 'earthWrap', 'spaceLetter', 'space'],
      }),
  },
];

// ---- 部分的な書きかえ（いまの保存データに足す） ----

export type Tweak = { id: string; name: string; apply: (s: SaveData) => SaveData };

export const TWEAKS: readonly Tweak[] = [
  { id: 'coins', name: 'コイン +1000', apply: (s) => ({ ...s, coins: s.coins + 1000 }) },
  { id: 'bag', name: 'ホコリ 全種 +50', apply: (s) => ({ ...s, bag: Object.fromEntries(DUST_TYPES.map((t) => [t, s.bag[t] + 50])) as Bag }) },
  { id: 'rep', name: '評判 +5', apply: (s) => ({ ...s, rep: s.rep + 5 }) },
  { id: 'tools', name: '道具ぜんぶ', apply: (s) => ({ ...s, tools: ['hand', 'rag', 'mop', 'vacuum'] }) },
  { id: 'acc', name: 'アクセサリーぜんぶ', apply: (s) => ({ ...s, accessories: ACCESSORIES.map((a) => a.id) }) },
  { id: 'spots', name: '掃除場所を満タン', apply: (s) => ({ ...s, spots: Object.fromEntries(Object.keys(s.spots).map((k) => [k, { fullness: 1, at: 0 }])) as SaveData['spots'] }) },
  { id: 'sky', name: '空の雲・地球の地域・星くずを満タン', apply: (s) => ({ ...s, sky: { fullness: 1, at: 0 }, world: { fullness: 1, at: 0 }, space: { fullness: 1, at: 0 } }) },
  { id: 'contest', name: '大会の待ち時間を消す', apply: (s) => ({ ...s, contestAt: 0 }) },
  { id: 'requests', name: '依頼をすぐ届く状態に', apply: (s) => ({ ...s, requests: [], requestClock: 0 }) },
  { id: 'dry', name: 'しっとりを乾かす', apply: (s) => ({ ...s, damp: false }) },
  {
    id: 'dex',
    name: '図鑑をぜんぶ埋める',
    apply: (s) => ({ ...s, dex: { dust: [...DUST_TYPES], items: LOST_ITEMS.map((i) => i.id), people: [...PERSON_IDS], fur: [...FUR_IDS] } }),
  },
  { id: 'fullHome', name: 'すみかいっぱいまで成長', apply: (s) => ({ ...s, growthXp: capacityOf(s.habitat) }) },
];
