// ゲーム全体の進行。状態遷移 BOOT→HOME→CLEANING→RESULT→HOME を管理し、
// ルールは state.ts、保存は save.ts、描画は scenes/render に任せる。

import { PixelRenderer } from '../render/pixelRenderer.ts';
import { CleaningScene } from '../scenes/CleaningScene.ts';
import { PetScene } from '../scenes/PetScene.ts';
import type { GameScene } from '../scenes/types.ts';
import { Hud, type ButtonSpec } from '../ui/hud.ts';
import { Sound } from './audio.ts';
import { createRandom, randInt, type Random } from './rng.ts';
import { loadSave, writeSave } from './save.ts';
import {
  canClaimReward,
  canUpgrade,
  caseCapacity,
  claimReward,
  collectDust,
  createSession,
  dry,
  DUST_MAX,
  DUST_MIN,
  feed,
  feedableAmount,
  isCaseFull,
  nextUpgradeCost,
  rankFor,
  REWARD_BASE,
  REWARD_PER_DUST,
  requiredCount,
  rollDamp,
  upgradeCase,
  type CleaningSession,
  type SaveData,
} from './state.ts';

export type Mode = 'BOOT' | 'HOME' | 'CLEANING' | 'RESULT';

/** URLパラメータによるテスト用設定（?seed=123&damp=1 など） */
type DebugParams = { seed: number | null; damp: boolean | null };

function readParams(): DebugParams {
  const q = new URLSearchParams(location.search);
  const seed = q.get('seed');
  const damp = q.get('damp');
  return {
    seed: seed !== null && /^\d+$/.test(seed) ? Number(seed) : null,
    damp: damp === '1' ? true : damp === '0' ? false : null,
  };
}

const TUTORIAL = [
  {
    title: 'お部屋をおそうじ',
    body: '画面を指でなぞると、掃除機がホコリを吸い込むよ。<br>8割集めると<b>お小遣い</b>がもらえる！',
  },
  {
    title: 'ほこりちゃんにあげる',
    body: '家に帰ったら「あげる」でバッグのホコリを食べさせよう。<br>食べるほど<b>大きく</b>育つよ。',
  },
  {
    title: 'ケースを広げる',
    body: 'ケースがいっぱいになったら、お小遣いで<b>拡張</b>しよう。<br>湿気でしょんぼりしたら「乾燥させる」で元気に！',
  },
];

export class Game {
  private save: SaveData;
  private mode: Mode = 'BOOT';
  private readonly hud: Hud;
  private readonly renderer: PixelRenderer;
  private readonly sound: Sound;
  private readonly params = readParams();
  private readonly random: Random;

  private scene: GameScene | null = null;
  private pet: PetScene | null = null;
  private cleaning: CleaningScene | null = null;
  private session: CleaningSession | null = null;
  private sessionCount = 0;
  private pendingDamp = false;
  private autoFinishTimer = 0;
  private tutorialStep = -1;
  private lastTime = 0;

  constructor(root: HTMLElement) {
    this.save = loadSave();
    this.random = createRandom(this.params.seed ?? (Date.now() >>> 0));
    this.sound = new Sound(this.save.soundEnabled);
    this.hud = new Hud(root, (action) => this.onAction(action));
    this.renderer = new PixelRenderer(this.hud.canvas);

    new ResizeObserver(() => this.resize()).observe(this.hud.stage);
    this.bindLifecycle();
  }

  start(): void {
    this.resize();
    this.goHome();
    if (!this.save.tutorialDone) this.showTutorial(0);
    this.renderer.renderer.setAnimationLoop((t) => this.frame(t));
  }

  // ---- 保存と表示 ----

  private commit(next: SaveData): void {
    this.save = next;
    writeSave(next);
    this.refreshHud();
  }

  private refreshHud(): void {
    const s = this.save;
    this.hud.setWallet(s.coins, s.dustBag, s.soundEnabled);
    if (this.mode === 'HOME') {
      const cap = caseCapacity(s.caseLevel);
      this.hud.setPetStatus(rankFor(s.growthXp).name, s.growthXp, cap, s.caseLevel, s.damp);
      this.hud.setActions(this.homeButtons());
    } else if ((this.mode === 'CLEANING' || this.mode === 'RESULT') && this.session) {
      const sess = this.session;
      const need = requiredCount(sess);
      this.hud.setCleaningStatus(sess.collected.size, sess.total, need);
      const left = Math.max(0, need - sess.collected.size);
      this.hud.setActions([
        { action: 'goHome', label: '帰宅', variant: 'secondary' },
        {
          action: 'finish',
          label: '掃除完了',
          sub: left > 0 ? `あと${left}個` : `報酬 ${REWARD_BASE + sess.collected.size * REWARD_PER_DUST}`,
          variant: 'primary',
          disabled: !canClaimReward(sess),
        },
      ]);
    }
  }

