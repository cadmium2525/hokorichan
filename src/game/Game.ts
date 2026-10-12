// ゲーム全体の進行。状態遷移 BOOT→HOME→CLEANING→RESULT→HOME を管理し、
// ルールは state.ts、保存は save.ts、描画は scenes/render、画面の中身は ui に任せる。

import { PixelRenderer } from '../render/pixelRenderer.ts';
import { buildSpot } from '../render/spotBuilder.ts';
import { CleaningScene } from '../scenes/CleaningScene.ts';
import { PetScene } from '../scenes/PetScene.ts';
import { TownScene } from '../scenes/TownScene.ts';
import type { BuildingId } from '../render/townBuilder.ts';
import type { GameScene } from '../scenes/types.ts';
import { Hud, type ButtonSpec } from '../ui/hud.ts';
import {
  heroSelectBody,
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
  FRIEND_UNLOCK_XP,
  HABITATS,
  SHAPE_PRESETS,
  spotDef,
  SPOT_IDS,
  TOOLS,
  type AccessoryId,
  type Area,
  type Hero,
  type PetShape,
  type SpotDef,
  type SpotId,
  type ToolId,
} from './catalog.ts';
import { createRandom, type Random } from './rng.ts';
import { loadSave, writeSave } from './save.ts';
import {
  bestTool,
  buyAccessory,
  buyHabitat,
  buyTool,
  canClaimReward,
  capacityOf,
  clampShape,
  claimReward,
  collectDust,
  createSession,
  dry,
  feed,
  feedableAmount,
  finishSpot,
  friendUnlocked,
  isFull,
  rankFor,
  REWARD_PER_DUST,
  requiredCount,
  rewardFor,
  rollDamp,
  startSpot,
  toggleAccessory,
  type CleaningSession,
  type SaveData,
} from './state.ts';

export type Mode = 'BOOT' | 'HOME' | 'TOWN' | 'CLEANING' | 'RESULT';

type Overlay = 'none' | 'hero' | 'story' | 'map' | 'shop' | 'play' | 'confirm' | 'result' | 'help' | 'lot';

/** URLパラメータによるテスト用設定（?seed=123&damp=1&fast=1 など） */
type DebugParams = { seed: number | null; damp: boolean | null; speed: number };

function readParams(): DebugParams {
  const q = new URLSearchParams(location.search);
  const seed = q.get('seed');
  const damp = q.get('damp');
  return {
    seed: seed !== null && /^\d+$/.test(seed) ? Number(seed) : null,
    damp: damp === '1' ? true : damp === '0' ? false : null,
    // ホコリが積もる速さを60倍にする（1分で1時間分）
    speed: q.get('fast') === '1' ? 60 : 1,
  };
}

type StoryStep = { speaker: Speaker; text: string; button: string; enter?: (scene: PetScene | null) => void };

const HOW_TO =
  '「おそうじ」で家の中の場所をえらんで、指でなぞってホコリを集めよう。<br>' +
  '最初は<b>素手</b>。「おでかけ」して<b>ショップ</b>に行くと、お小遣いで掃除用具やケースを買えるよ。<br>' +
  'ホコリは時間がたつとまた積もるから、待つ間は「あそぶ」でなでたり着せかえたりしよう！';

const TOWN_INTRO: StoryStep[] = [
  {
    speaker: 'narration',
    text: 'ここは家のまわりの<b>まち</b>。<br>行きたい場所をタップすると歩いていくよ。<br>ショップでは掃除用具やケースが買えるよ。',
    button: 'わかった',
  },
];

const FRIEND_INTRO: StoryStep[] = [
  { speaker: 'friend', text: 'いらっしゃい！ うわさの「ほこりちゃん」、そんなに大きくなったんだ！', button: 'えへへ' },
  { speaker: 'friendMom', text: 'うちも最近ホコリがたまって困ってたの。おそうじしてくれたら、<b>お小遣い</b>をあげるわね。', button: 'まかせて！' },
  { speaker: 'hero', text: '自分の家のホコリが積もるまでは、友だちの家をおそうじしよう！', button: '次へ' },
];

