// ゲーム全体の進行。状態遷移 BOOT→HOME→TOWN→CLEANING→RESULT を管理し、
// ルールは state.ts、保存は save.ts、描画は scenes/render、画面の中身は ui に任せる。

import { petTint } from '../render/hokorichan.ts';
import type { CharacterId } from '../render/pixelCharacters.ts';
import { PixelRenderer } from '../render/pixelRenderer.ts';
import { buildContest, buildSpot } from '../render/spotBuilder.ts';
import type { BuildingId } from '../render/townBuilder.ts';
import { CleaningScene } from '../scenes/CleaningScene.ts';
import { PetScene, type PetView } from '../scenes/PetScene.ts';
import { EarthScene } from '../scenes/EarthScene.ts';
import { SpaceScene } from '../scenes/SpaceScene.ts';
import { GalaxyScene } from '../scenes/GalaxyScene.ts';
import { BubbleScene } from '../scenes/BubbleScene.ts';
import { SkyScene } from '../scenes/SkyScene.ts';
import { TownScene } from '../scenes/TownScene.ts';
import { pickTalk, type TownPerson } from './talk.ts';
import { dayPhase, isSleepTime } from './clock.ts';
import type { GameScene } from '../scenes/types.ts';
import { Hud, type ButtonSpec } from '../ui/hud.ts';
import { canShareImage, makePhotoCard, savePhoto, shareImage, type Photo } from '../ui/photo.ts';
import {
  boardBody,
  contestResultBody,
  dexBody,
  DEX_TABS,
  type DexTab,
  feedBody,
  skyResultBody,
  worldResultBody,
  spaceResultBody,
  galaxyResultBody,
  bubbleResultBody,
  heroSelectBody,
  landBody,
  mapBody,
  playBody,
  resultBody,
  shopBody,
  storyBody,
  type ShopTab,
  type Speaker,
} from '../ui/screens.ts';
import { Sound } from './audio.ts';
import {
  ACCESSORY_IDS,
  AREA_NAMES,
  AREA_REP,
  CONTEST,
  CONTEST_MAX,
  DUST_TYPES,
  furName,
  RAINY,
  WORLD,
  SPACE,
  GALAXY,
  BUBBLES,
  SKY,
  DUSTS,
  FRIEND_UNLOCK_XP,
  HABITATS,
  LAND_PRICE,
  LOST_ITEMS,
  TREASURE_COINS,
  type Treasure,
  PEOPLE,
  PERSON_IDS,
  SHAPE_PRESETS,
  spotDef,
  SPOT_IDS,
  TOOLS,
  type AccessoryId,
  type Area,
  type DustType,
  type Hero,
  type PersonId,
  type PetShape,
  type SpotDef,
  type SpotId,
  type ToolId,
} from './catalog.ts';
import { createRandom, type Random } from './rng.ts';
import { loadSave, writeSave } from './save.ts';
import {
  addEvent,
  areaUnlocked,
  bagTotal,
  bestTool,
  buyAccessory,
  buyHabitat,
  buyLand,
  buyTool,
  canCleanTogether,
  canClaimReward,
  capacityOf,
  clampShape,
  claimReward,
  collectDust,
  completeRequest,
  canFly,
  canWorld,
  cityTownDue,
  contestDue,
  contestResult,
  contestWaitMinutes,
  enterContest,
  createSession,
  dampChance,
  deliverRequest,
  deliverRainy,
  dexAdd,
  earthWrapDue,
  canSpace,
  canGalaxy,
  bubbleCount,
  bubbleReward,
  bubbleRiseMul,
  canBubbles,
  finaleDue,
  finishBubbles,
  moveToUniverse,
  peekDue,
  universeLetterDue,
  clusterDue,
  finishGalaxy,
  galaxyLetterDue,
  galaxyNebulae,
  galaxyReward,
  galaxySweepMul,
  moveToGalaxy,
  finishSpace,
  moveToSpace,
  solarDue,
  spaceBumpSeconds,
  spaceCenter,
  spaceClusters,
  spaceLetterDue,
  spaceReward,
  spaceTurnMul,
  finishWorld,
  moveToHill,
  worldHoldSeconds,
  worldLetterDue,
  worldPatches,
  worldReward,
  dietRatios,
  finishSky,
  skyClouds,
  rainyActive,
  rainyDue,
  skyBlocked,
  skyRadiusMul,
  skySpeedMul,
  skyReward,
  warehouseDue,
  dry,
  feed,
  feedableAmount,
  favoriteDust,
  localDay,
  nostalgiaActive,
  findRequest,
  finishSpot,
  friendUnlocked,
  hasEvent,
  helperStats,
  isFull,
  landMeetingDue,
  rankFor,
  refreshRequests,
  REWARD_PER_DUST,
  requiredCount,
  rewardFor,
  rollDamp,
  rollDustTypes,
  rollTreasure,
  spotTreasures,
  startSpot,
  toggleAccessory,
  type CleaningSession,
  type SaveData,
} from './state.ts';

export type Mode = 'BOOT' | 'HOME' | 'TOWN' | 'CLEANING' | 'SKY' | 'WORLD' | 'SPACE' | 'GALAXY' | 'BUBBLES' | 'RESULT';

type Overlay = 'none' | 'dest' | 'photo' | 'hero' | 'story' | 'map' | 'shop' | 'play' | 'feed' | 'board' | 'land' | 'confirm' | 'result' | 'help' | 'lot';

/** URLパラメータによるテスト用設定（?seed=123&damp=1&fast=1 など） */
type DebugParams = { seed: number | null; damp: boolean | null; speed: number; hour: number | null };

function readParams(): DebugParams {
  const q = new URLSearchParams(location.search);
  const seed = q.get('seed');
  const damp = q.get('damp');
  const hour = q.get('hour');
  return {
    seed: seed !== null && /^\d+$/.test(seed) ? Number(seed) : null,
    damp: damp === '1' ? true : damp === '0' ? false : null,
    // ホコリが積もる速さ・依頼が届く速さを60倍にする（1分で1時間分）
    speed: q.get('fast') === '1' ? 60 : 1,
    // 時刻を決めて確かめる（例：?hour=23 で夜）
    hour: hour !== null && /^\d{1,2}(\.\d+)?$/.test(hour) && Number(hour) < 24 ? Number(hour) : null,
  };
}

type StoryStep = { speaker: Speaker; text: string; button: string; enter?: (scene: PetScene | null) => void };

const HOW_TO =
  '「おそうじ」で家の中の場所をえらんで、指でなぞってホコリを集めよう。<br>' +
  'ホコリには種類があって、何を食べさせるかで<b>毛並み</b>が変わるよ。<br>' +
  '「おでかけ」すると、<b>ショップ</b>で道具やケースを買えたり、<b>掲示板</b>で町の人の依頼を受けられるよ。<br>' +
  'ホコリは時間がたつとまた積もるから、待つ間は「あそぶ」でなでたり着せかえたりしよう！';

const TOWN_INTRO: StoryStep[] = [
  {
    speaker: 'narration',
    text: 'ここは家のまわりの<b>まち</b>。<br>行きたい場所をタップすると歩いていくよ。<br>ショップでは掃除用具やケースが、掲示板では町の人の依頼が見られるよ。',
    button: 'わかった',
  },
];

const FRIEND_INTRO: StoryStep[] = [
  { speaker: 'friend', text: 'いらっしゃい！ うわさの「ほこりちゃん」、そんなに大きくなったんだ！', button: 'えへへ' },
  { speaker: 'friendMom', text: 'うちも最近ホコリがたまって困ってたの。おそうじしてくれたら、<b>お小遣い</b>をあげるわね。', button: 'まかせて！' },
  { speaker: 'hero', text: '自分の家のホコリが積もるまでは、友だちの家をおそうじしよう！', button: '次へ' },
];

const BOARD_INTRO: StoryStep[] = [
  {
    speaker: 'narration',
    text: '町の<b>掲示板</b>。町の人からの依頼が貼ってある。<br>こなすとお小遣いと<b>評判（★）</b>がもらえるよ。<br>評判が上がると、新しい場所を紹介してもらえるかも。',
    button: 'みてみる',
  },
];

/** 1章の山場：ケース（大）に入らなくなって家族会議 */
const LAND_MEETING: StoryStep[] = [
  { speaker: 'narration', text: 'ほこりちゃんが大きくなりすぎて、ケースのふたが閉まらなくなった！', button: 'どうしよう' },
  { speaker: 'hero', text: 'お母さん、ほこりちゃんがケースに入らないよ。', button: '次へ' },
  {
    speaker: 'mother',
    text: 'あら、ほんとね。そういえば、近所の<b>空き地</b>が売りに出てたわよ。コンテナ付きで<b>' + LAND_PRICE + 'コイン</b>ですって。<br>お小遣いで買ってきたら？',
    button: 'そうする！',
  },
  { speaker: 'narration', text: 'まちの空き地に行って、土地を買おう。', button: 'わかった' },
];

const CONTAINER_STORY: StoryStep[] = [
  { speaker: 'narration', text: 'トラックがやってきて、空き地にコンテナを置いていった。', button: '次へ' },
  { speaker: 'mother', text: 'これで広々ね。ごはんの時間には帰ってくるのよ。<br>おうちの掃除も、帰ってきたときにお願いね。', button: 'はーい' },
  {
    speaker: 'narration',
    text: 'ほこりちゃんは<b>おうち級</b>になった！<br>これからは<b>一緒に掃除</b>に行けるよ。掃除のあいだ、ほこりちゃんが転がってホコリを吸い込んでくれる。<br>指でなぞると、ついてくるよ。<br>ショップに<b>新しいアクセサリー</b>も入荷したみたい。',
    button: 'いこう！',
  },
];

const STREET_INTRO: StoryStep[] = [
  {
    speaker: 'florist',
    text: 'あなたがうわさの、ほこりちゃんの子ね！ うちの花屋、花粉がたまって大変なの。おそうじお願いできる？',
    button: 'もちろん！',
  },
  { speaker: 'narration', text: '南の<b>商店街</b>に行けるようになった！<br>掲示板の依頼をこなして評判を上げると、ほかのお店も紹介してもらえるよ。', button: 'わかった' },
];

/** 2章の山場：大会のおしらせ（おばあちゃんは町内会長） */
const CONTEST_NOTICE: StoryStep[] = [
  {
    speaker: 'grandma',
    text: '町内会長のわたしから、おしらせよ。<br>こんど商店街で<b>町内会の大掃除大会</b>をやるの。あなたも出てみない？',
    button: '出たい！',
  },
  {
    speaker: 'grandma',
    text: 'ほこりちゃんは……大きすぎて一人で通りが片づいちゃうから、<b>審査員席</b>で応援してもらうわね。<br>集めたホコリは町内会でまとめて引き取るわ。',
    button: 'なるほど',
  },
  {
    speaker: 'narration',
    text:
      '<b>掲示板</b>から大掃除大会に出られるよ。<br>' +
      CONTEST.seconds +
      '秒のあいだに風で3回ホコリが飛んでくる。いちばん多く集めたチームが優勝！<br>大会は' +
      CONTEST.cooldownMinutes +
      '分ごとに開かれるよ。',
    button: 'わかった',
  },
];

const CONTEST_WIN: StoryStep[] = [
  {
    speaker: 'grandma',
    text: '優勝はほこりちゃんチーム！<br>町内会長として、あなたを<b>「町の清掃係」</b>に任命します。',
    button: 'つつしんで！',
  },
  { speaker: 'florist', text: '町の清掃係さん、これからもよろしくね。花粉もよろしくね。', button: 'はい！' },
  { speaker: 'mother', text: 'まあ、清掃係ですって。えらいわね。<br>でも宿題もちゃんとするのよ。', button: 'はーい' },
  {
    speaker: 'narration',
    text: '評判★+' + CONTEST.winRep + '！ <b>町の清掃係</b>になった。<br>（2章 ご近所編 おしまい。ほこりちゃんがコンテナいっぱいに育ったら、3章「まち編」へ）',
    button: 'やったー！',
  },
];

/** 3章の入口：市役所から倉庫の許可 */
const WAREHOUSE_LETTER: StoryStep[] = [
  { speaker: 'narration', text: 'ほこりちゃんがコンテナいっぱいに大きくなった。<br>そこへ、<b>市役所</b>から手紙が届いた。', button: '読む' },
  {
    speaker: 'narration',
    text: '「町の清掃係さんへ。<br>空き地に<b>倉庫</b>を建てることを許可します。<br>大きくなった相棒さんと、町の空もきれいにしてください。　市役所」',
    button: '次へ',
  },
  { speaker: 'mother', text: 'あら、市役所から。倉庫なら<b>ショップ</b>で注文できるそうよ。<br>お小遣い、ちゃんと貯めてる？', button: 'うん！' },
];

const WAREHOUSE_STORY: StoryStep[] = [
  { speaker: 'narration', text: '空き地に<b>倉庫</b>が建った！ ほこりちゃんはまだまだ大きくなれる。', button: '次へ' },
  {
    speaker: 'narration',
    text: 'ほこりちゃんの背中に乗れるようになった！<br>「<b>空へ</b>」で町の上を飛んで、<b>黄砂</b>や花粉の雲を吸い込もう。<br>指でさした方へ飛んでいくよ。<br>ショップには空にぴったりの<b>アクセサリー</b>も入荷！',
    button: '乗ってみる！',
  },
];

/** 3章：駅長さんと先生から声がかかる */
const CITY_TOWN: StoryStep[] = [
  {
    speaker: 'stationMaster',
    text: '町の清掃係さんですね。駅長です。<br>電車が<b>すす</b>を運んでくるので、ホームがいつも黒くて……。',
    button: 'まかせて！',
  },
  { speaker: 'teacher', text: 'わたしは学校の先生よ。教室が<b>チョークの粉</b>でまっしろなの。放課後にお願いできる？', button: 'はい！' },
  { speaker: 'narration', text: 'まちの北に<b>駅</b>と<b>学校</b>が開いた！<br>新しいホコリ「すす」「チョークの粉」が集まるよ。', button: 'わかった' },
];