  private homeButtons(): ButtonSpec[] {
    const s = this.save;
    const feedable = feedableAmount(s);
    const cost = nextUpgradeCost(s);
    const buttons: ButtonSpec[] = [];
    if (s.damp) buttons.push({ action: 'dry', label: '乾燥させる', sub: '無料', variant: 'water' });
    buttons.push({ action: 'goClean', label: '掃除に行く', variant: 'accent' });
    buttons.push({
      action: 'feed',
      label: '餌をあげる',
      sub: s.dustBag === 0 ? 'バッグが空' : isCaseFull(s) ? 'ケース満杯' : `${feedable}個`,
      variant: 'primary',
      disabled: feedable === 0,
    });
    buttons.push({
      action: 'upgrade',
      label: 'ケース拡張',
      sub: cost === null ? '最大' : `${cost}コイン`,
      variant: 'secondary',
      disabled: !canUpgrade(s),
    });
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
    this.session = null;
    this.mode = 'HOME';
    this.hud.hint(null);
    this.hud.setEdgeArrows(0, 0);
    this.sound.stopHum();

    let becameDamp = false;
    if (this.pendingDamp && !this.save.damp) {
      this.pendingDamp = false;
      becameDamp = true;
      this.save = { ...this.save, damp: true };
      writeSave(this.save);
    }
    const s = this.save;
    this.pet = new PetScene({ xp: s.growthXp, level: s.caseLevel, damp: s.damp });
    this.setScene(this.pet);
    this.refreshHud();
    if (becameDamp) this.hud.toast('お留守番中に湿気でしっとり…「乾燥させる」でふかふかに！', 3200);
    else if (isCaseFull(s) && s.caseLevel < 3) this.hud.toast('ケースがいっぱい！拡張しよう');
  }

  private startCleaning(): void {
    this.pet = null;
    this.sessionCount++;
    const seed = (this.params.seed ?? Math.floor(this.random() * 1e9)) + this.sessionCount * 101;
    const sceneRandom = createRandom(seed);
    const count = randInt(sceneRandom, DUST_MIN, DUST_MAX);
    // 湿気は清掃セッション開始時に判定し、帰宅時に反映する（初回プレイは除外）
    this.pendingDamp = this.params.damp ?? (this.save.cleanedSessions > 0 && rollDamp(this.random));

    const scene = new CleaningScene({
      seed,
      dustCount: count,
      element: this.hud.canvas,
      onCollect: (id) => this.onCollect(id),
      onSuctionChange: (active) => (active ? this.sound.startHum() : this.sound.stopHum()),
    });
    this.session = createSession(this.sessionCount, scene.dustTotal);
    this.cleaning = scene;
    this.mode = 'CLEANING';
    this.autoFinishTimer = 0;
    this.setScene(scene);
    this.syncInput();
    this.hud.hint('指でなぞってホコリを吸い込もう\n端に寄せると部屋が動くよ');
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

  /** RESULT：報酬確定はここで一度だけ */
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
    const n = session.collected.size;
    const pct = Math.round((n / session.total) * 100);
    this.hud.showModal({
      title: 'おそうじ完了！',
      className: 'modal--result',
      body: `
        <dl class="result">
          <dt>回収したホコリ</dt><dd>${n} / ${session.total}（${pct}%）</dd>
          <dt>お小遣い</dt><dd class="result__coin">+${result.reward}</dd>
          <dt class="result__note" >内訳</dt><dd class="result__note">基本${REWARD_BASE} ＋ ${n}個×${REWARD_PER_DUST}</dd>
          <dt>バッグ</dt><dd>${this.save.dustBag}個</dd>
        </dl>`,
      buttons: [{ action: 'resultHome', label: '帰宅する', variant: 'primary' }],
    });
  }

  // ---- 入力 ----

