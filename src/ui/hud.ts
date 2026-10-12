// HTML/CSSのHUD。WebGLには文字を描かず、表示と入力の窓口をここに集める。

export type ButtonSpec = {
  action: string;
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
};

/** ドット絵アイコンをSVGで生成（画像ファイル不要） */
function pixelIcon(rows: string[], colors: Record<string, string>): string {
  const h = rows.length;
  const w = rows[0].length;
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = colors[row[x]];
      if (c) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
    }
  });
  return `<svg class="px-icon" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

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
  help: pixelIcon(
    ['..aaaa..', '.aa..aa.', '.....aa.', '....aa..', '...aa...', '...aa...', '........', '...aa...'],
    { a: '#5a4636' },
  ),
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function buttonHtml(b: ButtonSpec): string {
  const sub = b.sub ? `<span class="btn__sub">${escapeHtml(b.sub)}</span>` : '';
  return `<button type="button" class="btn btn--${b.variant ?? 'secondary'}" data-action="${b.action}" ${
    b.disabled ? 'disabled' : ''
  }><span class="btn__label">${escapeHtml(b.label)}</span>${sub}</button>`;
}

export class Hud {
  readonly canvas: HTMLCanvasElement;
  readonly stage: HTMLElement;
  private readonly el: Record<string, HTMLElement> = {};
  private toastTimer = 0;
  private lastActions = '';

  constructor(root: HTMLElement, onAction: (action: string) => void) {
    root.innerHTML = `
      <div class="app">
        <header class="hud-top">
          <div class="hud-row">
            <div class="pill" data-ref="coinPill" aria-label="コイン">${ICONS.coin}<span data-ref="coins">0</span></div>
            <div class="pill" data-ref="bagPill" aria-label="バッグのホコリ">${ICONS.bag}<span data-ref="bag">0</span></div>
            <div class="spacer"></div>
            <button type="button" class="icon-btn" data-action="sound" data-ref="sound" aria-label="音のON/OFF"></button>
            <button type="button" class="icon-btn" data-action="help" aria-label="遊び方">${ICONS.help}</button>
          </div>
          <div class="status" data-ref="status"></div>
        </header>
        <main class="stage" data-ref="stage">
          <canvas class="game-canvas" data-ref="canvas"></canvas>
          <div class="edge edge--left" data-ref="edgeLeft" hidden></div>
          <div class="edge edge--right" data-ref="edgeRight" hidden></div>
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
      onAction(target.dataset.action as string);
    });
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

  setCleaningStatus(collected: number, total: number, required: number): void {
    const pct = total > 0 ? (collected / total) * 100 : 0;
    const goal = total > 0 ? (required / total) * 100 : 80;
    const done = collected >= required;
    this.el.status.innerHTML = `
      <div class="status__line">
        <span class="status__title">おそうじ中</span>
        <span class="status__value">${collected} / ${total}</span>
      </div>
      <div class="bar ${done ? 'bar--done' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${collected}">
        <div class="bar__fill" style="width:${pct}%"></div>
        <div class="bar__goal" style="left:${goal}%"></div>
      </div>`;
  }

  setPetStatus(rank: string, xp: number, capacity: number, level: number, damp: boolean): void {
    const pct = Math.min(100, (xp / capacity) * 100);
    const full = xp >= capacity;
    this.el.status.innerHTML = `
      <div class="status__line">
        <span class="status__title">ほこりちゃん <small>${escapeHtml(rank)}</small>${damp ? '<em class="tag tag--damp">しっとり</em>' : ''}</span>
        <span class="status__value">ケースLv${level}</span>
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
    modal.innerHTML = `
      <div class="modal ${spec.className ?? ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(spec.title)}">
        <h2 class="modal__title">${escapeHtml(spec.title)}</h2>
        <div class="modal__body">${spec.body}</div>
        <div class="modal__actions">${spec.buttons.map(buttonHtml).join('')}</div>
      </div>`;
    modal.hidden = false;
  }

  closeModal(): void {
    this.el.modal.hidden = true;
    this.el.modal.innerHTML = '';
  }

  get modalOpen(): boolean {
    return !this.el.modal.hidden;
  }
}