/** 3章の山場：梅雨の大湿気事件 */
const RAINY_START: StoryStep[] = [
  { speaker: 'narration', text: '梅雨がやってきた。何日も雨がやまない……。<br>町じゅうのホコリがしっとりして、ほこりちゃんも<b>ぺしゃんこ</b>になった。', button: 'たいへん！' },
  {
    speaker: 'stationMaster',
    text: '市役所から緊急のおしらせです。<br>「乾いたホコリを集めて<b>乾燥パウダー</b>をつくり、町じゅうにまいて湿気を吸わせる」とのこと。',
    button: 'なるほど',
  },
  {
    speaker: 'teacher',
    text: '<b>粉ぼこり・すす・チョークの粉</b>を20個ずつ、掲示板の「乾燥パウダー大作戦」に届けてほしいそうよ。<br>パン屋さん・駅・学校で集められるわ。雨のあいだは空は飛べないから気をつけてね。',
    button: '集めてくる！',
  },
];

const RAINY_END: StoryStep[] = [
  { speaker: 'narration', text: '乾燥パウダーを町じゅうにまいた。<br>しっとりしていた町が、みるみる乾いていく……！', button: '次へ' },
  { speaker: 'narration', text: '雲のすきまから日がさした。梅雨明けだ！<br>ほこりちゃんは今までで一番<b>ふっかふか</b>になった。', button: 'やったー！' },
  { speaker: 'mother', text: '町を乾かしたんですって？ えらいわね。<br>市役所の人がお礼に<b>レインハット</b>をくださったわよ。', button: 'ありがとう！' },
  {
    speaker: 'narration',
    text: 'ごほうび：' + RAINY.reward + 'コイン・評判★+' + RAINY.rep + '・レインハット！<br>（3章 まち編 おしまい。ほこりちゃんが倉庫いっぱいに育ったら、4章「地球編」へ）',
    button: 'やったー！',
  },
];

/** 4章のはじまり：世界ほこり機構から */
const WORLD_LETTER: StoryStep[] = [
  { speaker: 'narration', text: 'ほこりちゃんが倉庫いっぱいに大きくなった。<br>そこへ、黒い車が止まった……。', button: '？' },
  {
    speaker: 'agent',
    text: '<b>世界ほこり機構</b>の者です。<br>町の清掃係さんと相棒さんに、<b>世界のホコリ</b>をお願いしたいのです。',
    button: 'せかい？',
  },
  { speaker: 'agent', text: '相棒さんの新しいおうちとして、<b>町はずれの丘</b>をご用意しました。費用は機構で持ちます。', button: 'ありがとう！' },
  { speaker: 'mother', text: 'あら、世界ですって。夕ごはんまでには帰ってくるのよ。', button: 'はーい' },
  {
    speaker: 'narration',
    text: 'ほこりちゃんは<b>町はずれの丘</b>にお引っこし！<br>「<b>世界へ</b>」で地球儀を回して、砂嵐や火山灰の地域を<b>長押し</b>すると吸い込むよ。',
    button: 'やってみる！',
  },
];

/** 4章の山場：地球をひと回り */
const EARTH_WRAP: StoryStep[] = [
  { speaker: 'narration', text: 'ほこりちゃんは、とうとう地球をひと回りできるほど大きくなった。', button: '次へ' },
  { speaker: 'narration', text: 'ほこりちゃんは地球をそっと抱きしめて、ふかふかに包みこんだ。<br>空のホコリが、ぜんぶ毛並みにすいこまれていく……。', button: 'わあ……' },
  { speaker: 'agent', text: '観測史上もっとも空気のきれいな一日です。<br>機構を代表して、お礼を申し上げます。', button: 'えへへ' },
  { speaker: 'mother', text: '地球を包んだんですって？ えらいわね。<br>でも、ちゃんと元の大きさに戻ってから帰ってくるのよ。', button: 'はーい' },
  { speaker: 'narration', text: '（4章 地球編 おしまい。つぎは5章「宇宙編」！）', button: 'やったー！' },
];

/** 5章のはじまり：宇宙ほこり管制センターから */
const SPACE_LETTER: StoryStep[] = [
  { speaker: 'narration', text: 'ある夜、丘の上に、オレンジの服の人がパラシュートでふわりと降りてきた。', button: '？' },
  {
    speaker: 'controller',
    text: '<b>宇宙ほこり管制センター</b>の管制官です、どうぞ。<br>地球のまわりがきれいになったので、次は<b>宇宙のホコリ</b>をお願いしたいのです。',
    button: 'うちゅう？',
  },
  { speaker: 'controller', text: '木星のまわりに、星くずがたまって困っています。<br>相棒さんの新しいおうちとして、<b>月のとなり</b>をご用意しました、どうぞ。', button: 'ありがとう！' },
  { speaker: 'mother', text: 'あら、月のとなり。寒くないようにね。<br>夕ごはんまでには帰ってくるのよ。', button: 'はーい' },
  {
    speaker: 'narration',
    text: 'ほこりちゃんは<b>月のとなり</b>にお引っこし！<br>「<b>宇宙へ</b>」で、ほこりちゃんは木星のまわりを回るよ。<b>指をおいた所の軌道</b>へ移って、星くずを集めよう。<br>内側ほど速く回るけど、小惑星帯の岩には気をつけて。',
    button: 'やってみる！',
  },
];

/** 5章の山場：太陽系をひと回り */
const SOLAR_STORY: StoryStep[] = [
  { speaker: 'narration', text: 'ほこりちゃんは、とうとう太陽系をひと回りできるほど大きくなった。', button: '次へ' },
  { speaker: 'narration', text: 'ほこりちゃんは太陽系をぐるっとひと回り。<br>惑星のまわりの星くずが、ぜんぶ毛並みにすいこまれていく……。', button: 'わあ……' },
  { speaker: 'controller', text: '観測史上もっとも見通しのいい夜空です、どうぞ。<br>町の天文台の電話が、鳴りやみません。', button: 'えへへ' },
  { speaker: 'mother', text: 'ゆうべ、星がすごくきれいだったわね。あなたたちのおかげなんですって？<br>でも、夜ふかしはほどほどにね。', button: 'はーい' },
  { speaker: 'narration', text: '（5章 宇宙編 おしまい。つぎは6章「銀河編」！）', button: 'やったー！' },
];

/** 6章のはじまり：銀河ほこり連合から */
const GALAXY_LETTER: StoryStep[] = [
  { speaker: 'narration', text: '月のとなりに、ふしぎな形の乗り物がとまった。<br>中から、アンテナのある人がおりてきた。', button: '？' },
  {
    speaker: 'clerk',
    text: '<b>銀河ほこり連合</b>、受付窓口です。<br>太陽系の清掃実績を確認しました。<b>銀河のホコリ</b>の担当をお願いします。',
    button: 'ぎんが？',
  },
  { speaker: 'clerk', text: '天の川は、星雲のもやでかすんでいます。<br>相棒さんの新しいおうちとして、<b>天の川のほとり</b>をご用意しました。こちらに記入を。', button: 'はーい' },
  { speaker: 'mother', text: 'あら、宇宙人さん。いつもうちの子がお世話になっています。<br>夕ごはんまでには帰ってくるのよ。', button: 'はーい' },
  {
    speaker: 'narration',
    text: 'ほこりちゃんは<b>天の川のほとり</b>にお引っこし！<br>「<b>銀河へ</b>」で、<b>指でなでるように</b>動かして、星雲のもやをほこりちゃんの口へかき集めよう。<br>銀河はゆっくり、うずをまいているよ。',
    button: 'やってみる！',
  },
];

/** 6章の山場：銀河団をひと包み */
const CLUSTER_STORY: StoryStep[] = [
  { speaker: 'narration', text: 'ほこりちゃんは、とうとう銀河団をまるごと包めるほど大きくなった。', button: '次へ' },
  { speaker: 'narration', text: 'ほこりちゃんは、いくつもの銀河をそっと抱きよせた。<br>星雲のもやが、ぜんぶ毛並みにすいこまれて……天の川が、すみずみまで光った。', button: 'わあ……' },
  { speaker: 'clerk', text: '銀河団ひとつ分の清掃、受理しました。<br>連合はじまって以来の早さです。……お見事です。', button: 'えへへ' },
  { speaker: 'mother', text: '銀河ですって。すごいわね。<br>でも、ちゃんと宿題もするのよ。', button: 'はーい' },
  { speaker: 'narration', text: '（6章 銀河編 おしまい。つぎは、終章）', button: 'やったー！' },
];

/** 終章のはじまり：3つの機関がそろって */
const UNIVERSE_LETTER: StoryStep[] = [
  { speaker: 'narration', text: '天の川のほとりに、3人がそろってやってきた。<br>世界ほこり機構の人、管制官さん、窓口係さん。', button: '？' },
  { speaker: 'agent', text: '本日は、3つの機関の合同のお願いです。', button: 'ごうどう？' },
  { speaker: 'controller', text: '<b>宇宙ぜんぶのホコリ</b>を、お願いしたいのです、どうぞ。', button: 'ぜんぶ……' },
  { speaker: 'clerk', text: '相棒さんのおうちは、<b>宇宙のまんなか</b>にご用意しました。<br>……もう、ほかに置ける場所がないのです。', button: 'なるほど' },
  { speaker: 'mother', text: 'あら、宇宙のまんなか。ちゃんと帰ってこられる？<br>今日の夕ごはんは、ハンバーグよ。', button: 'はーい' },
  {
    speaker: 'narration',
    text: 'ほこりちゃんは<b>宇宙のまんなか</b>へ！<br>「<b>しゃぼん玉へ</b>」で、下から浮かんでくる<b>よその宇宙</b>をタップして、はじこう。',
    button: 'やってみる！',
  },
];

/** 次元超越級（一度だけ） */
const PEEK_STORY: StoryStep[] = [
  { speaker: 'narration', text: 'ほこりちゃんは、とうとう<b>画面からはみ出す</b>ほど大きくなった。<br>……でも、ボタンはちゃんと押せるみたい。', button: 'よかった' },
];

/** 最後：すべてのほこり級 */
const FINALE_STORY: StoryStep[] = [
  { speaker: 'narration', text: 'ほこりちゃんは、宇宙をぜんぶ、ふかふかに包みこんだ。', button: '……' },
  { speaker: 'narration', text: 'すべての宇宙の、すべてのホコリが、<br>毛並みの中で、きらきら光っている。', button: '……' },
];

const FINALE_END: StoryStep[] = [
  { speaker: 'narration', text: '（終章 おしまい。<br>このあと――夢からさめるお話と、2周目――は準備中）', button: 'おやすみなさい' },
];

/** 丘に引っこしたあと、はじめてまちで一緒に掃除するとき（大きさを変えられる） */
const SHRINK_STORY: StoryStep[] = [
  { speaker: 'hero', text: 'あれ？ ほこりちゃん、丘にいるはずなのに……。', button: '？' },
  { speaker: 'narration', text: 'ほこりちゃんは、<b>するするっと小さくなって</b>ついてきた。<br>お店の人も、いつもどおり「いらっしゃい」と言った。', button: 'いっしょに掃除しよう！' },
];

const TOOL_HINT: Record<ToolId, string> = {
  hand: '指でなぞってホコリをつまもう',
  rag: 'なぞってぞうきんで拭き取ろう',
  mop: 'なぞってモップでからめ取ろう',
  vacuum: 'なぞって掃除機で吸い込もう',
};

/** 掃除場所のある建物 */
/** お小遣いをくれる人（図鑑用） */
const RESULT_GIVER: Record<Area, PersonId> = {
  home: 'mother',
  friend: 'friendMom',
  flower: 'florist',
  bakery: 'baker',
  grandma: 'grandma',
  station: 'stationMaster',
  school: 'teacher',
  base: 'mother',
};

const AREA_BUILDING: Record<Area, BuildingId> = {
  home: 'home',
  friend: 'friend',
  flower: 'flower',
  bakery: 'bakery',
  grandma: 'grandma',
  station: 'station',
  school: 'school',
  base: 'lot',
};

const BUILDING_IDS: readonly BuildingId[] = ['home', 'shop', 'friend', 'lot', 'flower', 'bakery', 'grandma', 'board', 'station', 'school'];

export class Game {
  private save: SaveData;
  private mode: Mode = 'BOOT';
  private overlay: Overlay = 'none';
  /** 大掃除大会の最中なら開始時刻 */
  private contest: { startedAt: number; lastLeft: number; wave: number; seed: number; missed: number } | null = null;
  private sky: SkyScene | null = null;
  /** 「〇〇へ帰る」で歩いている（丘のときは駅に着いたらそのまま電車で帰る） */
  private homeTrip = false;
  private earth: EarthScene | null = null;
  /** 世界のおそうじで吸い込んだ地域の数と種類 */
  private worldGot: { patches: number; got: Partial<Record<DustType, number>>; endsAt: number; lastLeft: number } | null = null;
  private space: SpaceScene | null = null;
  /** 宇宙のおそうじで吸い込んだ群れの数と種類 */
  private spaceGot: { clusters: number; bumps: number; got: Partial<Record<DustType, number>>; endsAt: number; lastLeft: number } | null = null;
  private galaxy: GalaxyScene | null = null;
  /** 銀河のおそうじでかき集めたつぶ（バッグへはまとめて入れる） */
  private galaxyGot: { motes: number; got: Partial<Record<DustType, number>>; pending: Partial<Record<DustType, number>>; savedAt: number; endsAt: number; lastLeft: number } | null = null;
  private bubbles: BubbleScene | null = null;
  /** しゃぼん玉の宇宙ではじいた数と種類 */
  private bubbleGot: { popped: number; got: Partial<Record<DustType, number>>; endsAt: number; lastLeft: number } | null = null;
  /** 撮った写真（シェア画面を閉じたら捨てる） */
  private photo: Photo | null = null;
  /** 空で吸い込んだ雲の数と種類 */
  private skyGot: { clouds: number; got: Partial<Record<DustType, number>>; endsAt: number; lastLeft: number } | null = null;
  /** 大会で初優勝した（戻ったら任命のお話） */
  private contestFirstWin = false;
  private readonly hud: Hud;
  private readonly renderer: PixelRenderer;
  private readonly sound: Sound;
  private readonly params = readParams();
  private readonly random: Random;

