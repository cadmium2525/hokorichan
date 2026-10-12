// モーダルの中身（主人公選択・お話・おそうじマップ・ショップ・あそぶ・お小遣い）をHTML文字列で組み立てる。
// 表示だけを担当し、ボタンは data-action / data-arg で Game に伝える。

import {
  ACCESSORIES,
  AREA_NAMES,
  HABITATS,
  SHAPE_LIMITS,
  SHAPE_PRESETS,
  SPOTS,
  TOOL_ORDER,
  TOOLS,
  type Area,
  type Hero,
  type SpotId,
} from '../game/catalog.ts';
import { bestTool, nextHabitat, spotStatus, type SaveData } from '../game/state.ts';
import { buttonHtml, escapeHtml } from './hud.ts';
import {
  accessoryIcon,
  friendMomSprite,
  friendSprite,
  heroSprite,
  motherSprite,
  shopkeeperSprite,
  spotIcon,
  toolIcon,
} from './sprites.ts';

export type Speaker = 'hero' | 'mother' | 'friend' | 'friendMom' | 'shopkeeper' | 'narration';

function speakerOf(speaker: Speaker, hero: Hero, className: string): { name: string; sprite: string } {
  switch (speaker) {
    case 'hero':
      return { name: hero === 'boy' ? 'ぼく' : 'わたし', sprite: heroSprite(hero, className) };
    case 'mother':
      return { name: 'お母さん', sprite: motherSprite(className) };
    case 'friend':
      return { name: '友だち', sprite: friendSprite(className) };
    case 'friendMom':
      return { name: '友だちのお母さん', sprite: friendMomSprite(className) };
    case 'shopkeeper':
      return { name: '店員さん', sprite: shopkeeperSprite(className) };
    case 'narration':
      return { name: '', sprite: '' };
  }
}

// ---- 主人公選択 ----

export function heroSelectBody(): string {
  const card = (hero: Hero, label: string) => `
    <button type="button" class="hero-card" data-action="pickHero" data-arg="${hero}">
      ${heroSprite(hero, 'sprite sprite--lg')}
      <span>${label}</span>
    </button>`;
  return `<p>主人公をえらんでね</p><div class="hero-pick">${card('boy', '男の子')}${card('girl', '女の子')}</div>`;
}

// ---- お話（吹き出し） ----

export function storyBody(speaker: Speaker, hero: Hero, text: string): string {
  const { name, sprite } = speakerOf(speaker, hero, 'sprite sprite--lg');
  return `
    <div class="story ${speaker === 'narration' ? 'story--narration' : ''}">
      ${sprite ? `<div class="story__who">${sprite}<span>${name}</span></div>` : ''}
      <div class="bubble">${text}</div>
    </div>`;
}

// ---- おそうじマップ ----

function minutesText(min: number): string {
  if (min >= 60) return `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ''}`;
  return `${Math.max(1, min)}分`;
}

export function mapBody(save: SaveData, area: Area, now: number, speed: number): string {
  const tool = bestTool(save);
  const cards = SPOTS.filter((def) => def.area === area).map((def) => {
    const st = spotStatus(save, def, now, speed);
    let note: string;
    let cls = '';
    if (st.locked) {
      const need = TOOL_ORDER.map((id) => TOOLS[id]).find((t) => t.tier >= def.minTier);
      note = `${need?.name ?? '道具'}が必要`;
      cls = 'spot--locked';
    } else if (!st.ready) {
      note = `まだきれい（あと${minutesText(st.minutesToReady)}）`;
      cls = 'spot--clean';
    } else if (st.fullness >= 1) {
      note = `ホコリ ${st.dust}個・満タン！`;
    } else {
      note = `ホコリ ${st.dust}個・満タンまで${minutesText(st.minutesToFull)}`;
    }
    const disabled = st.locked || !st.ready;
    return `
      <button type="button" class="spot ${cls}" data-action="goSpot" data-arg="${def.id}" ${disabled ? 'disabled' : ''}>
        ${spotIcon(def.id)}
        <span class="spot__text">
          <span class="spot__name">${escapeHtml(def.name)}</span>
          <span class="spot__desc">${escapeHtml(note)}</span>
          <span class="meter"><span style="width:${Math.round(st.fullness * 100)}%"></span></span>
        </span>
      </button>`;
  }).join('');
  return `
    <div class="map-head">${heroSprite(save.hero ?? 'boy', 'sprite')}<span>${escapeHtml(AREA_NAMES[area])}</span><span>${toolIcon(tool.id)}${escapeHtml(tool.name)}</span></div>
    <div class="spots">${cards}</div>
    <p class="note">ホコリは時間がたつと少しずつ積もるよ</p>`;
}

// ---- ショップ ----

export type ShopTab = 'tools' | 'home' | 'accessories';