  private onAction(action: string): void {
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
        if (this.hud.modalOpen) return;
        this.sound.play('tap');
        this.showTutorial(0);
        return;
      case 'tutorialNext':
        this.sound.play('tap');
        this.showTutorial(this.tutorialStep + 1);
        return;
      case 'modalClose':
        this.closeModal();
        return;
    }

    if (this.mode === 'HOME') this.onHomeAction(action);
    else if (this.mode === 'CLEANING') this.onCleaningAction(action);
    else if (this.mode === 'RESULT' && action === 'resultHome') {
      this.closeModal();
      this.goHome();
    }
  }

  private onHomeAction(action: string): void {
    if (this.hud.modalOpen) return;
    switch (action) {
      case 'goClean':
        this.sound.play('tap');
        this.startCleaning();
        break;
      case 'feed': {
        const before = rankFor(this.save.growthXp);
        const { save, fed } = feed(this.save);
        if (fed === 0) {
          this.sound.play('deny');
          return;
        }
        this.commit(save);
        this.pet?.setView({ xp: save.growthXp, level: save.caseLevel, damp: save.damp });
        this.pet?.playFeed(fed);
        this.sound.play('feed');
        window.setTimeout(() => this.sound.play('happy'), 1600);
        const after = rankFor(save.growthXp);
        if (after !== before) this.hud.toast(`${after.name}に成長した！`);
        else if (isCaseFull(save)) this.hud.toast(save.caseLevel < 3 ? 'ケースがいっぱい！拡張しよう' : 'ケースがいっぱい！（MVPの上限）');
        break;
      }
      case 'upgrade': {
        const { save, ok } = upgradeCase(this.save);
        if (!ok) {
          this.sound.play('deny');
          return;
        }
        this.commit(save);
        this.pet?.setView({ xp: save.growthXp, level: save.caseLevel, damp: save.damp });
        this.pet?.playUpgrade();
        this.sound.play('upgrade');
        this.hud.toast(`ケースが広くなった！容量 ${caseCapacity(save.caseLevel)}`);
        break;
      }
      case 'dry': {
        if (!this.save.damp) return;
        const save = dry(this.save);
        this.commit(save);
        this.pet?.setView({ xp: save.growthXp, level: save.caseLevel, damp: save.damp });
        this.pet?.playDry();
        this.sound.play('dry');
        break;
      }
    }
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
      this.hud.showModal({
        title: '帰宅する？',
        body: `まだ8割集めていないので、お小遣いはもらえないよ。<br>集めたホコリ（${session.collected.size}個）はバッグに入っているよ。`,
        buttons: [
          { action: 'modalClose', label: '続ける', variant: 'secondary' },
          { action: 'leaveNow', label: '帰宅する', variant: 'primary' },
        ],
      });
      this.syncInput();
    } else if (action === 'leaveNow') {
      this.closeModal();
      this.goHome();
    }
  }

  private showTutorial(step: number): void {
    if (step >= TUTORIAL.length) {
      this.tutorialStep = -1;
      this.closeModal();
      if (!this.save.tutorialDone) this.commit({ ...this.save, tutorialDone: true });
      return;
    }
    this.tutorialStep = step;
    const t = TUTORIAL[step];
    const dots = TUTORIAL.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('');
    this.hud.showModal({
      title: t.title,
      className: 'modal--tutorial',
      body: `<div class="tutorial-art tutorial-art--${step}"></div><p>${t.body}</p><div class="dots">${dots}</div>`,
      buttons: [{ action: 'tutorialNext', label: step === TUTORIAL.length - 1 ? 'はじめる' : '次へ', variant: 'primary' }],
    });
    this.syncInput();
  }

  private closeModal(): void {
    this.hud.closeModal();
    this.syncInput();
  }

  /** モーダル表示中は3D側の入力を止める */
  private syncInput(): void {
    this.cleaning?.setInputEnabled(this.mode === 'CLEANING' && !this.hud.modalOpen);
  }

  private bindLifecycle(): void {
    // iOSの音声解禁は最初のタッチで
    window.addEventListener('pointerdown', () => this.sound.unlock(), { capture: true });
    const pause = () => {
      this.cleaning?.cancelInput();
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
    if (this.scene) {
      this.scene.update(dt, time);
      this.renderer.render(this.scene.scene, this.scene.camera);
    }
  }
}