  private scene: GameScene | null = null;
  private pet: PetScene | null = null;
  private cleaning: CleaningScene | null = null;
  private town: TownScene | null = null;
  private session: CleaningSession | null = null;
  private spot: SpotDef | null = null;
  /** この掃除で達成を狙える依頼 */
  private speedRequestId: number | null = null;
  private lostRequestId: number | null = null;
  /** この掃除にまぜた宝物（落とし物の依頼がないとき） */
  private spotTreasure: Treasure | null = null;
  private sneezeLeft = false;
  private sessionCount = 0;
  private pendingDamp = false;
  private autoFinishTimer = 0;
  private storyStep = 0;
  private story: StoryStep[] = [];
  private storyTitle = '';
  private storyDone: (() => void) | null = null;
  private mapArea: Area = 'home';
  private shopTab: ShopTab = 'tools';
  private dexTab: DexTab = 'fur';
  private lastPetSound = 0;
  private refreshTimer = 0;
  private lastTime = 0;

  constructor(root: HTMLElement) {
    this.save = loadSave();
    this.random = createRandom(this.params.seed ?? (Date.now() >>> 0));
    this.sound = new Sound(this.save.soundEnabled);
    this.hud = new Hud(
      root,
      (action, arg) => this.onAction(action, arg),
      (name, value, done) => this.onSlider(name, value, done),
    );
    this.renderer = new PixelRenderer(this.hud.canvas);

    new ResizeObserver(() => this.resize()).observe(this.hud.stage);
    this.bindLifecycle();
  }