const INTRO: StoryStep[] = [
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

const TOOL_HINT: Record<ToolId, string> = {
  hand: '指でなぞってホコリをつまもう',
  rag: 'なぞってぞうきんで拭き取ろう',
  mop: 'なぞってモップでからめ取ろう',
  vacuum: 'なぞって掃除機で吸い込もう',
};

export class Game {
  private save: SaveData;
  private mode: Mode = 'BOOT';
  private overlay: Overlay = 'none';
  private readonly hud: Hud;
  private readonly renderer: PixelRenderer;
  private readonly sound: Sound;
  private readonly params = readParams();
  private readonly random: Random;

  private scene: GameScene | null = null;
  private pet: PetScene | null = null;
  private cleaning: CleaningScene | null = null;
  private session: CleaningSession | null = null;
  private spot: SpotDef | null = null;
  private sessionCount = 0;
  private pendingDamp = false;
  private autoFinishTimer = 0;
  private storyStep = 0;
  private story: StoryStep[] = INTRO;
  private storyDone: (() => void) | null = null;
  private town: TownScene | null = null;
  private mapArea: Area = 'home';
  private shopTab: ShopTab = 'tools';
  private lastPetSound = 0;
  private mapRefresh = 0;
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
    this.goHome();
    if (!this.save.hero) this.showHeroSelect();
    else if (!this.save.tutorialDone) this.startStory();
    this.renderer.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private get now(): number {
    return Date.now();
  }

  private get hero(): Hero {
    return this.save.hero ?? 'boy';
  }

  // ---- 保存と表示 ----

  private commit(next: SaveData): void {
    this.save = next;
    writeSave(next);
    this.refreshHud();
  }

  private petView() {
    const s = this.save;
    return { xp: s.growthXp, habitat: s.habitat, damp: s.damp, accessory: s.equippedAccessory, shape: s.shape };
  }

  private refreshHud(): void {
    const s = this.save;
    this.hud.setWallet(s.coins, s.dustBag, s.soundEnabled);
    if (this.mode === 'HOME') {
      this.hud.setPetStatus(rankFor(s.growthXp).name, s.growthXp, capacityOf(s.habitat), HABITATS[s.habitat].name, s.damp);
      this.hud.setActions(this.homeButtons());
    } else if (this.mode === 'TOWN') {
      this.hud.setTownStatus('行きたい場所をタップしよう');
      this.hud.setActions([{ action: 'walkHome', label: 'おうちに帰る', variant: 'accent' }]);
    } else if ((this.mode === 'CLEANING' || this.mode === 'RESULT') && this.session) {
      const sess = this.session;
      const need = requiredCount(sess);
      this.hud.setCleaningStatus(this.spot?.name ?? 'おそうじ中', sess.collected.size, sess.total, need);
      const left = Math.max(0, need - sess.collected.size);
      this.hud.setActions([
        { action: 'goHome', label: '帰る', variant: 'secondary' },
        {
          action: 'finish',
          label: '掃除完了',
          sub: left > 0 ? `あと${left}個` : `お小遣い ${rewardFor(sess)}`,
          variant: 'primary',
          disabled: !canClaimReward(sess),
        },
      ]);
    }
  }

  private homeButtons(): ButtonSpec[] {
    const s = this.save;
    const feedable = feedableAmount(s);
    const buttons: ButtonSpec[] = [];
    if (s.damp) buttons.push({ action: 'dry', label: '乾燥させる', sub: '無料', variant: 'water' });
    buttons.push({ action: 'openMap', label: 'おそうじ', sub: '家の中', variant: 'accent' });
    buttons.push({
      action: 'feed',
      label: '餌をあげる',
      sub: s.dustBag === 0 ? 'バッグが空' : isFull(s) ? 'いっぱい' : `${feedable}個`,
      variant: 'primary',
      disabled: feedable === 0,
    });
    buttons.push({ action: 'goOut', label: 'おでかけ', sub: friendUnlocked(s) ? 'ショップ・友だちの家' : 'ショップ', variant: 'secondary' });
    buttons.push({ action: 'openPlay', label: 'あそぶ', variant: 'secondary' });
    return buttons;
  }

  // ---- 画面切替 ----

  private setScene(scene: GameScene): void {
    this.scene?.dispose();
    this.scene = scene;
    scene.resize(this.renderer.aspect);
  }

  private goHome(): void {
    this.cleaning = null;
    this.town = null;
    this.session = null;
    this.spot = null;
    this.mode = 'HOME';
    this.hud.setLabels([]);
    this.hud.hint(null);
    this.hud.setEdgeArrows(0, 0);
    this.sound.stopHum();

    let becameDamp = false;
    if (this.pendingDamp && !this.save.damp) {
      becameDamp = true;
      this.save = { ...this.save, damp: true };
      writeSave(this.save);
    }
    this.pendingDamp = false;
    this.pet = new PetScene(this.petView(), {
      element: this.hud.canvas,
      onPet: () => {
        if (this.lastTime - this.lastPetSound > 0.4) {
          this.lastPetSound = this.lastTime;
          this.sound.play('happy');
        }
      },
    });
    this.setScene(this.pet);
    this.syncInput();
    this.refreshHud();
    const s = this.save;
    if (becameDamp) this.hud.toast('お留守番中に湿気でしっとり…「乾燥させる」でふかふかに！', 3200);
    else if (isFull(s) && s.habitat < 3) this.hud.toast(s.habitat === 0 ? '机の上ではもう育てない…ショップでケースを買おう' : 'ケースがいっぱい！ショップで大きくしよう');
  }

  /** まちへ。startAt の建物の入口の前から歩き出す */
  private goTown(startAt: BuildingId): void {
    this.cleaning = null;
    this.pet = null;
    this.session = null;
    this.spot = null;
    this.mode = 'TOWN';
    this.hud.hint(null);
    this.hud.setEdgeArrows(0, 0);
    this.sound.stopHum();
    this.town = new TownScene({
      element: this.hud.canvas,
      hero: this.hero,
      startAt,
      onArrive: (id) => this.onArrive(id),
    });
    this.setScene(this.town);
    this.refreshHud();
    this.syncInput();
    if (!this.save.townIntroDone) {
      this.runStory(TOWN_INTRO, 'まち', () => this.commit({ ...this.save, townIntroDone: true }));
    }
  }

  /** まちで建物の入口に着いた */
  private onArrive(id: BuildingId): void {
    if (this.mode !== 'TOWN') return;
    switch (id) {
      case 'home':
        this.sound.play('tap');
        this.goHome();
        return;
      case 'shop':
        this.sound.play('tap');
        this.renderShop(true);
        return;
      case 'friend':
        if (!friendUnlocked(this.save)) {
          this.sound.play('deny');
          this.hud.toast(`まだ知らない家だ…（ほこりちゃんが成長${FRIEND_UNLOCK_XP}になったら？）`, 2800);
          return;
        }
        this.sound.play('tap');
        if (!this.save.friendIntroDone) {
          this.runStory(FRIEND_INTRO, '友だちの家', () => {
            this.commit({ ...this.save, friendIntroDone: true });
            this.openMap('friend');
          });
        } else {
          this.openMap('friend');
        }
        return;
      case 'lot':
        this.sound.play('tap');
        this.openOverlay('lot', {
          title: '空き地',
          className: 'modal--story',
          body: storyBody('narration', this.hero, '草がのびた広い空き地。<br>「売地」の看板が立っている……。<br>いつかここに、ほこりちゃんのための<b>倉庫</b>を建てられるかも？<br><small>（準備中）</small>'),
          buttons: [{ action: 'closeModal', label: 'もどる', variant: 'secondary' }],
        });
        return;
    }
  }

  private startCleaning(def: SpotDef, dust: number): void {
    this.pet = null;
    this.sessionCount++;
    const seed = (this.params.seed ?? Math.floor(this.random() * 1e9)) + this.sessionCount * 101;
    // 湿気は清掃セッション開始時に判定し、帰宅時に反映する（はじめの2回は除外）
    this.pendingDamp = this.params.damp ?? (this.save.cleanedSessions >= 2 && rollDamp(this.random));
    const tool = bestTool(this.save);

    const layout = buildSpot(def.id, seed);
    const scene = new CleaningScene({
      seed,
      dustCount: dust,
      layout,
      tool,
      hero: this.hero,
      element: this.hud.canvas,
      onCollect: (id) => this.onCollect(id),
      onSuctionChange: (active) => (active && tool.id === 'vacuum' ? this.sound.startHum() : this.sound.stopHum()),
    });
    this.hud.setLabels([]);
    this.town = null;
    this.session = createSession(this.sessionCount, def, scene.dustTotal);
    this.spot = def;
    this.cleaning = scene;
    this.mode = 'CLEANING';
    this.autoFinishTimer = 0;
    this.setScene(scene);
    this.syncInput();
    // 部屋は横にはみ出すので端スクロールの案内も出す
    this.hud.hint(layout.scale < 1 ? TOOL_HINT[tool.id] : `${TOOL_HINT[tool.id]}\n端に寄せると画面が動くよ`);
    this.refreshHud();
  }

  private onCollect(id: number): void {
    const session = this.session;
    if (!session || this.mode !== 'CLEANING') return;
    if (!collectDust(session, id)) return;
    this.hud.hint(null);
    this.sound.play('collect');
    this.commit({ ...this.save, dustBag: this.save.dustBag + 1 });
    this.hud.bump('bag');
    if (session.collected.size === session.total) this.autoFinishTimer = 0.8;
  }

  /** 掃除を終えて、取り残しを場所に記録してから帰宅する */
  private leaveCleaning(): void {
    const area = this.spot?.area ?? 'home';
    if (this.session && this.spot) {
      const remaining = this.session.total - this.session.collected.size;
      this.commit(finishSpot(this.save, this.spot, remaining, this.now));
    }
    this.closeModal();
    // 友だちの家の掃除が終わったら、友だちの家の前（まち）に戻る
    if (area === 'friend') this.goTown('friend');
    else this.goHome();
  }

  /** RESULT：お母さんからお小遣い。報酬確定はここで一度だけ */
  private enterResult(): void {
    const session = this.session;
    if (!session || this.mode !== 'CLEANING') return;
    const result = claimReward(this.save, session);
    if (!result) return;
    this.mode = 'RESULT';
    this.cleaning?.setInputEnabled(false);
    this.sound.stopHum();
    this.sound.play('reward');
    this.commit(result.save);
    this.hud.bump('coins');
    this.openOverlay('result', {
      title: 'おそうじ完了！',
      className: 'modal--result',
      body: resultBody({
        hero: this.hero,
        spot: session.spot,
        collected: session.collected.size,
        total: session.total,
        reward: result.reward,
        base: session.rewardBase,
        perDust: REWARD_PER_DUST,
        bag: this.save.dustBag,
      }),
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
    this.runStory(INTRO, 'であい', () => {
      if (!this.save.tutorialDone) this.commit({ ...this.save, tutorialDone: true });
    });
  }

  /** 吹き出しのお話を順に見せ、最後に done を呼ぶ */
  private runStory(steps: StoryStep[], title: string, done: () => void): void {
    this.story = steps;
    this.storyTitle = title;
    this.storyDone = done;
    this.storyStep = 0;
    this.town?.stop();
    this.showStoryStep();
  }

  private storyTitle = '';

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
    const isHowTo = this.story === INTRO && this.storyStep === INTRO.length - 1;
    this.openOverlay('story', {
      title: isHowTo ? 'あそびかた' : this.storyTitle,
      className: 'modal--story',
      // 下のパネルに出して、机の上のほこりちゃんが目を覚ますところを見せる
      sheet: true,
      body: storyBody(step.speaker, this.hero, step.text),
      buttons: [{ action: 'storyNext', label: step.button, variant: 'primary' }],
    });
  }

  private openMap(area: Area): void {
    this.mapArea = area;
    this.openOverlay('map', {
      title: 'どこを掃除する？',
      className: 'modal--map',
      body: mapBody(this.save, area, this.now, this.params.speed),
      buttons: [{ action: 'closeModal', label: 'もどる', variant: 'secondary' }],
    });
  }

  private renderShop(open: boolean): void {
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
    else if (this.mode === 'RESULT' && action === 'resultHome') this.leaveCleaning();
  }

  private onHomeAction(action: string, arg?: string): void {
    switch (action) {
      case 'openMap':
        this.sound.play('tap');
        this.openMap('home');
        return;
      case 'goOut':
        this.sound.play('tap');
        this.goTown('home');
        return;
      case 'walkHome':
        this.sound.play('tap');
        this.town?.goToBuilding('home');
        return;
      case 'walkTo':
        if (this.overlay !== 'none') return;
        if (arg === 'home' || arg === 'shop' || arg === 'friend' || arg === 'lot') {
          this.sound.play('tap');
          this.town?.goToBuilding(arg);
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
      case 'openPlay':
        this.sound.play('tap');
        this.openPlay();
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
    switch (action) {
      case 'feed': {
        const before = rankFor(this.save.growthXp);
        const { save, fed } = feed(this.save);
        if (fed === 0) {
          this.sound.play('deny');
          return;
        }
        this.commit(save);
        this.pet?.setView(this.petView());
        this.pet?.playFeed(fed);
        this.sound.play('feed');
        window.setTimeout(() => this.sound.play('happy'), 1600);
        const after = rankFor(save.growthXp);
        if (friendUnlocked(save) && !friendUnlocked({ ...save, growthXp: save.growthXp - fed })) {
          this.hud.toast('友だちから電話！「うちに遊びにおいでよ」 おでかけしてみよう', 3600);
        } else if (after !== before) this.hud.toast(`${after.name}に成長した！`);
        else if (isFull(save)) {
          this.hud.toast(
            save.habitat === 0 ? '机の上ではもう育てない…ショップでケースを買おう' : save.habitat < 3 ? 'ケースがいっぱい！ショップで大きくしよう' : 'ケースがいっぱい！（今の上限）',
          );
        }
        return;
      }
      case 'dry': {
        if (!this.save.damp) return;
        this.commit(dry(this.save));
        this.pet?.setView(this.petView());
        this.pet?.playDry();
        this.sound.play('dry');
        return;
      }
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
      message = before === 0 ? `${HABITATS[h].name}にお引っこし！` : `${HABITATS[h].name}に広げた！容量 ${HABITATS[h].capacity}`;
    } else if (action === 'buyAccessory' && ACCESSORY_IDS.includes(arg as AccessoryId)) {
      result = buyAccessory(this.save, arg as AccessoryId);
      message = 'さっそく付けてみた！';
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

  /** モーダル表示中は3D側の入力を止める（「あそぶ」パネルの間はなでられる） */
  private syncInput(): void {
    this.cleaning?.setInputEnabled(this.mode === 'CLEANING' && !this.hud.modalOpen);
    this.pet?.setInputEnabled(this.mode === 'HOME' && (this.overlay === 'none' || this.overlay === 'play'));
    this.town?.setInputEnabled(this.mode === 'TOWN' && this.overlay === 'none');
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
    this.scene?.resize(this.renderer.aspect);
    this.syncSheetInset();
  }

  private frame(timeMs: number): void {
    const time = timeMs / 1000;
    const dt = this.lastTime === 0 ? 0 : Math.min(0.05, time - this.lastTime);
    this.lastTime = time;

    if (this.autoFinishTimer > 0) {
      this.autoFinishTimer -= dt;
      if (this.autoFinishTimer <= 0 && this.mode === 'CLEANING' && !this.hud.modalOpen) this.enterResult();
    }
    if (this.cleaning && this.mode === 'CLEANING') {
      const off = this.cleaning.offscreenDust();
      this.hud.setEdgeArrows(off.left, off.right);
    }
    if (this.town && this.mode === 'TOWN') {
      const unlocked = friendUnlocked(this.save);
      const names: Record<BuildingId, string> = { home: 'おうち', shop: 'ショップ', friend: unlocked ? '友だちの家' : '？？？の家', lot: '空き地' };
      const arrow = { left: '◀ ', right: '', up: '▲ ', down: '▼ ' };
      this.hud.setLabels(
        this.town.labels().map((l) => ({
          id: l.id,
          text: l.off ? `${arrow[l.off]}${names[l.id]}${l.off === 'right' ? ' ▶' : ''}` : names[l.id],
          x: l.x,
          y: l.y,
          action: l.off ? 'walkTo' : undefined,
        })),
      );
    }
    // マップを開いている間は積もり具合を1秒ごとに更新する
    if (this.overlay === 'map') {
      this.mapRefresh -= dt;
      if (this.mapRefresh <= 0) {
        this.mapRefresh = 1;
        this.hud.updateModalBody(mapBody(this.save, this.mapArea, this.now, this.params.speed));
      }
    }
    if (this.scene) {
      this.scene.update(dt, time);
      this.renderer.render(this.scene.scene, this.scene.camera);
    }
  }
}
