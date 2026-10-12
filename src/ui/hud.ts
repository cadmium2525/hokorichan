// HTML/CSSのHUD。WebGLには文字を描かず、表示と入力の窓口をここに集める。

import { pixelArt } from './sprites.ts';

export type ButtonSpec = {
  action: string;
  /** data-arg として渡す追加情報（購入する商品IDなど） */
  arg?: string;
  label: string;
  sub?: string;
  variant?: 'primary' | 'secondary' | 'accent' | 'water';
  disabled?: boolean;
};

export type ModalSpec = {
  title: string;
  body: string;
  buttons: ButtonSpec[];
  className?: string;
  /** 画面下に出すパネル。背景を暗くせず、上の3Dを触れるままにする */
  sheet?: boolean;
};

const pixelIcon = (rows: string[], colors: Record<string, string>) => pixelArt(rows, colors);

const ICONS = {
  coin: pixelIcon(
    ['..aaaa..', '.abbbba.', 'abbccbba', 'abcbbcba', 'abcbbcba', 'abbccbba', '.abbbba.', '..aaaa..'],
    { a: '#c98a2b', b: '#f7c948', c: '#fff1b0' },
  ),
  bag: pixelIcon(
    ['...aa...', '..a..a..', '.aaaaaa.', 'abbbbbba', 'abcbbcba', 'abbbbbba', 'abbbbbba', '.aaaaaa.'],
    { a: '#7d6aa8', b: '#cbb8ea', c: '#9a8fb0' },
  ),
  soundOn: pixelIcon(
    ['....a...', '...aa.b.', 'aaaaa..b', 'aaaaa.b.', 'aaaaa.b.', 'aaaaa..b', '...aa.b.', '....a...'],
    { a: '#5a4636', b: '#e98aa6' },
  ),
  soundOff: pixelIcon(
    ['....a...', '...aa...', 'aaaaab.b', 'aaaaa.b.', 'aaaaa.b.', 'aaaaab.b', '...aa...', '....a...'],
    { a: '#5a4636', b: '#b0a0a0' },
  ),
  dex: pixelIcon(
    ['aaaaaaa.', 'abbbbba.', 'abccbba.', 'abbbbba.', 'abccbba.', 'abbbbba.', 'aaaaaaa.', '.dddddd.'],
    { a: '#5a4636', b: '#f6d55c', c: '#a0644a', d: '#b0a0a0' },
  ),
  help: pixelIcon(
    ['..aaaa..', '.aa..aa.', '.....aa.', '....aa..', '...aa...', '...aa...', '........', '...aa...'],
    { a: '#5a4636' },
  ),
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function buttonHtml(b: ButtonSpec): string {
  const sub = b.sub ? `<span class="btn__sub">${escapeHtml(b.sub)}</span>` : '';
  const arg = b.arg ? ` data-arg="${escapeHtml(b.arg)}"` : '';
  return `<button type="button" class="btn btn--${b.variant ?? 'secondary'}" data-action="${b.action}"${arg} ${
    b.disabled ? 'disabled' : ''
  }><span class="btn__label">${escapeHtml(b.label)}</span>${sub}</button>`;
}

export class Hud {
  readonly canvas: HTMLCanvasElement;
  readonly stage: HTMLElement;
  private readonly el: Record<string, HTMLElement> = {};
  private toastTimer = 0;
  private lastActions = '';
  private modalBody = '';

  constructor(
    root: HTMLElement,
    onAction: (action: string, arg?: string) => void,
    onInput?: (name: string, value: number, done: boolean) => void,
  ) {
    root.innerHTML = `
      <div class="app">
        <header class="hud-top">
          <div class="hud-row">
            <div class="pill" data-ref="coinPill" aria-label="コイン">${ICONS.coin}<span data-ref="coins">0</span></div>
            <div class="pill" data-ref="bagPill" aria-label="バッグのホコリ">${ICONS.bag}<span data-ref="bag">0</span></div>
            <div class="spacer"></div>
            <button type="button" class="icon-btn" data-action="sound" data-ref="sound" aria-label="音のON/OFF"></button>
            <button type="button" class="icon-btn" data-action="dex" aria-label="図鑑">${ICONS.dex}</button>
            <button type="button" class="icon-btn" data-action="help" aria-label="遊び方">${ICONS.help}</button>
          </div>
          <div class="status" data-ref="status"></div>
        </header>
        <main class="stage" data-ref="stage">
          <canvas class="game-canvas" data-ref="canvas"></canvas>
          <div class="edge edge--left" data-ref="edgeLeft" hidden></div>
          <div class="edge edge--right" data-ref="edgeRight" hidden></div>
          <div class="labels" data-ref="labels"></div>
          <div class="hint" data-ref="hint" hidden></div>
          <div class="toast" data-ref="toast" hidden></div>
        </main>
        <footer class="hud-bottom"><div class="actions" data-ref="actions"></div></footer>
        <div class="modal-layer" data-ref="modal" hidden></div>
      </div>`;
    root.querySelectorAll<HTMLElement>('[data-ref]').forEach((node) => {
      this.el[node.dataset.ref as string] = node;
    });
    this.canvas = this.el.canvas as HTMLCanvasElement;
    this.stage = this.el.stage;

    root.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if (!target || target.disabled) return;
      onAction(target.dataset.action as string, target.dataset.arg);
    });
    // スライダー：動かしている間は input、指を離したら change
    const slider = (done: boolean) => (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.type === 'range' && input.name) onInput?.(input.name, Number(input.value), done);
    };
    root.addEventListener('input', slider(false));
    root.addEventListener('change', slider(true));
  }

  setWallet(coins: number, bag: number, soundEnabled: boolean): void {
    this.el.coins.textContent = String(coins);
    this.el.bag.textContent = String(bag);
    this.el.sound.innerHTML = soundEnabled ? ICONS.soundOn : ICONS.soundOff;
    this.el.sound.setAttribute('aria-pressed', String(soundEnabled));
  }

  bump(which: 'coins' | 'bag'): void {
    const pill = which === 'coins' ? this.el.coinPill : this.el.bagPill;
    pill.classList.remove('pill--bump');
    void pill.offsetWidth; // アニメーションを再始動
    pill.classList.add('pill--bump');
  }

  setCleaningStatus(title: string, collected: number, total: number, required: number): void {
    const pct = total > 0 ? Math.min(100, (collected / total) * 100) : 0;
    const goal = total > 0 ? (required / total) * 100 : 80;
    const done = collected >= required;
    this.el.status.innerHTML = `
      <div class="status__line">
        <span class="status__title">${escapeHtml(title)}</span>
        <span class="status__value">${collected} / ${total}</span>
      </div>
      <div class="bar ${done ? 'bar--done' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${collected}">
        <div class="bar__fill" style="width:${pct}%"></div>
        <div class="bar__goal" style="left:${goal}%"></div>
      </div>`;
  }

  setPetStatus(rank: string, xp: number, capacity: number, home: string, damp: boolean): void {
    const pct = Math.min(100, (xp / capacity) * 100);
    const full = xp >= capacity;
    this.el.status.innerHTML = `
      <div class="status__line">
        <span class="status__title">ほこりちゃん <small>${escapeHtml(rank)}</small>${damp ? '<em class="tag tag--damp">しっとり</em>' : ''}</span>
        <span class="status__value">${escapeHtml(home)}</span>
      </div>
      <div class="bar bar--xp ${full ? 'bar--full' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${capacity}" aria-valuenow="${xp}">
        <div class="bar__fill" style="width:${pct}%"></div>
        <span class="bar__text">成長 ${xp} / ${capacity}</span>
      </div>`;
  }

  setActions(buttons: ButtonSpec[]): void {
    const html = buttons.map(buttonHtml).join('');
    if (html === this.lastActions) return; // 毎フレーム呼んでもDOMを作り直さない
    this.lastActions = html;
    this.el.actions.innerHTML = html;
    this.el.actions.dataset.count = String(buttons.length);
  }

  /** 画面外に残っているホコリの方向を示す（変化があった時だけDOMを更新） */
  setEdgeArrows(left: number, right: number): void {
    const set = (el: HTMLElement, n: number, arrow: string) => {
      const text = n > 0 ? (arrow === '◀' ? `◀ ${n}` : `${n} ▶`) : '';
      if (el.textContent === text && el.hidden === (n === 0)) return;
      el.textContent = text;
      el.hidden = n === 0;
    };
    set(this.el.edgeLeft, left, '◀');
    set(this.el.edgeRight, right, '▶');
  }

  /** 梅雨のあいだは画面に雨を降らせる */
  setRain(on: boolean): void {
    this.stage.classList.toggle('stage--rain', on);
  }

  /** 3Dの建物の上に出す名札。位置は stage に対する割合（0〜1） */
  setLabels(items: Array<{ id: string; text: string; x: number; y: number; action?: string }>): void {
    const layer = this.el.labels;
    const seen = new Set<string>();
    for (const it of items) {
      seen.add(it.id);
      let el = layer.querySelector<HTMLElement>(`[data-label="${it.id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'label';
        el.dataset.label = it.id;
        layer.appendChild(el);
      }
      if (el.textContent !== it.text) el.textContent = it.text;
      // 画面外の建物の札はタップするとそこへ歩いていく
      if (it.action) {
        el.dataset.action = it.action;
        el.dataset.arg = it.id;
        el.classList.add('label--button');
      } else {
        delete el.dataset.action;
        el.classList.remove('label--button');
      }
      el.style.left = `${(it.x * 100).toFixed(2)}%`;
      el.style.top = `${(it.y * 100).toFixed(2)}%`;
    }
    layer.querySelectorAll<HTMLElement>('[data-label]').forEach((el) => {
      if (!seen.has(el.dataset.label as string)) el.remove();
    });
    this.separateLabels();
  }

  /** 名札どうしが重なったら、下にある札を上の札の下へずらす */
  private separateLabels(): void {
    const els = [...this.el.labels.querySelectorAll<HTMLElement>('[data-label]')];
    const boxes = els.map((el) => {
      el.style.marginTop = '0px';
      return { el, r: el.getBoundingClientRect() };
    });
    boxes.sort((a, b) => a.r.top - b.r.top);
    const placed: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    for (const { el, r } of boxes) {
      let top = r.top;
      for (const p of placed) {
        if (r.left < p.right + 2 && r.right > p.left - 2 && top < p.bottom + 2 && top + r.height > p.top - 2) top = p.bottom + 2;
      }
      if (top !== r.top) el.style.marginTop = `${(top - r.top).toFixed(0)}px`;
      placed.push({ left: r.left, right: r.right, top, bottom: top + r.height });
    }
  }

  setTownStatus(text: string): void {
    this.el.status.innerHTML = `<div class="status__line"><span class="status__title">まち</span></div><div class="town-note">${escapeHtml(text)}</div>`;
  }

  hint(text: string | null): void {
    const el = this.el.hint;
    if (text === null) {
      el.hidden = true;
      return;
    }
    el.textContent = text;
    el.hidden = false;
  }

  toast(text: string, ms = 2200): void {
    const el = this.el.toast;
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('toast--show');
    void el.offsetWidth;
    el.classList.add('toast--show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      el.hidden = true;
    }, ms);
  }

  showModal(spec: ModalSpec): void {
    const modal = this.el.modal;
    modal.classList.toggle('modal-layer--sheet', spec.sheet === true);
    this.modalBody = spec.body;
    modal.innerHTML = `
      <div class="modal ${spec.className ?? ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(spec.title)}">
        <h2 class="modal__title">${escapeHtml(spec.title)}</h2>
        <div class="modal__body">${spec.body}</div>
        ${spec.buttons.length ? `<div class="modal__actions">${spec.buttons.map(buttonHtml).join('')}</div>` : ''}
      </div>`;
    modal.hidden = false;
  }

  closeModal(): void {
    this.el.modal.hidden = true;
    this.el.modal.innerHTML = '';
  }

  /** 開いているモーダルの本文だけを書き換える（スクロール位置を保つ） */
  updateModalBody(body: string): void {
    const el = this.el.modal.querySelector<HTMLElement>('.modal__body');
    if (!el || body === this.modalBody) return;
    this.modalBody = body;
    el.innerHTML = body;
  }

  /** 下のパネルが3D画面（stage）の高さのどれだけを覆っているか */
  sheetCoverage(): number {
    if (this.el.modal.hidden || !this.el.modal.classList.contains('modal-layer--sheet')) return 0;
    const sheet = this.el.modal.querySelector<HTMLElement>('.modal');
    if (!sheet) return 0;
    const stage = this.stage.getBoundingClientRect();
    const top = sheet.getBoundingClientRect().top;
    return stage.height > 0 ? Math.min(1, Math.max(0, (stage.bottom - top) / stage.height)) : 0;
  }

  get modalOpen(): boolean {
    return !this.el.modal.hidden;
  }

  /** 画面全体を覆うモーダル（シートではない）が開いているか */
  get blockingModalOpen(): boolean {
    return this.modalOpen && !this.el.modal.classList.contains('modal-layer--sheet');
  }
}
