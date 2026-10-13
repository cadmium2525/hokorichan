// 開発用ページ：保存データを場面ごとに用意したり、書きかえたりしてからゲームを開く。
// ゲームと同じ localStorage を使う（ゲームのタブは閉じてから使うこと：開いているとゲーム側の保存で上書きされる）。

import { DUST_TYPES, DUSTS, HABITATS, type Habitat, type Hero } from '../game/catalog.ts';
import { loadSave, sanitize, SAVE_KEY, writeSave } from '../game/save.ts';
import { chapter, rankFor, type EventId, type SaveData } from '../game/state.ts';
import { PRESETS, TWEAKS } from './presets.ts';
import './dev.css';

const root = document.getElementById('dev') as HTMLElement;
let hero: Hero = 'boy';
let message = '';

const ALL_EVENTS: EventId[] = [
  'town', 'friend', 'board', 'landMeeting', 'container', 'street', 'together',
  'contestNotice', 'contestWon', 'warehouseLetter', 'warehouse', 'sky', 'cityTown', 'rainy', 'rainyDone',
  'worldLetter', 'world', 'earthWrap', 'shrink',
];

function save(next: SaveData, note: string): void {
  writeSave(sanitize(next));
  message = note;
  render();
}

function esc(t: string): string {
  return t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function render(): void {
  const s = loadSave();
  const groups = [...new Set(PRESETS.map((p) => p.group))];
  const presets = groups
    .map(
      (g) => `<h3>${esc(g)}</h3><div class="grid">${PRESETS.filter((p) => p.group === g)
        .map((p) => `<button data-preset="${p.id}"><b>${esc(p.name)}</b><small>${esc(p.note)}</small></button>`)
        .join('')}</div>`,
    )
    .join('');
  const tweaks = TWEAKS.map((t) => `<button data-tweak="${t.id}">${esc(t.name)}</button>`).join('');
  const habitats = (Object.keys(HABITATS) as unknown as Habitat[])
    .map((h) => `<option value="${h}" ${Number(h) === s.habitat ? 'selected' : ''}>${h}: ${esc(HABITATS[h].name)}</option>`)
    .join('');
  const bag = DUST_TYPES.map((t) => `<label>${esc(DUSTS[t].name)}<input type="number" min="0" data-bag="${t}" value="${s.bag[t]}"></label>`).join('');
  const events = ALL_EVENTS.map((e) => `<label class="ev"><input type="checkbox" data-event="${e}" ${s.events.includes(e) ? 'checked' : ''}>${e}</label>`).join('');
  root.innerHTML = `
    <header>
      <h1>ほこりちゃん 開発用</h1>
      <p class="warn">ゲームのタブを閉じてから使ってね（開いたままだとゲーム側の保存で上書きされます）。</p>
      <div class="row">
        <a class="go" href="./">ゲームを開く</a>
        <a class="go" href="./?fast=1">ゲームを開く（時間60倍）</a>
        <a class="go" href="./?fast=1&damp=0">60倍・湿気なし</a>
      </div>
      ${message ? `<p class="msg">${esc(message)}</p>` : ''}
    </header>

    <section>
      <h2>いまの状態</h2>
      <p class="summary">${chapter(s)}章 ・ ${esc(rankFor(s.growthXp).name)} ・ 成長 ${s.growthXp} ・ ${esc(HABITATS[s.habitat].name)} ・ コイン ${s.coins} ・ 評判★${s.rep}${s.damp ? ' ・ しっとり' : ''}</p>
    </section>

    <section>
      <h2>場面へジャンプ</h2>
      <div class="row">主人公：
        <label><input type="radio" name="hero" value="boy" ${hero === 'boy' ? 'checked' : ''}>男の子</label>
        <label><input type="radio" name="hero" value="girl" ${hero === 'girl' ? 'checked' : ''}>女の子</label>
      </div>
      ${presets}
    </section>

    <section>
      <h2>すぐ足す</h2>
      <div class="grid grid--small">${tweaks}</div>
    </section>

    <section>
      <h2>数値を書きかえる</h2>
      <div class="fields">
        <label>コイン<input type="number" min="0" id="f-coins" value="${s.coins}"></label>
        <label>成長<input type="number" min="0" id="f-xp" value="${s.growthXp}"></label>
        <label>評判<input type="number" min="0" id="f-rep" value="${s.rep}"></label>
        <label>すみか<select id="f-habitat">${habitats}</select></label>
        <label><input type="checkbox" id="f-damp" ${s.damp ? 'checked' : ''}>しっとり</label>
      </div>
      <h3>バッグ</h3>
      <div class="fields">${bag}</div>
      <h3>出来事（チェック＝見た）</h3>
      <div class="events">${events}</div>
      <button class="primary" id="apply">この内容で保存</button>
    </section>

    <section>
      <h2>保存データ（JSON）</h2>
      <textarea id="json" spellcheck="false">${esc(JSON.stringify(s, null, 2))}</textarea>
      <div class="row">
        <button id="json-apply">JSONを保存</button>
        <button id="export">ファイルに書き出す</button>
        <label class="file">ファイルから読み込む<input type="file" id="import" accept="application/json"></label>
        <button id="wipe" class="danger">保存を消す</button>
      </div>
    </section>`;
}

root.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const btn = t.closest('button');
  if (!btn) return;
  const preset = PRESETS.find((p) => p.id === btn.dataset.preset);
  if (preset) return save(preset.make(hero), `「${preset.name}」にしました。ゲームを開いてね`);
  const tweak = TWEAKS.find((w) => w.id === btn.dataset.tweak);
  if (tweak) return save(tweak.apply(loadSave()), `${tweak.name} しました`);
  if (btn.id === 'apply') {
    const s = loadSave();
    const num = (id: string) => Math.max(0, Math.floor(Number((document.getElementById(id) as HTMLInputElement).value) || 0));
    const bag = { ...s.bag };
    root.querySelectorAll<HTMLInputElement>('[data-bag]').forEach((el) => {
      bag[el.dataset.bag as keyof typeof bag] = Math.max(0, Math.floor(Number(el.value) || 0));
    });
    const events = [...root.querySelectorAll<HTMLInputElement>('[data-event]')].filter((el) => el.checked).map((el) => el.dataset.event as EventId);
    return save(
      {
        ...s,
        coins: num('f-coins'),
        growthXp: num('f-xp'),
        rep: num('f-rep'),
        habitat: Number((document.getElementById('f-habitat') as HTMLSelectElement).value) as Habitat,
        damp: (document.getElementById('f-damp') as HTMLInputElement).checked,
        bag,
        events,
      },
      '保存しました',
    );
  }
  if (btn.id === 'json-apply') {
    try {
      return save(JSON.parse((document.getElementById('json') as HTMLTextAreaElement).value), 'JSONを保存しました（おかしな値は直しました）');
    } catch {
      message = 'JSONが読めませんでした';
      return render();
    }
  }
  if (btn.id === 'export') {
    const blob = new Blob([JSON.stringify(loadSave(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hokorichan-save-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  if (btn.id === 'wipe' && confirm('保存データを消します。よろしいですか？')) {
    localStorage.removeItem(SAVE_KEY);
    message = '保存を消しました';
    render();
  }
});

root.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.name === 'hero') hero = t.value === 'girl' ? 'girl' : 'boy';
  if (t.id === 'import' && t.files?.[0]) {
    t.files[0].text().then((text) => {
      try {
        save(JSON.parse(text), 'ファイルから読み込みました');
      } catch {
        message = 'ファイルが読めませんでした';
        render();
      }
    });
  }
});

render();