export function shopBody(save: SaveData, tab: ShopTab): string {
  const tabs: Array<[ShopTab, string]> = [['tools', '掃除用具'], ['home', 'すみか'], ['accessories', 'アクセサリー']];
  const tabHtml = tabs
    .map(([id, label]) => `<button type="button" class="tab ${id === tab ? 'tab--on' : ''}" data-action="shopTab" data-arg="${id}">${label}</button>`)
    .join('');
  let items = '';
  const row = (icon: string, name: string, desc: string, button: string) =>
    `<div class="item">${icon}<span class="item__text"><b>${escapeHtml(name)}</b><small>${escapeHtml(desc)}</small></span>${button}</div>`;
  const buy = (action: string, arg: string, price: number) =>
    buttonHtml({ action, arg, label: `${price}`, sub: 'コイン', variant: 'primary', disabled: save.coins < price });
  const owned = (text: string) => `<span class="owned">${text}</span>`;

  if (tab === 'tools') {
    const using = bestTool(save).id;
    items = TOOL_ORDER.filter((id) => id !== 'hand')
      .map((id) => {
        const t = TOOLS[id];
        const has = save.tools.includes(id);
        return row(toolIcon(id), t.name, t.desc, has ? owned(id === using ? '使用中' : '持っている') : buy('buyTool', id, t.price));
      })
      .join('');
  } else if (tab === 'home') {
    const next = nextHabitat(save);
    const now = HABITATS[save.habitat];
    items = `<p class="note">いまのすみか：${escapeHtml(now.name)}（容量 ${now.capacity}）</p>`;
    items += next
      ? row(
          '<span class="case-icon"></span>',
          HABITATS[next.level].name,
          `容量 ${HABITATS[next.level].capacity} まで大きく育つ`,
          buy('buyHome', String(next.level), next.price),
        )
      : '<p class="note">いちばん大きなケースです</p>';
  } else {
    items = ACCESSORIES.map((a) => {
      const has = save.accessories.includes(a.id);
      return row(accessoryIcon(a.id), a.name, has ? '「あそぶ」で付けかえ' : '買うとすぐ付けるよ', has ? owned('持っている') : buy('buyAccessory', a.id, a.price));
    }).join('');
  }
  const greet = `<div class="story story--shop"><div class="story__who">${shopkeeperSprite('sprite')}</div><div class="bubble">いらっしゃいませ！</div></div>`;
  return `${greet}<div class="tabs">${tabHtml}</div><div class="items">${items}</div>`;
}

// ---- あそぶ ----

export function playBody(save: SaveData): string {
  const acc = [
    `<button type="button" class="chip ${save.equippedAccessory === null ? 'chip--on' : ''}" data-action="wear" data-arg="none">なし</button>`,
    ...ACCESSORIES.filter((a) => save.accessories.includes(a.id)).map(
      (a) =>
        `<button type="button" class="chip ${save.equippedAccessory === a.id ? 'chip--on' : ''}" data-action="wear" data-arg="${a.id}" aria-label="${a.name}">${accessoryIcon(a.id)}</button>`,
    ),
  ].join('');
  const presets = SHAPE_PRESETS.map(
    (p, i) => `<button type="button" class="chip chip--text" data-action="shapePreset" data-arg="${i}">${p.name}</button>`,
  ).join('');
  const slider = (name: 'width' | 'height' | 'fluff', label: string) => {
    const { min, max } = SHAPE_LIMITS[name];
    return `<label class="slider"><span>${label}</span><input type="range" name="${name}" min="${min}" max="${max}" step="0.01" value="${save.shape[name]}"></label>`;
  };
  return `
    <p class="note">ほこりちゃんを指でなでてみよう</p>
    <div class="row-title">アクセサリー</div><div class="chips">${acc}</div>
    <div class="row-title">かたち</div><div class="chips">${presets}</div>
    ${slider('width', 'よこ')}${slider('height', 'たて')}${slider('fluff', 'もふもふ')}`;
}

// ---- お小遣い（掃除の結果） ----

export function resultBody(opts: {
  hero: Hero;
  spot: SpotId;
  collected: number;
  total: number;
  reward: number;
  base: number;
  perDust: number;
  bag: number;
}): string {
  const spot = SPOTS.find((s) => s.id === opts.spot);
  // 友だちの家では友だちのお母さんがお小遣いをくれる
  const giver = speakerOf(spot?.area === 'friend' ? 'friendMom' : 'mother', opts.hero, 'sprite sprite--xl');
  const place = spot?.area === 'friend' ? spot.name.replace(/^友だちの(家の)?/, '') : (spot?.name ?? '');
  const pct = Math.round((opts.collected / opts.total) * 100);
  return `
    <div class="allowance">
      ${heroSprite(opts.hero, 'sprite sprite--lg')}
      <div class="allowance__coin">+${opts.reward}</div>
      ${giver.sprite}
    </div>
    <div class="bubble bubble--mother">${giver.name}「${escapeHtml(place)}、きれいになったね！ はい、お小遣い」</div>
    <dl class="result">
      <dt>集めたホコリ</dt><dd>${opts.collected} / ${opts.total}（${pct}%）</dd>
      <dt class="result__note">内訳</dt><dd class="result__note">基本${opts.base} ＋ ${opts.collected}個×${opts.perDust}</dd>
      <dt>バッグ</dt><dd>${opts.bag}個</dd>
    </dl>`;
}