  start(): void {
    this.resize();
    this.tickRequests(false);
    this.goHome();
    if (!this.save.hero) this.showHeroSelect();
    else if (!this.save.tutorialDone) this.startStory();
    this.renderer.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private get now(): number {
    return Date.now();
  }

  /** きょうの好物（なつかしの味が効く4章から） */
  private get favorite(): DustType | null {
    return nostalgiaActive(this.save) ? favoriteDust(localDay(this.now)) : null;
  }

  /** いまの時（現実の時刻。?hour= で上書き） */
  private get hour(): number {
    if (this.params.hour !== null) return this.params.hour;
    const d = new Date(this.now);
    return d.getHours() + d.getMinutes() / 60;
  }

  private get hero(): Hero {
    return this.save.hero ?? 'boy';
  }

  /** ほこりちゃんが今いる建物（ケースまでは自宅、コンテナからは空き地） */
  private get petBuilding(): BuildingId {
    // 丘（4章）へは駅から電車で帰る
    if (this.save.habitat >= 6) return 'station';
    return this.save.habitat >= 4 ? 'lot' : 'home';
  }

  // ---- 保存と表示 ----

  private commit(next: SaveData): void {
    this.save = next;
    writeSave(next);
    this.refreshHud();
  }

  private petView(): PetView {
    const s = this.save;
    return {
      xp: s.growthXp,
      tint: petTint(dietRatios(s.diet)),
      habitat: s.habitat,
      damp: s.damp,
      accessory: s.equippedAccessory,
      shape: s.shape,
    };
  }

  private refreshHud(): void {
    const s = this.save;
    this.syncRain();
    this.hud.setWallet(s.coins, bagTotal(s.bag), s.soundEnabled);
    if (this.mode === 'HOME') {
      this.hud.setPetStatus(rankFor(s.growthXp).name, s.growthXp, capacityOf(s.habitat), HABITATS[s.habitat].name, s.damp);
      this.hud.setActions(this.homeButtons());
    } else if (this.mode === 'TOWN') {
      this.hud.setTownStatus(`${hasEvent(s, 'contestWon') ? '町の清掃係 ・ ' : ''}評判 ★${s.rep} ・ 行きたい場所をタップしよう`);
      this.hud.setActions([
        { action: 'openDest', label: '行き先', sub: 'えらんで歩く', variant: 'secondary' },
        { action: 'walkHome', label: s.habitat >= 7 ? '駅から宇宙へ帰る' : s.habitat >= 6 ? '駅から丘へ帰る' : s.habitat >= 5 ? '倉庫へ帰る' : s.habitat >= 4 ? 'コンテナへ帰る' : 'おうちに帰る', variant: 'accent' },
      ]);
    } else if ((this.mode === 'BUBBLES' || this.mode === 'RESULT') && this.bubbleGot && this.bubbles) {
      const left = Math.max(0, Math.ceil((this.bubbleGot.endsAt - this.now) / 1000));
      const all = this.bubbleGot.popped + this.bubbles.remaining;
      this.hud.setCleaningStatus(`しゃぼん玉の宇宙 ⏱ のこり${left}秒`, this.bubbleGot.popped, all, all);
      this.hud.setActions([{ action: 'bubblesEnd', label: 'おわる', sub: 'ここまでで帰る', variant: 'secondary' }]);
    } else if ((this.mode === 'GALAXY' || this.mode === 'RESULT') && this.galaxyGot && this.galaxy) {
      const left = Math.max(0, Math.ceil((this.galaxyGot.endsAt - this.now) / 1000));
      this.hud.setCleaningStatus(`銀河のおそうじ ⏱ のこり${left}秒`, this.galaxy.eatenMotes, this.galaxy.totalMotes, this.galaxy.totalMotes);
      this.hud.setActions([{ action: 'galaxyEnd', label: 'おわる', sub: 'ここまでで帰る', variant: 'secondary' }]);
    } else if ((this.mode === 'SPACE' || this.mode === 'RESULT') && this.spaceGot && this.space) {
      const left = Math.max(0, Math.ceil((this.spaceGot.endsAt - this.now) / 1000));
      const all = this.spaceGot.clusters + this.space.remaining;
      this.hud.setCleaningStatus(`宇宙のおそうじ ⏱ のこり${left}秒`, this.spaceGot.clusters, all, all);
      this.hud.setActions([{ action: 'spaceEnd', label: 'おわる', sub: 'ここまでで帰る', variant: 'secondary' }]);
    } else if ((this.mode === 'WORLD' || this.mode === 'RESULT') && this.worldGot && this.earth) {
      const left = Math.max(0, Math.ceil((this.worldGot.endsAt - this.now) / 1000));
      const all = this.worldGot.patches + this.earth.remaining;
      this.hud.setCleaningStatus(`世界のおそうじ ⏱ のこり${left}秒`, this.worldGot.patches, all, all);
      this.hud.setActions([{ action: 'worldEnd', label: 'おわる', sub: 'ここまでで帰る', variant: 'secondary' }]);
    } else if ((this.mode === 'SKY' || this.mode === 'RESULT') && this.skyGot && this.sky) {
      const left = Math.max(0, Math.ceil((this.skyGot.endsAt - this.now) / 1000));
      const all = this.skyGot.clouds + this.sky.remaining;
      this.hud.setCleaningStatus(`空のおそうじ ⏱ のこり${left}秒`, this.skyGot.clouds, all, all);
      this.hud.setActions([{ action: 'skyEnd', label: 'おりる', sub: 'ここまでで帰る', variant: 'secondary' }]);
    } else if ((this.mode === 'CLEANING' || this.mode === 'RESULT') && this.session && this.contest) {
      const sess = this.session;
      const top = Math.max(...CONTEST.rivals.map((r) => r.score));
      // 満点に対する進み具合。目盛りは優勝ライン（いちばん強いチーム＋1）
      this.hud.setCleaningStatus(`大掃除大会 ⏱ のこり${this.contestLeft()}秒`, sess.collected.size, CONTEST_MAX, top + 1);
      const buttons: ButtonSpec[] = [];
      buttons.push({ action: 'goHome', label: 'やめる', sub: '賞金なし', variant: 'secondary' });
      this.hud.setActions(buttons);
    } else if ((this.mode === 'CLEANING' || this.mode === 'RESULT') && this.session) {
      const sess = this.session;
      const need = requiredCount(sess);
      this.hud.setCleaningStatus(this.spot?.name ?? 'おそうじ中', sess.collected.size, sess.total, need);
      const left = Math.max(0, need - sess.collected.size);
      const buttons: ButtonSpec[] = [];
      if (this.cleaning?.hasHelper && helperStats(s).sneeze) {
        buttons.push({ action: 'sneeze', label: 'くしゃみ！', sub: this.sneezeLeft ? '1回だけ広く吸い込む' : 'つかった', variant: 'accent', disabled: !this.sneezeLeft });
      }
      buttons.push({ action: 'goHome', label: '帰る', variant: 'secondary' });
      buttons.push({
        action: 'finish',
        label: '掃除完了',
        sub: left > 0 ? `あと${left}個` : `お小遣い ${rewardFor(sess)}`,
        variant: 'primary',
        disabled: !canClaimReward(sess),
      });
      this.hud.setActions(buttons);
    }
  }

  private homeButtons(): ButtonSpec[] {
    const s = this.save;
    const total = bagTotal(s.bag);
    const buttons: ButtonSpec[] = [];
    if (s.damp) buttons.push({ action: 'dry', label: '乾燥させる', sub: '無料', variant: 'water' });
    // コンテナに住むようになったら、家の掃除はまちの「おうち」へ行ってする
    if (s.habitat < 4) buttons.push({ action: 'openMap', label: 'おそうじ', sub: '家の中', variant: 'accent' });
    buttons.push({
      action: 'openFeed',
      label: '餌をあげる',
      sub: total === 0 ? 'バッグが空' : isFull(s) ? 'いっぱい' : `${feedableAmount(s, 'all', this.favorite)}個`,
      variant: 'primary',
      disabled: total === 0,
    });
    if (canFly(s)) {
      const clouds = skyClouds(s, this.now, this.params.speed);
      const rain = skyBlocked(s);
      buttons.push({ action: 'goSky', label: '空へ', sub: rain ? '雨で飛べない' : clouds > 0 ? `雲 ${clouds}こ` : '雲を待っている', variant: 'water', disabled: rain || clouds === 0 });
    }
    if (canWorld(s)) {
      const n = worldPatches(s, this.now, this.params.speed);
      buttons.push({ action: 'goWorld', label: '世界へ', sub: n > 0 ? `地域 ${n}か所` : 'ホコリを待っている', variant: 'accent', disabled: n === 0 });
    }
    if (canBubbles(s)) {
      const n = bubbleCount(s, this.now, this.params.speed);
      buttons.push({ action: 'goBubbles', label: 'しゃぼん玉へ', sub: n > 0 ? `よその宇宙 ${n}こ` : '宇宙を待っている', variant: 'primary', disabled: n === 0 });
    }
    if (canGalaxy(s)) {
      const n = galaxyNebulae(s, this.now, this.params.speed);
      buttons.push({ action: 'goGalaxy', label: '銀河へ', sub: n > 0 ? `星雲 ${n}こ` : '星雲を待っている', variant: 'primary', disabled: n === 0 });
    }
    if (canSpace(s)) {
      const n = spaceClusters(s, this.now, this.params.speed);
      buttons.push({ action: 'goSpace', label: '宇宙へ', sub: n > 0 ? `星くず ${n}群れ` : '星くずを待っている', variant: 'primary', disabled: n === 0 });
    }
    buttons.push({ action: 'goOut', label: 'おでかけ', sub: s.habitat >= 4 ? 'おうち・まちへ' : 'まちへ', variant: s.habitat >= 4 ? 'accent' : 'secondary' });
    buttons.push({ action: 'openPlay', label: 'あそぶ', variant: 'secondary' });
    return buttons;
  }

  // ---- 画面切替 ----

  private setScene(scene: GameScene): void {
    this.scene?.dispose();
    this.scene = scene;
    scene.resize(this.renderer.aspect, this.renderer.lowWidth);
  }

  private clearScenes(): void {
    this.cleaning = null;
    this.sky = null;
    this.skyGot = null;
    this.earth = null;
    this.worldGot = null;
    this.space = null;
    this.spaceGot = null;
    this.galaxy = null;
    this.galaxyGot = null;
    this.bubbles = null;
    this.bubbleGot = null;
    this.town = null;
    this.pet = null;
    this.session = null;
    this.spot = null;
    this.hud.setLabels([]);
    this.hud.hint(null);
    this.hud.setEdgeArrows(0, 0);
    this.sound.stopHum();
  }

  private goHome(): void {
    this.clearScenes();
    this.mode = 'HOME';

    let becameDamp = false;
    if (this.pendingDamp && !this.save.damp) {
      becameDamp = true;
      this.save = { ...this.save, damp: true };
      writeSave(this.save);
    }
    this.pendingDamp = false;
    const sleepy = this.save.tutorialDone && isSleepTime(this.hour);
    this.pet = new PetScene(this.petView(), {
      element: this.hud.canvas,
      phase: dayPhase(this.hour),
      sleepy,
      onPet: () => {
        if (this.lastTime - this.lastPetSound > 0.4) {
          this.lastPetSound = this.lastTime;
          this.sound.play('happy');
        }
      },
      onWake: () => {
        this.sound.play('happy');
        this.hud.toast('ふわぁ……おきた！（ほうっておくと、またねむっちゃうよ）', 2400);
      },
    });
    this.setScene(this.pet);
    this.syncInput();
    this.refreshHud();
    const s = this.save;
    if (becameDamp) this.hud.toast('お留守番中に湿気でしっとり…「乾燥させる」でふかふかに！', 3200);
    else if (landMeetingDue(s)) this.runStory(LAND_MEETING, '家族会議', () => this.commit(addEvent(this.save, 'landMeeting')));
    else if (contestDue(s)) this.runStory(CONTEST_NOTICE, 'おしらせ', () => this.commit(addEvent(this.save, 'contestNotice')));
    else if (warehouseDue(s)) this.runStory(WAREHOUSE_LETTER, '市役所から', () => this.commit(addEvent(this.save, 'warehouseLetter')));
    else if (s.habitat >= 5 && !hasEvent(s, 'warehouse')) this.runStory(WAREHOUSE_STORY, 'お引っこし', () => this.commit(addEvent(this.save, 'warehouse')));
    else if (rainyDue(s)) this.startRainy();
    else if (worldLetterDue(s))
      this.runStory(WORLD_LETTER, '世界ほこり機構', () => {
        this.commit(moveToHill(this.save));
        this.pet?.setView(this.petView());
        this.pet?.playHappy();
      });
    else if (earthWrapDue(s)) this.runStory(EARTH_WRAP, '地球をひと回り', () => this.commit(addEvent(this.save, 'earthWrap')));
    else if (spaceLetterDue(s))
      this.runStory(SPACE_LETTER, '宇宙ほこり管制センター', () => {
        this.commit(moveToSpace(this.save));
        this.pet?.setView(this.petView());
        this.pet?.playHappy();
      });
    else if (solarDue(s)) this.runStory(SOLAR_STORY, '太陽系をひと回り', () => this.commit(addEvent(this.save, 'solar')));
    else if (galaxyLetterDue(s))
      this.runStory(GALAXY_LETTER, '銀河ほこり連合', () => {
        this.commit(moveToGalaxy(this.save));
        this.pet?.setView(this.petView());
        this.pet?.playHappy();
      });
    else if (clusterDue(s)) this.runStory(CLUSTER_STORY, '銀河団をひと包み', () => this.commit(addEvent(this.save, 'cluster')));
    else if (universeLetterDue(s))
      this.runStory(UNIVERSE_LETTER, '3つの機関から', () => {
        this.commit(moveToUniverse(this.save));
        this.pet?.setView(this.petView());
        this.pet?.playHappy();
      });
    else if (finaleDue(s)) this.startFinale();
    else if (peekDue(s)) {
      this.commit(addEvent(this.save, 'peek'));
      this.hud.peek(this.petView().tint);
      this.sound.play('happy');
      window.setTimeout(() => {
        if (this.mode === 'HOME') this.runStory(PEEK_STORY, '次元超越級', () => this.refreshHud());
      }, 4200);
    }
    else if (sleepy) this.hud.toast('ほこりちゃんは、すやすやねむっている……（タップで起きるよ）', 2800);
    else if (isFull(s) && s.habitat < 3) this.hud.toast(s.habitat === 0 ? '机の上ではもう育てない…ショップでケースを買おう' : 'ケースがいっぱい！ショップで大きくしよう');
  }

  /** まちへ。startAt の建物の入口の前から歩き出す */
  /** まちで建物の前に立っている人（開いている場所だけ） */
  private townNpcs(): Array<{ id: CharacterId; at: BuildingId }> {
    const s = this.save;
    const list: Array<{ id: CharacterId; at: BuildingId }> = [{ id: 'shopkeeper', at: 'shop' }];
    if (friendUnlocked(s)) list.push({ id: 'friend', at: 'friend' });
    if (hasEvent(s, 'street')) {
      if (areaUnlocked(s, 'flower')) list.push({ id: 'florist', at: 'flower' });
      if (areaUnlocked(s, 'bakery')) list.push({ id: 'baker', at: 'bakery' });
      if (areaUnlocked(s, 'grandma')) list.push({ id: 'grandma', at: 'grandma' });
    }
    if (areaUnlocked(s, 'station')) list.push({ id: 'stationMaster', at: 'station' });
    if (areaUnlocked(s, 'school')) list.push({ id: 'teacher', at: 'school' });
    return list;
  }

  private goTown(startAt: BuildingId): void {
    this.clearScenes();
    this.mode = 'TOWN';
    this.town = new TownScene({
      element: this.hud.canvas,
      hero: this.hero,
      startAt,
      lotOwned: this.save.habitat >= 4,
      warehouse: this.save.habitat >= 5,
      railway: areaUnlocked(this.save, 'station'),
      npcs: this.townNpcs(),
      phase: dayPhase(this.hour),
      onArrive: (id) => this.onArrive(id),
      onTalk: (id) => this.talkWith(id),
    });
    this.setScene(this.town);
    this.refreshHud();
    this.syncInput();
    if (!hasEvent(this.save, 'town')) {
      this.runStory(TOWN_INTRO, 'まち', () => this.commit(addEvent(this.save, 'town')));
    } else if (this.save.habitat >= 4 && !hasEvent(this.save, 'street')) {
      this.runStory(STREET_INTRO, '商店街', () => this.commit(addEvent(this.save, 'street')));
    } else if (landMeetingDue(this.save)) {
      this.runStory(LAND_MEETING, '家族会議', () => this.commit(addEvent(this.save, 'landMeeting')));
    } else if (contestDue(this.save)) {
      this.runStory(CONTEST_NOTICE, 'おしらせ', () => this.commit(addEvent(this.save, 'contestNotice')));
    } else if (cityTownDue(this.save)) {
      this.runStory(CITY_TOWN, '駅と学校', () => {
        this.commit(addEvent(this.save, 'cityTown'));
        this.goTown(startAt);
      });
    } else if (rainyDue(this.save)) {
      this.startRainy();
    }
  }

  /** まちで建物の入口に着いた */
  private onArrive(id: BuildingId): void {
    if (this.mode !== 'TOWN') return;
    switch (id) {
      case 'home':
        this.sound.play('tap');
        if (this.save.habitat >= 4) {
          // ほこりちゃんはコンテナ。おうちでは家の掃除をする
          this.openMap('home');
          return;
        }
        this.goHome();
        return;
      case 'shop':
        this.sound.play('tap');
        this.renderShop(true);
        return;
      case 'board':
        this.sound.play('tap');
        if (!hasEvent(this.save, 'board')) {
          this.runStory(BOARD_INTRO, '掲示板', () => {
            this.commit(addEvent(this.save, 'board'));
            this.openBoard();
          });
        } else this.openBoard();
        return;
      case 'lot':
        this.sound.play('tap');
        // 丘に引っこしたあとの倉庫は「思い出の倉庫」として掃除できる
        if (this.save.habitat >= 6) {
          this.openMap('base');
          return;
        }
        this.arriveLot();
        return;
      case 'friend':
        if (!friendUnlocked(this.save)) {
          this.sound.play('deny');
          this.hud.toast(`まだ知らない家だ…（ほこりちゃんが成長${FRIEND_UNLOCK_XP}になったら？）`, 2800);
          return;
        }
        this.sound.play('tap');
        if (!hasEvent(this.save, 'friend')) {
          this.runStory(FRIEND_INTRO, '友だちの家', () => {
            this.commit(addEvent(this.save, 'friend'));
            this.openMap('friend');
          });
        } else this.openMap('friend');
        return;
      case 'station':
      case 'school':
        if (id === 'station' && this.save.habitat >= 6 && this.homeTrip) {
          this.homeTrip = false;
          this.sound.play('happy');
          this.hud.toast(this.rideHomeText(), 2200);
          this.goHome();
          return;
        }
        if (!areaUnlocked(this.save, id)) {
          this.sound.play('deny');
          this.hud.toast(id === 'station' ? '電車が通りすぎていった……（まだ用事はないみたい）' : 'チャイムが鳴っている……（まだ用事はないみたい）', 2600);
          return;
        }
        this.sound.play('tap');
        this.openMap(id);
        return;
      case 'flower':
      case 'bakery':
      case 'grandma':
        if (!areaUnlocked(this.save, id)) {
          this.sound.play('deny');
          const rep = AREA_REP[id] ?? 0;
          this.hud.toast(this.save.habitat >= 4 ? `まだ紹介してもらっていない…（評判★${rep}）` : 'シャッターが閉まっている……', 2800);
          return;
        }
        this.sound.play('tap');
        this.openMap(id);
        return;
    }
  }

  /** 空き地：家族会議の後なら買える。買った後はほこりちゃんのコンテナ */
  private arriveLot(): void {
    const s = this.save;
    if (s.habitat >= 4) {
      this.goHome();
      return;
    }
    if (hasEvent(s, 'landMeeting')) {
      this.openOverlay('land', {
        title: '売地',
        className: 'modal--story',
        body: landBody(s),
        buttons: [
          { action: 'closeModal', label: 'やめる', variant: 'secondary' },
          { action: 'buyLand', label: '買う', sub: `${LAND_PRICE}コイン`, variant: 'primary', disabled: s.coins < LAND_PRICE },
        ],
      });
      return;
    }
    this.openOverlay('lot', {
      title: '空き地',
      className: 'modal--story',
      body: storyBody('narration', this.hero, '草がのびた広い空き地。<br>「売地」の看板が立っている……。'),
      buttons: [{ action: 'closeModal', label: 'もどる', variant: 'secondary' }],
    });
  }

  private startCleaning(def: SpotDef, dust: number): void {
    this.clearScenes();
    this.sessionCount++;
    const seed = (this.params.seed ?? Math.floor(this.random() * 1e9)) + this.sessionCount * 101;
    // 湿気は清掃セッション開始時に判定し、帰宅時に反映する（はじめの2回は除外）
    this.pendingDamp = this.params.damp ?? (this.save.cleanedSessions >= 2 && rollDamp(this.random, dampChance(this.save)));
    const tool = bestTool(this.save);
    const types = rollDustTypes(def, dust, createRandom(seed ^ 0x51ed));
    const lost = findRequest(this.save, 'lost', def.id);
    const speed = findRequest(this.save, 'speed', def.id);
    this.lostRequestId = lost?.id ?? null;
    this.speedRequestId = speed?.id ?? null;
    // 落とし物の依頼がなければ、その場所の宝物がまぎれていることがある
    this.spotTreasure = lost ? null : rollTreasure(this.save, def.id, dust / def.maxDust, createRandom(seed ^ 0x7ea5));
    const together = canCleanTogether(this.save);
    const stats = helperStats(this.save);
    this.sneezeLeft = together && stats.sneeze;

    const layout = buildSpot(def.id, seed);
    const view = this.petView();
    const scene = new CleaningScene({
      seed,
      dustCount: dust,
      dustTypes: types,
      layout,
      tool,
      hero: this.hero,
      element: this.hud.canvas,
      helper: together ? { accessory: view.accessory, shape: view.shape, tint: view.tint, speedMul: stats.speedMul, radiusMul: stats.radiusMul } : undefined,
      treasure: lost
        ? { color: LOST_ITEMS.find((i) => i.id === lost.item)?.color ?? '#f2c94c' }
        : this.spotTreasure
          ? { color: this.spotTreasure.color }
          : undefined,
      onTreasure: () => this.onTreasure(),
      onCollect: (id) => this.onCollect(id),
      onSuctionChange: (active) => (active && tool.id === 'vacuum' ? this.sound.startHum() : this.sound.stopHum()),
    });
    this.session = createSession(this.sessionCount, def, types.slice(0, scene.dustTotal), this.now);
    this.spot = def;
    this.cleaning = scene;
    this.mode = 'CLEANING';
    this.autoFinishTimer = 0;
    this.setScene(scene);
    this.syncInput();
    const lines = [TOOL_HINT[tool.id]];
    if (together) lines.push('ほこりちゃんも一緒！');
    if (lost) lines.push('落とし物がまぎれているかも');
    else if (this.spotTreasure) lines.push('なにかキラッと光っている……？');
    if (speed) lines.push(`⏱ ${speed.seconds}秒以内に完了で依頼達成`);
    else if (layout.scale >= 1) lines.push('端に寄せると画面が動くよ');
    this.hud.hint(lines.join('\n'));
    if (together && !hasEvent(this.save, 'together')) this.save = addEvent(this.save, 'together');
    if (together && this.save.habitat >= 6 && !hasEvent(this.save, 'shrink')) {
      this.runStory(SHRINK_STORY, 'ちいさくなれる', () => this.commit(addEvent(this.save, 'shrink')));
    }
    this.refreshHud();
  }

  /** 梅雨の大湿気事件のはじまり。ほこりちゃんはぺしゃんこに */
  private startRainy(): void {
    this.commit({ ...addEvent(this.save, 'rainy'), damp: true });
    this.pet?.setView(this.petView());
    this.syncRain();
    this.refreshHud();
    this.runStory(RAINY_START, '梅雨の大湿気事件', () => this.refreshHud());
  }

  /** 掲示板の「乾燥パウダー大作戦」に届ける */
  private deliverRainyPowder(): void {
    const r = deliverRainy(this.save);
    if (!r.ok) {
      this.sound.play('deny');
      return;
    }
    this.commit(r.save);
    this.sound.play('upgrade');
    this.hud.bump('coins');
    this.syncRain();
    this.closeModal();
    this.runStory(RAINY_END, '梅雨明け', () => this.refreshHud());
  }

  /** 梅雨のあいだは画面に雨を降らせる */
  private syncRain(): void {
    this.hud.setRain(rainyActive(this.save));
  }

  /** 世界のおそうじ：地球儀を回して、砂嵐や火山灰の地域を長押しで吸い込む */
  private startWorld(): void {
    const n = worldPatches(this.save, this.now, this.params.speed);
    if (n <= 0) return;
    this.sound.play('happy');
    this.clearScenes();
    this.sessionCount++;
    const seed = (this.params.seed ?? Math.floor(this.random() * 1e9)) + this.sessionCount * 101;
    const types = rollDustTypes({ dust: WORLD.mix }, n, createRandom(seed ^ 0xea7));
    const view = this.petView();
    const scene = new EarthScene({
      element: this.hud.canvas,
      seed,
      hero: this.hero,
      patches: types,
      pet: { accessory: view.accessory, shape: view.shape, tint: view.tint },
      holdSeconds: worldHoldSeconds(this.save),
      onPatch: (type) => this.onPatch(type),
    });
    this.earth = scene;
    this.worldGot = { patches: 0, got: {}, endsAt: this.now + WORLD.seconds * 1000, lastLeft: WORLD.seconds };
    this.mode = 'WORLD';
    this.setScene(scene);
    this.syncInput();
    this.hud.hint('指でなぞって地球儀を回そう\nホコリの地域を長押しすると吸い込むよ');
    this.refreshHud();
  }

  private onPatch(type: DustType): void {
    const g = this.worldGot;
    if (!g || this.mode !== 'WORLD') return;
    g.patches++;
    g.got[type] = (g.got[type] ?? 0) + WORLD.perPatch;
    this.hud.hint(null);
    this.sound.play('collect');
    const dex = dexAdd({ ...this.save, bag: { ...this.save.bag, [type]: this.save.bag[type] + WORLD.perPatch } }, 'dust', type);
    this.commit(dex.save);
    this.hud.bump('bag');
    if (dex.added) this.hud.toast(`図鑑に「${DUSTS[type].name}」を記録した！`, 2000);
  }

  private endWorld(): void {
    const g = this.worldGot;
    if (!g || !this.earth || this.mode !== 'WORLD') return;
    this.mode = 'RESULT';
    this.earth.setInputEnabled(false);
    const reward = worldReward(g.patches);
    this.commit({ ...finishWorld(this.save, this.earth.remaining, this.now), coins: this.save.coins + reward });
    this.hud.bump('coins');
    this.sound.play('reward');
    this.openOverlay('result', {
      title: '世界のおそうじ完了！',
      className: 'modal--result',
      body: worldResultBody({ hero: this.hero, patches: g.patches, reward, got: g.got, bag: bagTotal(this.save.bag) }),
      buttons: [{ action: 'resultHome', label: 'ただいま！', variant: 'primary' }],
    });
  }

  /** 駅から、ほこりちゃんの所へ帰るときのひとこと */
  private rideHomeText(): string {
    if (this.save.habitat >= 9) return '電車で丘の発射場へ。ロケットとワープを乗りついで、宇宙のまんなかへ……';
    if (this.save.habitat >= 8) return '電車で丘の発射場へ。ロケットを乗りついで、天の川のほとりへ……';
    return this.save.habitat >= 7 ? '電車で丘の発射場へ。ロケットで、月のとなりへ……' : '電車にゆられて、町はずれの丘へ……';
  }

  /** 最後の場面：お話 → 画面が真っ白に → 小さな綿ぼこり → 「……まだ、たべられるよ？」 */
  private startFinale(): void {
    this.runStory(FINALE_STORY, 'すべてのほこり級', () => {
      this.hud.finale('もう、\nこれ以上おおきくなれないみたい。', '……まだ、たべられるよ？', 'ほこりちゃん', () => {
        this.commit(addEvent(this.save, 'finale'));
        window.setTimeout(() => this.runStory(FINALE_END, '終章', () => this.refreshHud()), 1200);
      });
    });
  }

  /** しゃぼん玉の宇宙：下から浮かんでくる、よその宇宙をタップしてはじく */
  private startBubbles(): void {
    const n = bubbleCount(this.save, this.now, this.params.speed);
    if (n <= 0) return;
    this.sound.play('happy');
    this.clearScenes();
    this.sessionCount++;
    const seed = (this.params.seed ?? Math.floor(this.random() * 1e9)) + this.sessionCount * 101;
    const types = rollDustTypes({ dust: BUBBLES.mix }, n, createRandom(seed ^ 0xb0b));
    const view = this.petView();
    const scene = new BubbleScene({
      element: this.hud.canvas,
      seed,
      bubbles: types,
      spawnSeconds: BUBBLES.seconds - 9,
      pet: { accessory: view.accessory, shape: view.shape, tint: view.tint },
      riseMul: bubbleRiseMul(this.save),
      onPop: (type) => this.onPop(type),
    });
    this.bubbles = scene;
    this.bubbleGot = { popped: 0, got: {}, endsAt: this.now + BUBBLES.seconds * 1000, lastLeft: BUBBLES.seconds };
    this.mode = 'BUBBLES';
    this.setScene(scene);
    this.syncInput();
    this.hud.hint('浮かんでくるしゃぼん玉（よその宇宙）を\nタップしてはじこう');
    this.refreshHud();
  }

  private onPop(type: DustType): void {
    const g = this.bubbleGot;
    if (!g || this.mode !== 'BUBBLES') return;
    g.popped++;
    g.got[type] = (g.got[type] ?? 0) + BUBBLES.perBubble;
    this.hud.hint(null);
    this.sound.play('collect');
    const dex = dexAdd({ ...this.save, bag: { ...this.save.bag, [type]: this.save.bag[type] + BUBBLES.perBubble } }, 'dust', type);
    this.commit(dex.save);
    this.hud.bump('bag');
    if (dex.added) this.hud.toast(`図鑑に「${DUSTS[type].name}」を記録した！`, 2000);
  }

  private endBubbles(): void {
    const g = this.bubbleGot;
    if (!g || !this.bubbles || this.mode !== 'BUBBLES') return;
    this.mode = 'RESULT';
    this.bubbles.setInputEnabled(false);
    const reward = bubbleReward(g.popped);
    this.commit({ ...finishBubbles(this.save, this.bubbles.remaining, this.now), coins: this.save.coins + reward });
    this.hud.bump('coins');
    this.sound.play('reward');
    this.openOverlay('result', {
      title: 'しゃぼん玉の宇宙、おしまい！',
      className: 'modal--result',
      body: bubbleResultBody({ hero: this.hero, popped: g.popped, reward, got: g.got, bag: bagTotal(this.save.bag) }),
      buttons: [{ action: 'resultHome', label: 'ただいま！', variant: 'primary' }],
    });
  }

  /** 銀河のおそうじ：指でなでるように、星雲のもやをほこりちゃんの口へかき集める */
  private startGalaxy(): void {
    const n = galaxyNebulae(this.save, this.now, this.params.speed);
    if (n <= 0) return;
    this.sound.play('happy');
    this.clearScenes();
    this.sessionCount++;
    const seed = (this.params.seed ?? Math.floor(this.random() * 1e9)) + this.sessionCount * 101;
    const types = rollDustTypes({ dust: GALAXY.mix }, n, createRandom(seed ^ 0x6a1a));
    const view = this.petView();
    const scene = new GalaxyScene({
      element: this.hud.canvas,
      seed,
      nebulae: types,
      motesPerNebula: GALAXY.motesPerNebula,
      pet: { accessory: view.accessory, shape: view.shape, tint: view.tint },
      sweepMul: galaxySweepMul(this.save),
      onMote: (type) => this.onMote(type),
    });
    this.galaxy = scene;
    this.galaxyGot = { motes: 0, got: {}, pending: {}, savedAt: this.now, endsAt: this.now + GALAXY.seconds * 1000, lastLeft: GALAXY.seconds };
    this.mode = 'GALAXY';
    this.setScene(scene);
    this.syncInput();
    this.hud.hint('指でなでるように動かして\n星雲のもやを口へかき集めよう');
    this.refreshHud();
  }

  private onMote(type: DustType): void {
    const g = this.galaxyGot;
    if (!g || this.mode !== 'GALAXY') return;
    g.motes++;
    g.got[type] = (g.got[type] ?? 0) + GALAXY.perMote;
    g.pending[type] = (g.pending[type] ?? 0) + GALAXY.perMote;
    this.hud.hint(null);
    if (g.motes % 4 === 1) this.sound.play('collect');
  }

  /** たまったつぶをバッグへ入れて保存する（つぶごとに保存すると重いので、まとめて） */
  private flushGalaxy(): void {
    const g = this.galaxyGot;
    if (!g) return;
    g.savedAt = this.now;
    const types = Object.keys(g.pending) as DustType[];
    if (types.length === 0) return;
    let save: SaveData = { ...this.save, bag: { ...this.save.bag } };
    for (const t of types) save.bag[t] += g.pending[t] ?? 0;
    for (const t of types) {
      const dex = dexAdd(save, 'dust', t);
      save = dex.save;
      if (dex.added) this.hud.toast(`図鑑に「${DUSTS[t].name}」を記録した！`, 2000);
    }
    g.pending = {};
    this.commit(save);
    this.hud.bump('bag');
  }

  private endGalaxy(): void {
    const g = this.galaxyGot;
    if (!g || !this.galaxy || this.mode !== 'GALAXY') return;
    this.flushGalaxy();
    this.mode = 'RESULT';
    this.galaxy.setInputEnabled(false);
    const reward = galaxyReward(g.motes);
    const left = Math.round(this.galaxy.remainingMotes / GALAXY.motesPerNebula);
    this.commit({ ...finishGalaxy(this.save, left, this.now), coins: this.save.coins + reward });
    this.hud.bump('coins');
    this.sound.play('reward');
    this.openOverlay('result', {
      title: '銀河のおそうじ完了！',
      className: 'modal--result',
      body: galaxyResultBody({ hero: this.hero, motes: g.motes, total: this.galaxy.totalMotes, reward, got: g.got, bag: bagTotal(this.save.bag) }),
      buttons: [{ action: 'resultHome', label: 'ただいま！', variant: 'primary' }],
    });
  }

  /** 宇宙のおそうじ：ほこりちゃんは木星（太陽）のまわりを回る。指をおいた軌道へ移って星くずを吸い込む */
  private startSpace(): void {
    const n = spaceClusters(this.save, this.now, this.params.speed);
    if (n <= 0) return;
    this.sound.play('happy');
    this.clearScenes();
    this.sessionCount++;
    const seed = (this.params.seed ?? Math.floor(this.random() * 1e9)) + this.sessionCount * 101;
    const types = rollDustTypes({ dust: SPACE.mix }, n, createRandom(seed ^ 0x5ace));
    const view = this.petView();
    const scene = new SpaceScene({
      element: this.hud.canvas,
      seed,
      clusters: types,
      pet: { accessory: view.accessory, shape: view.shape, tint: view.tint },
      center: spaceCenter(this.save),
      turnMul: spaceTurnMul(this.save),
      bumpSeconds: spaceBumpSeconds(this.save),
      onCluster: (type) => this.onCluster(type),
      onBump: () => {
        if (this.spaceGot) this.spaceGot.bumps++;
        this.sound.play('deny');
      },
    });
    this.space = scene;
    this.spaceGot = { clusters: 0, bumps: 0, got: {}, endsAt: this.now + SPACE.seconds * 1000, lastLeft: SPACE.seconds };
    this.mode = 'SPACE';
    this.setScene(scene);
    this.syncInput();
    this.hud.hint('指をおいた所の軌道へ移るよ\n内側ほど速く回る・岩にはごつん');
    this.refreshHud();
  }

  private onCluster(type: DustType): void {
    const g = this.spaceGot;
    if (!g || this.mode !== 'SPACE') return;
    g.clusters++;
    g.got[type] = (g.got[type] ?? 0) + SPACE.perCluster;
    this.hud.hint(null);
    this.sound.play('collect');
    const dex = dexAdd({ ...this.save, bag: { ...this.save.bag, [type]: this.save.bag[type] + SPACE.perCluster } }, 'dust', type);
    this.commit(dex.save);
    this.hud.bump('bag');
    if (dex.added) this.hud.toast(`図鑑に「${DUSTS[type].name}」を記録した！`, 2000);
  }

  private endSpace(): void {
    const g = this.spaceGot;
    if (!g || !this.space || this.mode !== 'SPACE') return;
    this.mode = 'RESULT';
    this.space.setInputEnabled(false);
    const reward = spaceReward(g.clusters);
    this.commit({ ...finishSpace(this.save, this.space.remaining, this.now), coins: this.save.coins + reward });
    this.hud.bump('coins');
    this.sound.play('reward');
    this.openOverlay('result', {
      title: '宇宙のおそうじ完了！',
      className: 'modal--result',
      body: spaceResultBody({ hero: this.hero, clusters: g.clusters, reward, got: g.got, bag: bagTotal(this.save.bag), bumps: g.bumps }),
      buttons: [{ action: 'resultHome', label: 'ただいま！', variant: 'primary' }],
    });
  }

  /** 空のおそうじ：ほこりちゃんに乗って、黄砂や花粉の雲を吸い込む */
  private startSky(): void {
    const n = skyClouds(this.save, this.now, this.params.speed);
    if (n <= 0) return;
    this.sound.play('happy');
    this.clearScenes();
    this.sessionCount++;
    const seed = (this.params.seed ?? Math.floor(this.random() * 1e9)) + this.sessionCount * 101;
    const types = rollDustTypes({ dust: SKY.mix }, n, createRandom(seed ^ 0x5c1));
    const view = this.petView();
    const scene = new SkyScene({
      element: this.hud.canvas,
      seed,
      hero: this.hero,
      clouds: types,
      pet: { accessory: view.accessory, shape: view.shape, tint: view.tint },
      radiusMul: skyRadiusMul(this.save),
      speedMul: skySpeedMul(this.save),
      onCloud: (type) => this.onCloud(type),
    });
    this.sky = scene;
    this.skyGot = { clouds: 0, got: {}, endsAt: this.now + SKY.seconds * 1000, lastLeft: SKY.seconds };
    this.mode = 'SKY';
    this.setScene(scene);
    this.syncInput();
    this.hud.hint('指でさした方へ飛ぶよ\n雲にふれると吸い込む');
    if (!hasEvent(this.save, 'sky')) this.save = addEvent(this.save, 'sky');
    this.refreshHud();
  }

  private onCloud(type: DustType): void {
    const g = this.skyGot;
    if (!g || this.mode !== 'SKY') return;
    g.clouds++;
    g.got[type] = (g.got[type] ?? 0) + SKY.perCloud;
    this.hud.hint(null);
    this.sound.play('collect');
    const dex = dexAdd({ ...this.save, bag: { ...this.save.bag, [type]: this.save.bag[type] + SKY.perCloud } }, 'dust', type);
    this.commit(dex.save);
    this.hud.bump('bag');
    if (dex.added) this.hud.toast(`図鑑に「${DUSTS[type].name}」を記録した！`, 2000);
  }

  private endSky(): void {
    const g = this.skyGot;
    if (!g || !this.sky || this.mode !== 'SKY') return;
    this.mode = 'RESULT';
    this.sky.setInputEnabled(false);
    const reward = skyReward(g.clouds);
    this.commit({ ...finishSky(this.save, this.sky.remaining, this.now), coins: this.save.coins + reward });
    this.hud.bump('coins');
    this.sound.play('reward');
    this.openOverlay('result', {
      title: '空のおそうじ完了！',
      className: 'modal--result',
      body: skyResultBody({ hero: this.hero, clouds: g.clouds, reward, got: g.got, bag: bagTotal(this.save.bag) }),
      buttons: [{ action: 'resultHome', label: 'ただいま！', variant: 'primary' }],
    });
  }

  private contestLeft(): number {
    if (!this.contest) return 0;
    return Math.max(0, Math.ceil(CONTEST.seconds - (this.now - this.contest.startedAt) / 1000));
  }

  /** 大掃除大会：商店街通りで、風で飛んでくるホコリを制限時間内にできるだけ集める（ほこりちゃんは審査員席） */
  private startContest(): void {
    const entered = enterContest(this.save, this.now, this.params.speed);
    if (!entered.ok) return;
    this.commit(entered.save);
    this.closeModal();
    this.clearScenes();
    this.sessionCount++;
    const seed = (this.params.seed ?? Math.floor(this.random() * 1e9)) + this.sessionCount * 101;
    this.pendingDamp = false;
    this.lostRequestId = null;
    this.spotTreasure = null;
    this.speedRequestId = null;
    this.sneezeLeft = false;
    const tool = bestTool(this.save);
    const first = CONTEST.waves[0];
    const types = rollDustTypes({ dust: CONTEST.mix }, first.count, createRandom(seed ^ 0x51ed));
    const scene = new CleaningScene({
      seed,
      dustCount: first.count,
      dustTypes: types,
      layout: buildContest(seed),
      tool,
      hero: this.hero,
      element: this.hud.canvas,
      spectator: { accessory: this.save.equippedAccessory, shape: this.save.shape, tint: petTint(dietRatios(this.save.diet)) },
      onCollect: (id) => this.onCollect(id),
      onMiss: () => this.onContestMiss(),
      onSuctionChange: (active) => (active && tool.id === 'vacuum' ? this.sound.startHum() : this.sound.stopHum()),
    });
    this.blowWind(scene, seed, 0);
    this.session = createSession(this.sessionCount, { id: 'contest', rewardBase: 0 }, types.slice(0, scene.dustTotal), this.now);
    this.spot = null;
    this.contest = { startedAt: this.now, lastLeft: CONTEST.seconds, wave: 1, seed, missed: 0 };
    this.cleaning = scene;
    this.mode = 'CLEANING';
    this.autoFinishTimer = 0;
    this.setScene(scene);
    this.syncInput();
    this.sound.play('happy');
    this.hud.hint(`よーい、スタート！\n風で流されて通りの外へ出る前に集めよう`);
    this.refreshHud();
  }

  /** 風向きは波ごとに変わる（画面の右上・右下・左下・左上のどれか） */
  private blowWind(scene: CleaningScene, seed: number, wave: number): void {
    const dirs: Array<[number, number]> = [
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ];
    const [x, z] = dirs[(seed + wave * 3) % dirs.length];
    const k = CONTEST.wind / Math.SQRT2;
    scene.setWind(x * k, z * k);
  }

  /** 風で通りの外へ飛んでいった */
  private onContestMiss(): void {
    if (!this.contest) return;
    this.contest.missed++;
    this.checkContestOver();
  }

  /** 最後の風のあと、通りにホコリが残っていなければ終わる */
  private checkContestOver(): void {
    const c = this.contest;
    if (!c || !this.cleaning || c.wave < CONTEST.waves.length) return;
    if (this.cleaning.idleDust === 0 && this.autoFinishTimer <= 0) this.autoFinishTimer = 0.8;
  }

  /** 決まった時刻に、風に乗って次のホコリが飛んでくる */
  private nextWave(): void {
    const c = this.contest;
    const session = this.session;
    if (!c || !session || !this.cleaning) return;
    const wave = CONTEST.waves[c.wave];
    if (!wave) return;
    const elapsed = (this.now - c.startedAt) / 1000;
    if (elapsed < wave.at) return;
    c.wave++;
    const seed = c.seed + c.wave * 7919;
    const types = rollDustTypes({ dust: CONTEST.mix }, wave.count, createRandom(seed));
    const n = this.cleaning.spawnDust(types, seed);
    this.blowWind(this.cleaning, c.seed, c.wave);
    session.types.push(...types.slice(0, n));
    session.total = session.types.length;
    this.sound.play('dry');
    this.hud.toast(`風に乗って、ホコリが飛んできた！（${c.wave}/${CONTEST.waves.length}）`, 1600);
  }

  private endContest(): void {
    const session = this.session;
    if (!session || this.mode !== 'CLEANING' || !this.contest) return;
    this.mode = 'RESULT';
    this.cleaning?.setInputEnabled(false);
    this.sound.stopHum();
    this.sound.play('reward');
    const score = session.collected.size;
    const r = contestResult(this.save, score);
    this.contestFirstWin = r.firstWin;
    this.commit(r.save);
    this.hud.bump('coins');
    this.openOverlay('result', {
      title: r.won ? '優勝！' : '大会おわり',
      className: 'modal--result',
      body: contestResultBody({ hero: this.hero, score, rank: r.rank, prize: r.prize, won: r.won, best: r.best }),
      buttons: [{ action: 'resultHome', label: r.firstWin ? '表彰式へ' : 'もどる', variant: 'primary' }],
    });
  }

  private onCollect(id: number): void {
    const session = this.session;
    if (!session || this.mode !== 'CLEANING') return;
    const type = collectDust(session, id);
    if (!type) return;
    this.hud.hint(null);
    this.sound.play('collect');
    if (this.contest) {
      // 大会のホコリは町内会が引き取る（バッグには入らない）
      this.sound.play('collect');
      this.checkContestOver();
      this.refreshHud();
      return;
    }
    const dex = dexAdd({ ...this.save, bag: { ...this.save.bag, [type]: this.save.bag[type] + 1 } }, 'dust', type);
    this.commit(dex.save);
    if (dex.added) this.hud.toast(`図鑑に「${DUSTS[type].name}」を記録した！`, 2000);
    this.hud.bump('bag');
    if (session.collected.size === session.total) this.autoFinishTimer = 0.8;
  }

  /** 落とし物を見つけた → その場で依頼達成 */
  private onTreasure(): void {
    if (this.spotTreasure) {
      this.foundSpotTreasure(this.spotTreasure);
      this.spotTreasure = null;
      return;
    }
    if (this.lostRequestId === null) return;
    const done = completeRequest(this.save, this.lostRequestId);
    this.lostRequestId = null;
    if (!done) return;
    this.commit(done.request.item ? dexAdd(done.save, 'items', done.request.item).save : done.save);
    this.sound.play('reward');
    this.hud.bump('coins');
    const item = LOST_ITEMS.find((i) => i.id === done.request.item);
    this.hud.toast(`${item?.name ?? '落とし物'}を見つけた！ ${done.request.client}に届けた（+${done.request.reward}・★${done.request.rep}）`, 3200);
  }

  /** 掃除場所の宝物を見つけた → 図鑑に記録してお礼。その場所の3つがそろったら評判も */
  private foundSpotTreasure(t: Treasure): void {
    const r = dexAdd(this.save, 'items', t.id);
    if (!r.added) return;
    const { found, left } = spotTreasures(r.save, t.spot);
    const complete = left.length === 0;
    this.commit({ ...r.save, coins: r.save.coins + TREASURE_COINS, rep: r.save.rep + (complete ? 1 : 0) });
    this.sound.play('reward');
    this.hud.bump('coins');
    const where = spotDef(t.spot).name;
    this.hud.toast(
      complete
        ? `宝物「${t.name}」を見つけた！ ${where}の宝物がぜんぶそろった（+${TREASURE_COINS}・★1）`
        : `宝物「${t.name}」を見つけた！ 図鑑に記録（${where} ${found.length}/${found.length + left.length}・+${TREASURE_COINS}）`,
      3200,
    );
  }

  /** 掃除を終えて、取り残しを場所に記録してから戻る */
  private leaveCleaning(): void {
    if (this.contest) {
      // 大会の会場からは掲示板の前に戻る。初優勝なら任命式
      this.contest = null;
      this.closeModal();
      this.goTown('board');
      if (this.contestFirstWin) {
        this.contestFirstWin = false;
        this.runStory(CONTEST_WIN, '任命式', () => this.refreshHud());
      }
      return;
    }
    const area = this.spot?.area ?? 'home';
    if (this.session && this.spot) {
      const remaining = this.session.total - this.session.collected.size;
      this.commit(finishSpot(this.save, this.spot, remaining, this.now));
    }
    this.closeModal();
    // 家の外の掃除（コンテナに引っこした後は家の掃除も）が終わったら、その建物の前（まち）に戻る
    if (area === 'home' && this.save.habitat < 4) this.goHome();
    else this.goTown(AREA_BUILDING[area]);
  }

  /** RESULT：お小遣い。報酬確定はここで一度だけ */
  private enterResult(): void {
    if (this.contest) {
      this.endContest();
      return;
    }
    const session = this.session;
    if (!session || this.mode !== 'CLEANING') return;
    const result = claimReward(this.save, session);
    if (!result) return;
    this.mode = 'RESULT';
    this.cleaning?.setInputEnabled(false);
    this.sound.stopHum();
    this.sound.play('reward');
    let save = result.save;
    // 早さの依頼：時間内なら達成
    let speedNote = '';
    if (this.speedRequestId !== null) {
      const req = save.requests.find((r) => r.id === this.speedRequestId);
      const elapsed = (this.now - session.startedAt) / 1000;
      if (req?.seconds && elapsed <= req.seconds) {
        const done = completeRequest(save, req.id);
        if (done) {
          save = done.save;
          speedNote = `<p class="note">⏱ ${Math.ceil(elapsed)}秒！ ${done.request.client}の依頼を達成（+${done.request.reward}・★${done.request.rep}）</p>`;
        }
      } else if (req) {
        speedNote = `<p class="note">⏱ ${Math.ceil(elapsed)}秒……間に合わなかった（依頼はまだ掲示板にあるよ）</p>`;
      }
      this.speedRequestId = null;
    }
    const giver = RESULT_GIVER[spotDef(session.spot as SpotId).area];
    this.commit(dexAdd(save, 'people', giver).save);
    this.hud.bump('coins');
    const got: Partial<Record<DustType, number>> = {};
    for (const id of session.collected) got[session.types[id]] = (got[session.types[id]] ?? 0) + 1;
    this.openOverlay('result', {
      title: 'おそうじ完了！',
      className: 'modal--result',
      body:
        resultBody({
          hero: this.hero,
          spot: session.spot as SpotId,
          collected: session.collected.size,
          total: session.total,
          reward: result.reward,
          base: session.rewardBase,
          perDust: REWARD_PER_DUST,
          bag: bagTotal(this.save.bag),
          got,
        }) + speedNote,
      buttons: [{ action: 'resultHome', label: 'ありがとう！', variant: 'primary' }],
    });
  }

  // ---- オーバーレイ ----

  private openOverlay(overlay: Overlay, spec: Parameters<Hud['showModal']>[0]): void {
    this.overlay = overlay;
    this.town?.stop();
    this.hud.showModal(spec);
    this.syncInput();
    this.syncSheetInset();
  }

  private closeModal(): void {
    if (this.overlay === 'photo') this.dropPhoto();
    this.overlay = 'none';
    this.hud.closeModal();
    this.syncInput();
    this.syncSheetInset();
  }

  /** 下のパネルが3D画面を覆う割合をペットシーンに伝える */
  private syncSheetInset(): void {
    this.pet?.setBottomInset(this.hud.sheetCoverage());
  }

  private showHeroSelect(): void {
    this.openOverlay('hero', { title: 'ほこりちゃん', className: 'modal--hero', body: heroSelectBody(), buttons: [] });
  }

  private startStory(): void {
    const intro: StoryStep[] = [
      { speaker: 'narration', text: 'ある日、勉強机の上に<b>小さなホコリ</b>を見つけた。', button: 'そっと見る', enter: (p) => p?.setSleeping(true) },
      { speaker: 'narration', text: '……！ ホコリが目をあけた！', button: 'わあ！', enter: (p) => p?.playWake() },
      { speaker: 'hero', text: 'かわいい……！ この子は「ほこりちゃん」だ！', button: '次へ' },
      {
        speaker: 'mother',
        text: 'あら、そのホコリ、動いてるの？ ふふ。だったら家のおそうじを手伝ってくれたら、<b>お小遣い</b>をあげるわよ。',
        button: 'やる！',
      },
      { speaker: 'hero', text: '集めたホコリは、ほこりちゃんのごはんにしよう！', button: '次へ' },
      { speaker: 'narration', text: HOW_TO, button: 'はじめる' },
    ];
    this.runStory(intro, 'であい', () => {
      if (!this.save.tutorialDone) this.commit({ ...this.save, tutorialDone: true });
    });
  }

  /** 吹き出しのお話を順に見せ、最後に done を呼ぶ */
  private readonly lastTalk = new Map<TownPerson, string>();

  private runStory(steps: StoryStep[], title: string, done: () => void): void {
    this.story = steps;
    this.storyTitle = title;
    this.storyDone = done;
    this.storyStep = 0;
    this.town?.stop();
    this.showStoryStep();
  }

  /** まちの人に話しかける（前回と同じセリフは続けない） */
  private talkWith(id: CharacterId): void {
    if (!PERSON_IDS.includes(id as PersonId) || id === 'mother' || id === 'agent' || id === 'controller' || id === 'clerk') return;
    const person = id as TownPerson;
    const text = pickTalk(person, this.save, this.random, this.lastTalk.get(person));
    this.lastTalk.set(person, text);
    const name = PEOPLE.find((p) => p.id === person)?.name ?? '';
    this.runStory([{ speaker: person as Speaker, text, button: 'うん' }], name, () => this.refreshHud());
  }

  /** 図鑑：お話に出てきた人を記録する */
  private meet(speaker: string): void {
    if (!PERSON_IDS.includes(speaker as PersonId)) return;
    const r = dexAdd(this.save, 'people', speaker as PersonId);
    if (r.added) this.commit(r.save);
  }

  private showStoryStep(): void {
    const step = this.story[this.storyStep];
    if (!step) {
      const done = this.storyDone;
      this.storyDone = null;
      this.closeModal();
      done?.();
      return;
    }
    step.enter?.(this.pet);
    this.meet(step.speaker);
    this.openOverlay('story', {
      title: step.text === HOW_TO ? 'あそびかた' : this.storyTitle,
      className: 'modal--story',
      // 下のパネルに出して、上の3D（目を覚ますほこりちゃんなど）を見せる
      sheet: true,
      body: storyBody(step.speaker, this.hero, step.text),
      buttons: [{ action: 'storyNext', label: step.button, variant: 'primary' }],
    });
  }

  private openMap(area: Area): void {
    this.mapArea = area;
    this.openOverlay('map', {
      title: area === 'home' ? (this.save.habitat >= 4 ? 'おうち：どこを掃除する？' : 'どこを掃除する？') : AREA_NAMES[area],
      className: 'modal--map',
      body: mapBody(this.save, area, this.now, this.params.speed),
      buttons:
        area === 'station' && this.save.habitat >= 6
          ? [
              { action: 'closeModal', label: 'もどる', variant: 'secondary' },
              { action: 'rideHome', label: this.save.habitat >= 7 ? '電車とロケットで' : '電車で丘へ', sub: 'ほこりちゃんの所へ', variant: 'accent' },
            ]
          : [{ action: 'closeModal', label: 'もどる', variant: 'secondary' }],
    });
  }

  private renderShop(open: boolean): void {
    if (open) this.meet('shopkeeper');
    const body = shopBody(this.save, this.shopTab);
    if (!open) {
      this.hud.updateModalBody(body);
      return;
    }
    this.openOverlay('shop', {
      title: 'ショップ',
      className: 'modal--shop',
      body,
      buttons: [{ action: 'closeModal', label: 'とじる', variant: 'secondary' }],
    });
  }

  private openPlay(): void {
    this.openOverlay('play', {
      title: 'あそぶ',
      className: 'modal--sheet',
      sheet: true,
      body: playBody(this.save),
      buttons: [{ action: 'closeModal', label: 'とじる', variant: 'secondary' }],
    });
  }

  /** あそぶ：ほこりちゃんの写真を撮ってシェアする */
  private async takePhoto(): Promise<void> {
    const pet = this.pet;
    if (!pet || this.mode !== 'HOME') return;
    this.sound.play('happy');
    pet.playHappy();
    // WebGLの絵は描いた直後でないと読めないので、描いてすぐ写す
    this.renderer.render(pet.scene, pet.camera);
    const shot = document.createElement('canvas');
    shot.width = this.hud.canvas.width;
    shot.height = this.hud.canvas.height;
    shot.getContext('2d')?.drawImage(this.hud.canvas, 0, 0);
    const s = this.save;
    const photo = await makePhotoCard(shot, pet.focus(), {
      title: 'ほこりちゃん',
      rank: rankFor(s.growthXp).name,
      xp: s.growthXp,
      home: HABITATS[s.habitat].name,
    });
    if (!photo) {
      this.hud.toast('写真をとれなかった…', 1800);
      return;
    }
    this.dropPhoto();
    this.photo = photo;
    const buttons: ButtonSpec[] = [];
    const canShare = canShareImage(photo);
    if (canShare) buttons.push({ action: 'shareNative', label: 'シェア', sub: 'X・LINEなど', variant: 'primary' });
    buttons.push({ action: 'savePhoto', label: '画像を保存', variant: canShare ? 'secondary' : 'primary' });
    buttons.push({ action: 'closeModal', label: 'とじる', variant: 'secondary' });
    this.openOverlay('photo', {
      title: 'パシャ！',
      className: 'modal--photo',
      body: `<img class="photo" src="${photo.url}" alt="ほこりちゃんの写真"><p class="note">${
        canShare ? '「シェア」から X や LINE を選ぶと、画像つきで投稿できるよ' : '画像を保存して、SNSに投稿してね #ほこりちゃん'
      }</p>`,
      buttons,
    });
  }

  private dropPhoto(): void {
    if (this.photo) URL.revokeObjectURL(this.photo.url);
    this.photo = null;
  }

  private openFeed(): void {
    this.openOverlay('feed', {
      title: 'どのホコリをあげる？',
      className: 'modal--sheet',
      sheet: true,
      body: feedBody(this.save, this.favorite),
      buttons: [
        { action: 'closeModal', label: 'とじる', variant: 'secondary' },
        { action: 'feedType', arg: 'all', label: 'ぜんぶあげる', variant: 'primary', disabled: feedableAmount(this.save, 'all', this.favorite) === 0 },
      ],
    });
  }

  private minutesToNextRequest(): number {
    return Math.ceil((this.save.requestClock - this.now) / 60_000 / this.params.speed);
  }

  private openBoard(): void {
    this.openOverlay('board', {
      title: '掲示板',
      className: 'modal--map',
      body: boardBody(this.save, this.minutesToNextRequest(), contestWaitMinutes(this.save, this.now, this.params.speed)),
      buttons: [{ action: 'closeModal', label: 'とじる', variant: 'secondary' }],
    });
  }

  /** 依頼が時間で届く。新しく届いたら知らせる */
  private tickRequests(notify: boolean): void {
    const next = refreshRequests(this.save, this.now, createRandom((this.save.requestSeq + 1) * 7919 + (this.params.seed ?? 0)), this.params.speed);
    if (next === this.save) return;
    const added = next.requests.length - this.save.requests.length;
    this.save = next;
    writeSave(next);
    if (notify && added > 0 && hasEvent(next, 'town')) this.hud.toast('掲示板に新しい依頼が届いた！', 2400);
    if (this.overlay === 'board') this.hud.updateModalBody(boardBody(this.save, this.minutesToNextRequest(), contestWaitMinutes(this.save, this.now, this.params.speed)));
  }

  // ---- 入力 ----

  private onAction(action: string, arg?: string): void {
    this.sound.unlock();
    switch (action) {
      case 'sound': {
        const enabled = !this.save.soundEnabled;
        this.sound.setEnabled(enabled);
        this.commit({ ...this.save, soundEnabled: enabled });
        this.sound.play('tap');
        return;
      }
      case 'dex':
        if (this.hud.blockingModalOpen) return;
        this.sound.play('tap');
        this.openOverlay('help', {
          title: '図鑑',
          className: 'modal--map',
          body: dexBody(this.save, this.dexTab),
          buttons: [{ action: 'closeModal', label: 'とじる', variant: 'primary' }],
        });
        return;
      case 'dexTab':
        if (this.overlay !== 'help' || !DEX_TABS.includes(arg as DexTab)) return;
        this.dexTab = arg as DexTab;
        this.sound.play('tap');
        this.hud.updateModalBody(dexBody(this.save, this.dexTab), true);
        return;
      case 'help':
        if (this.hud.blockingModalOpen) return;
        this.sound.play('tap');
        this.openOverlay('help', {
          title: 'あそびかた',
          className: 'modal--story',
          body: storyBody('narration', this.hero, HOW_TO),
          buttons: [{ action: 'closeModal', label: 'とじる', variant: 'primary' }],
        });
        return;
      case 'closeModal':
        this.sound.play('tap');
        this.closeModal();
        return;
      case 'pickHero':
        if (arg === 'boy' || arg === 'girl') {
          this.sound.play('happy');
          this.commit({ ...this.save, hero: arg });
          this.closeModal();
          if (!this.save.tutorialDone) this.startStory();
        }
        return;
      case 'storyNext':
        this.sound.play('tap');
        this.storyStep++;
        this.showStoryStep();
        return;
    }

    if (this.mode === 'HOME' || this.mode === 'TOWN') this.onHomeAction(action, arg);
    else if (this.mode === 'CLEANING') this.onCleaningAction(action);
    else if (this.mode === 'SKY' && action === 'skyEnd') this.endSky();
    else if (this.mode === 'WORLD' && action === 'worldEnd') this.endWorld();
    else if (this.mode === 'SPACE' && action === 'spaceEnd') this.endSpace();
    else if (this.mode === 'GALAXY' && action === 'galaxyEnd') this.endGalaxy();
    else if (this.mode === 'BUBBLES' && action === 'bubblesEnd') this.endBubbles();
    else if (this.mode === 'RESULT' && action === 'resultHome') {
      if (this.skyGot || this.worldGot || this.spaceGot || this.galaxyGot || this.bubbleGot) {
        this.closeModal();
        this.goHome();
      } else this.leaveCleaning();
    }
  }

  private onHomeAction(action: string, arg?: string): void {
    switch (action) {
      case 'openMap':
        // コンテナからは家の掃除に行けない（まちの「おうち」から）
        if (this.save.habitat >= 4) return;
        this.sound.play('tap');
        this.openMap('home');
        return;
      case 'goOut':
        this.sound.play('tap');
        this.goTown(this.petBuilding);
        return;
      case 'walkHome':
        this.sound.play('tap');
        this.homeTrip = true;
        this.town?.goToBuilding(this.petBuilding);
        return;
      case 'rideHome':
        // 駅から電車で丘へ
        if (this.mode !== 'TOWN' || this.save.habitat < 6) return;
        this.sound.play('happy');
        this.closeModal();
        this.hud.toast(this.rideHomeText(), 2200);
        this.goHome();
        return;
      case 'goBubbles':
        if (this.mode !== 'HOME' || !canBubbles(this.save)) return;
        this.startBubbles();
        return;
      case 'goGalaxy':
        if (this.mode !== 'HOME' || !canGalaxy(this.save)) return;
        this.startGalaxy();
        return;
      case 'goSpace':
        if (this.mode !== 'HOME' || !canSpace(this.save)) return;
        this.startSpace();
        return;
      case 'goWorld':
        if (this.mode !== 'HOME' || !canWorld(this.save)) return;
        this.startWorld();
        return;
      case 'goSky':
        if (this.mode !== 'HOME' || !canFly(this.save) || skyBlocked(this.save)) return;
        this.startSky();
        return;
      case 'deliverRainy':
        if (this.mode !== 'TOWN') return;
        this.deliverRainyPowder();
        return;
      case 'enterContest':
        if (this.mode !== 'TOWN' || !hasEvent(this.save, 'contestNotice')) return;
        this.sound.play('tap');
        this.startContest();
        return;
      case 'openDest':
        if (this.overlay !== 'none') return;
        this.sound.play('tap');
        this.openOverlay('dest', {
          title: 'どこへ行く？',
          className: 'modal--map',
          sheet: true,
          body: this.destBody(),
          buttons: [{ action: 'closeModal', label: 'とじる', variant: 'secondary' }],
        });
        return;
      case 'walkTo':
        this.homeTrip = false;
        if (this.overlay === 'dest') this.closeModal();
        if (this.overlay !== 'none') return;
        if (BUILDING_IDS.includes(arg as BuildingId)) {
          this.sound.play('tap');
          this.town?.goToBuilding(arg as BuildingId);
        }
        return;
      case 'goSpot': {
        if (!SPOT_IDS.includes(arg as SpotId)) return;
        const def = spotDef(arg as SpotId);
        const started = startSpot(this.save, def, this.now, this.params.speed);
        if (!started) {
          this.sound.play('deny');
          return;
        }
        this.sound.play('tap');
        this.commit(started.save);
        this.closeModal();
        this.startCleaning(def, started.dust);
        return;
      }
      case 'shopTab':
        if (arg === 'tools' || arg === 'home' || arg === 'accessories') {
          this.shopTab = arg;
          this.sound.play('tap');
          this.renderShop(false);
        }
        return;
      case 'buyTool':
      case 'buyHome':
      case 'buyAccessory':
        this.buy(action, arg);
        return;
      case 'buyLand': {
        const r = buyLand(this.save);
        if (!r.ok) {
          this.sound.play('deny');
          return;
        }
        this.sound.play('upgrade');
        this.commit(addEvent(r.save, 'container'));
        this.hud.bump('coins');
        this.closeModal();
        this.goHome();
        this.runStory(CONTAINER_STORY, 'お引っこし', () => this.pet?.playHappy());
        return;
      }
      case 'deliver': {
        const done = deliverRequest(this.save, Number(arg));
        if (!done) {
          this.sound.play('deny');
          return;
        }
        this.sound.play('reward');
        this.commit(done.save);
        this.hud.bump('coins');
        this.hud.toast(`${done.request.client}「ありがとう！」 +${done.request.reward}・★${done.request.rep}`, 2600);
        this.hud.updateModalBody(boardBody(this.save, this.minutesToNextRequest(), contestWaitMinutes(this.save, this.now, this.params.speed)));
        return;
      }
      case 'openPlay':
        this.sound.play('tap');
        this.openPlay();
        return;
      case 'snap':
        void this.takePhoto();
        return;
      case 'shareNative':
        if (this.photo) {
          const photo = this.photo;
          void shareImage(photo).then((r) => {
            if (r === 'failed') this.hud.toast('シェアできなかった…「画像を保存」してから投稿してね', 2600);
          });
        }
        return;
      case 'savePhoto':
        if (this.photo) {
          savePhoto(this.photo);
          this.hud.toast('画像を保存したよ', 1800);
        }
        return;
      case 'openFeed':
        this.sound.play('tap');
        this.openFeed();
        return;
      case 'feedType':
        if (arg === 'all' || DUST_TYPES.includes(arg as DustType)) this.doFeed(arg as DustType | 'all');
        return;
      case 'wear': {
        const id = arg === 'none' ? null : ACCESSORY_IDS.includes(arg as AccessoryId) ? (arg as AccessoryId) : undefined;
        if (id === undefined) return;
        const next = id === null ? { ...this.save, equippedAccessory: null } : toggleAccessory(this.save, id);
        this.sound.play('tap');
        this.commit(next);
        this.pet?.setView(this.petView());
        this.hud.updateModalBody(playBody(this.save));
        return;
      }
      case 'shapePreset': {
        const preset = SHAPE_PRESETS[Number(arg)];
        if (!preset) return;
        this.sound.play('happy');
        this.commit({ ...this.save, shape: { ...preset.shape } });
        this.pet?.setView(this.petView());
        this.hud.updateModalBody(playBody(this.save));
        return;
      }
    }

    if (this.hud.blockingModalOpen) return;
    if (action === 'dry' && this.save.damp) {
      this.commit(dry(this.save));
      this.pet?.setView(this.petView());
      this.pet?.playDry();
      this.sound.play('dry');
    }
  }

  private doFeed(type: DustType | 'all'): void {
    const before = rankFor(this.save.growthXp);
    const beforeTraits = helperStats(this.save);
    const { save, fed, growth, furs } = feed(this.save, type, this.favorite);
    if (fed === 0) {
      this.sound.play('deny');
      return;
    }
    this.commit(save);
    this.pet?.setView(this.petView());
    this.pet?.playFeed(fed);
    this.sound.play('feed');
    window.setTimeout(() => this.sound.play('happy'), 1600);
    if (this.overlay === 'feed') {
      if (bagTotal(save.bag) === 0 || feedableAmount(save, 'all', this.favorite) === 0) this.closeModal();
      else this.openFeed();
    }
    const after = rankFor(save.growthXp);
    const afterTraits = helperStats(save);
    const friendCall = friendUnlocked(save) && !friendUnlocked({ ...save, growthXp: save.growthXp - growth });
    if (friendCall) window.setTimeout(() => this.hud.toast('友だちから電話！「うちに遊びにおいでよ」 おでかけしてみよう', 3600), after !== before ? 3400 : 0);
    if (friendCall && after === before) {
      // 電話のお知らせだけ
    } else if (after !== before) {
      const fur = furs[furs.length - 1];
      if (fur) this.hud.toast(`${after.name}に成長した！ 毛並み「${furName(fur.fur)}」${fur.isNew ? 'を図鑑に記録！' : ''}`, 3200);
      else this.hud.toast(`${after.name}に成長した！`);
    } else if (afterTraits.sneeze && !beforeTraits.sneeze) {
      this.hud.toast(`毛並みが変わった！「${DUSTS.pollen.trait}」が使えるようになった`);
    } else if (growth > fed && !isFull(save)) {
      this.hud.toast(`なつかしの味！ ${fed}個で 成長+${growth}`, 2200);
    } else if (isFull(save)) {
      this.hud.toast(
        save.habitat === 0 ? '机の上ではもう育てない…ショップでケースを買おう' : save.habitat < 3 ? 'ケースがいっぱい！ショップで大きくしよう' : 'すみかがいっぱい！',
      );
    }
    if (landMeetingDue(save)) {
      window.setTimeout(() => {
        if (this.mode === 'HOME' && landMeetingDue(this.save)) {
          this.runStory(LAND_MEETING, '家族会議', () => this.commit(addEvent(this.save, 'landMeeting')));
        }
      }, 2600);
    }
  }

  private buy(action: string, arg?: string): void {
    let result: { save: SaveData; ok: boolean } = { save: this.save, ok: false };
    let message = '';
    if (action === 'buyTool' && arg && arg in TOOLS) {
      result = buyTool(this.save, arg as ToolId);
      message = `${TOOLS[arg as ToolId].name}を手に入れた！`;
    } else if (action === 'buyHome') {
      const before = this.save.habitat;
      result = buyHabitat(this.save);
      const h = result.save.habitat;
      message =
        before === 0
          ? `${HABITATS[h].name}を買った！ 帰ってお引っこししよう`
          : h === 5
            ? '倉庫を注文した！ 空き地に建ったよ。帰ってみよう'
            : `${HABITATS[h].name}を買った！容量 ${HABITATS[h].capacity}`;
    } else if (action === 'buyAccessory' && ACCESSORY_IDS.includes(arg as AccessoryId)) {
      result = buyAccessory(this.save, arg as AccessoryId);
      message = '買った！ ほこりちゃんにつけてあげよう';
    }
    if (!result.ok) {
      this.sound.play('deny');
      return;
    }
    this.commit(result.save);
    this.sound.play('upgrade');
    this.hud.bump('coins');
    this.pet?.setView(this.petView());
    this.pet?.playHappy();
    this.hud.toast(message);
    this.renderShop(false);
  }

  private onSlider(name: string, value: number, done: boolean): void {
    if (this.mode !== 'HOME' || this.overlay !== 'play') return;
    if (name !== 'width' && name !== 'height' && name !== 'fluff') return;
    const shape: PetShape = clampShape({ ...this.save.shape, [name]: value });
    this.save = { ...this.save, shape };
    this.pet?.setView(this.petView());
    // ドラッグ中は表示だけ更新し、指を離したら保存する
    if (done) writeSave(this.save);
  }

  private onCleaningAction(action: string): void {
    const session = this.session;
    if (!session) return;
    if (action === 'finish') {
      this.enterResult();
    } else if (action === 'sneeze') {
      if (!this.sneezeLeft || !this.cleaning) return;
      this.sneezeLeft = false;
      const n = this.cleaning.sneeze();
      this.sound.play('dry');
      this.hud.toast(n > 0 ? `はっくしょん！ ホコリを${n}個すいこんだ` : 'はっくしょん！ ……まわりにホコリがなかった', 1800);
      this.refreshHud();
    } else if (action === 'goHome' && this.contest) {
      this.sound.play('tap');
      this.openOverlay('confirm', {
        title: '大会をやめる？',
        body: `途中でやめると賞金はもらえないよ。<br>次の大会は${CONTEST.cooldownMinutes}分後。`,
        buttons: [
          { action: 'closeModal', label: '続ける', variant: 'secondary' },
          { action: 'leaveNow', label: 'やめる', variant: 'primary' },
        ],
      });
    } else if (action === 'goHome') {
      if (canClaimReward(session)) {
        this.enterResult();
        return;
      }
      this.sound.play('tap');
      this.openOverlay('confirm', {
        title: '帰る？',
        body: `まだ8割集めていないので、お小遣いはもらえないよ。<br>集めたホコリ（${session.collected.size}個）はバッグに入っているよ。`,
        buttons: [
          { action: 'closeModal', label: '続ける', variant: 'secondary' },
          { action: 'leaveNow', label: '帰る', variant: 'primary' },
        ],
      });
    } else if (action === 'leaveNow') {
      this.leaveCleaning();
    }
  }

  /** モーダル表示中は3D側の入力を止める（「あそぶ」「餌」パネルの間はなでられる） */
  private syncInput(): void {
    this.cleaning?.setInputEnabled(this.mode === 'CLEANING' && !this.hud.modalOpen);
    this.pet?.setInputEnabled(this.mode === 'HOME' && (this.overlay === 'none' || this.overlay === 'play' || this.overlay === 'feed'));
    this.town?.setInputEnabled(this.mode === 'TOWN' && this.overlay === 'none');
    this.sky?.setInputEnabled(this.mode === 'SKY' && !this.hud.modalOpen);
    this.earth?.setInputEnabled(this.mode === 'WORLD' && !this.hud.modalOpen);
    this.space?.setInputEnabled(this.mode === 'SPACE' && !this.hud.modalOpen);
    this.galaxy?.setInputEnabled(this.mode === 'GALAXY' && !this.hud.modalOpen);
    this.bubbles?.setInputEnabled(this.mode === 'BUBBLES' && !this.hud.modalOpen);
  }

  private bindLifecycle(): void {
    // iOSの音声解禁は最初のタッチで
    window.addEventListener('pointerdown', () => this.sound.unlock(), { capture: true });
    const pause = () => {
      this.cleaning?.cancelInput();
      this.pet?.cancelInput();
      this.sound.stopHum();
    };
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        pause();
        writeSave(this.save);
      }
    });
    window.addEventListener('pagehide', () => writeSave(this.save));
  }

  // ---- ループ ----

  private resize(): void {
    const rect = this.hud.stage.getBoundingClientRect();
    this.renderer.resize(rect.width, rect.height);
    this.scene?.resize(this.renderer.aspect, this.renderer.lowWidth);
    this.syncSheetInset();
  }

  /** 名札や行き先に出してよい建物（まだ知らない家・閉まっている店は出さない） */
  private townKnown(id: BuildingId): boolean {
    const s = this.save;
    switch (id) {
      case 'friend':
        return friendUnlocked(s);
      case 'flower':
      case 'bakery':
      case 'grandma':
        return hasEvent(s, 'street') && areaUnlocked(s, id);
      case 'station':
      case 'school':
        return areaUnlocked(s, id);
      default:
        return true;
    }
  }

  private destBody(): string {
    const s = this.save;
    const notes: Partial<Record<BuildingId, string>> = {
      home: s.habitat >= 4 ? '家の掃除' : 'ほこりちゃんのいる家',
      shop: '道具・ケース・アクセサリー',
      board: s.requests.length > 0 ? `依頼 ${s.requests.length}件` : '依頼の掲示板',
      lot: s.habitat >= 6 ? '写真と道具の倉庫（掃除）' : s.habitat >= 4 ? 'ほこりちゃんのいる所' : '売地',
      friend: '友だちの家の掃除',
      flower: '花粉が多い', bakery: '粉ぼこりが多い', grandma: '猫の毛が多い',
      station: s.habitat >= 7 ? 'すす・電車とロケットで月へ' : s.habitat >= 6 ? 'すす・電車で丘へ' : 'すすと砂ぼこり', school: 'チョークの粉',
    };
    const order: BuildingId[] =
      s.habitat >= 6
        ? ['station', 'lot', 'home', 'board', 'shop', 'friend', 'flower', 'bakery', 'grandma', 'school']
        : s.habitat >= 4
        ? ['lot', 'home', 'board', 'shop', 'friend', 'flower', 'bakery', 'grandma', 'station', 'school']
        : ['home', 'board', 'shop', 'friend', 'lot', 'flower', 'bakery', 'grandma'];
    const items = order
      .filter((id) => this.townKnown(id) && (id !== 'lot' || s.habitat >= 4 || hasEvent(s, 'landMeeting')))
      .map((id) => `<button type="button" class="dest" data-action="walkTo" data-arg="${id}"><b>${this.townLabel(id)}</b><small>${notes[id] ?? ''}</small></button>`)
      .join('');
    return `<div class="dests">${items}</div><p class="note">遠い所へは走っていくよ</p>`;
  }

  private townLabel(id: BuildingId): string {
    const s = this.save;
    switch (id) {
      case 'home':
        return 'おうち';
      case 'shop':
        return 'ショップ';
      case 'board':
        return s.requests.length > 0 ? `掲示板（${s.requests.length}）` : '掲示板';
      case 'lot':
        return s.habitat >= 6 ? '思い出の倉庫' : s.habitat >= 5 ? '倉庫' : s.habitat >= 4 ? 'コンテナ' : '空き地';
      case 'friend':
        return friendUnlocked(s) ? '友だちの家' : '？？？の家';
      case 'flower':
      case 'bakery':
      case 'grandma':
        return areaUnlocked(s, id) ? AREA_NAMES[id] : '？？？';
      case 'station':
        return '駅';
      case 'school':
        return '学校';
    }
  }

  private frame(timeMs: number): void {
    const time = timeMs / 1000;
    const dt = this.lastTime === 0 ? 0 : Math.min(0.05, time - this.lastTime);
    this.lastTime = time;

    if (this.autoFinishTimer > 0) {
      this.autoFinishTimer -= dt;
      if (this.autoFinishTimer <= 0 && this.mode === 'CLEANING' && !this.hud.modalOpen) this.enterResult();
    }
    if (this.bubbleGot && this.bubbles && this.mode === 'BUBBLES' && !this.hud.modalOpen) {
      const left = Math.max(0, Math.ceil((this.bubbleGot.endsAt - this.now) / 1000));
      if (left !== this.bubbleGot.lastLeft) {
        this.bubbleGot.lastLeft = left;
        this.refreshHud();
      }
      if (left <= 0 || this.bubbles.finished) this.endBubbles();
    }
    if (this.galaxyGot && this.galaxy && this.mode === 'GALAXY' && !this.hud.modalOpen) {
      const left = Math.max(0, Math.ceil((this.galaxyGot.endsAt - this.now) / 1000));
      if (left !== this.galaxyGot.lastLeft) {
        this.galaxyGot.lastLeft = left;
        this.refreshHud();
      }
      // かき集めたつぶは、少しずつまとめてバッグへ
      if (this.now - this.galaxyGot.savedAt > 600) this.flushGalaxy();
      if (left <= 0 || this.galaxy.remainingMotes === 0) this.endGalaxy();
    }
    if (this.spaceGot && this.space && this.mode === 'SPACE' && !this.hud.modalOpen) {
      const left = Math.max(0, Math.ceil((this.spaceGot.endsAt - this.now) / 1000));
      if (left !== this.spaceGot.lastLeft) {
        this.spaceGot.lastLeft = left;
        this.refreshHud();
      }
      if (left <= 0 || this.space.remaining === 0) this.endSpace();
    }
    if (this.worldGot && this.earth && this.mode === 'WORLD' && !this.hud.modalOpen) {
      const left = Math.max(0, Math.ceil((this.worldGot.endsAt - this.now) / 1000));
      if (left !== this.worldGot.lastLeft) {
        this.worldGot.lastLeft = left;
        this.refreshHud();
      }
      if (left <= 0 || this.earth.remaining === 0) this.endWorld();
    }
    if (this.skyGot && this.sky && this.mode === 'SKY' && !this.hud.modalOpen) {
      const left = Math.max(0, Math.ceil((this.skyGot.endsAt - this.now) / 1000));
      if (left !== this.skyGot.lastLeft) {
        this.skyGot.lastLeft = left;
        this.refreshHud();
      }
      if (left <= 0 || this.sky.remaining === 0) this.endSky();
    }
    if (this.contest && this.mode === 'CLEANING' && !this.hud.modalOpen) {
      const left = this.contestLeft();
      if (left !== this.contest.lastLeft) {
        this.contest.lastLeft = left;
        this.refreshHud();
        if (left <= 5 && left > 0) this.sound.play('tap');
      }
      if (left <= 0) this.endContest();
      else this.nextWave();
    }
    if (this.cleaning && this.mode === 'CLEANING') {
      const off = this.cleaning.offscreenDust();
      this.hud.setEdgeArrows(off.left, off.right);
    }
    if (this.town && this.mode === 'TOWN') {
      // 名札は画面内の、行ける建物だけ（画面外や未開放の建物は「行き先」から）
      this.hud.setLabels(
        this.town
          .labels()
          .filter((l) => !l.off && this.townKnown(l.id))
          .map((l) => ({ id: l.id, text: this.townLabel(l.id), x: l.x, y: l.y })),
      );
    }
    // 1秒ごと：依頼の到着とマップの積もり具合を更新する
    this.refreshTimer -= dt;
    if (this.refreshTimer <= 0) {
      this.refreshTimer = 1;
      this.tickRequests(true);
      // 空の雲がたまっていく様子をボタンに出す
      if (this.mode === 'HOME' && canFly(this.save) && this.overlay === 'none') this.hud.setActions(this.homeButtons());
      if (this.overlay === 'map') this.hud.updateModalBody(mapBody(this.save, this.mapArea, this.now, this.params.speed));
      if (this.overlay === 'board') this.hud.updateModalBody(boardBody(this.save, this.minutesToNextRequest(), contestWaitMinutes(this.save, this.now, this.params.speed)));
    }
    if (this.scene) {
      this.scene.update(dt, time);
      this.renderer.render(this.scene.scene, this.scene.camera);
    }
  }
}
