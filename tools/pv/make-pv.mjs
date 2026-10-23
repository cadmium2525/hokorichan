#!/usr/bin/env node
/*
 * X 用のPV（縦 9:16・約30秒）の「つなぐ」プロジェクト JSON を作る。
 *
 *   node tools/pv/make-pv.mjs <素材フォルダ> [拡張子 mp4|webm] > pv.json
 *
 * 素材フォルダには、ゲームを録画した動画（titleDesk / clean / feed / town / sky / world / space / galaxy / bubbles）と、
 * public/bgm の mp3（home / sky）を置く。長さは ffprobe で測る。
 * 書き出しは mp4mp3 の editor/tools/render.mjs：
 *   node editor/tools/render.mjs pv.json 素材フォルダ pv.mp4
 *
 * 動画の頭はフェードインしない（最初のクリップは transition なし、BGM も fadeIn 0）。
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const dir = process.argv[2];
// ヘッドレス Chromium は H.264 を読めないことがあるので、書き出し用の素材は webm（VP9）にもできる
const ext = process.argv[3] ?? 'mp4';
if (!dir) {
  console.error('使い方: node tools/pv/make-pv.mjs <素材フォルダ>');
  process.exit(1);
}
const len = (name) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(dir, `${name}.${ext}`)], { encoding: 'utf8' }));

// [素材, 使う範囲 in, out, 速さ]。画面の動きがよいところだけ使う
const CUTS = [
  ['titleDesk', 0.0, 2.6, 1],
  ['clean', 0.8, 5.0, 1],
  ['feed', 0.6, 4.6, 1],
  ['town', 0.8, 4.2, 1],
  ['sky', 0.8, 3.8, 1],
  ['world', 0.6, 3.6, 1],
  ['space', 0.8, 3.8, 1],
  ['galaxy', 0.6, 3.8, 1],
  ['bubbles', 0.8, 3.6, 1],
  ['titleDesk', 0.0, 2.7, 1],
];

const media = { bgm1: { name: 'home.mp3' }, bgm2: { name: 'sky.mp3' } };
const clips = [];
const starts = [];
let t = 0;
CUTS.forEach(([name, a, b, speed], i) => {
  const id = `c_${name}`;
  media[id] = { name: `${name}.${ext}` };
  const out = Math.min(b, len(name));
  clips.push({
    media: id, in: a, out, speed, volume: 0, fit: 'cover',
    // 頭のクリップは切り替えなし（フェードインしない）。あとはスッと切りかえる
    transition: i === 0 ? { type: 'none', duration: 0 } : { type: 'none', duration: 0 },
  });
  starts.push(t);
  t += (out - a) / speed;
});
const total = t;
const at = (i) => starts[i];
const end = (i) => starts[i] + (CUTS[i][2] - CUTS[i][1]) / CUTS[i][3];

const T = (text, i, o = {}) => ({
  text, start: at(i) + (o.in ?? 0.15), end: end(i) - (o.out ?? 0.1),
  style: 'pop', font: 'rounded', size: 0.07, y: 0.5, anim: 'pop', ...o.t,
});

const texts = [
  // 0 タイトル：ロゴは画面にあるので、ひとことだけ
  T('ちいさな綿ぼこりを\n育てよう', 0, { in: 0, t: { y: 0.68, size: 0.06, anim: 'pop' } }),
  T('① おそうじ', 1, { t: { y: 0.29, size: 0.072 } }),
  T('② ごはん', 2, { t: { y: 0.29, size: 0.072 } }),
  T('③ おおきく！', 2, { in: 1.9, t: { y: 0.29, size: 0.072 } }),
  T('町づくり', 3, { t: { y: 0.29, size: 0.072 } }),
  T('空へ', 4, { t: { y: 0.29, size: 0.09 } }),
  T('世界へ', 5, { t: { y: 0.29, size: 0.09 } }),
  T('宇宙へ', 6, { t: { y: 0.29, size: 0.09 } }),
  T('銀河へ', 7, { t: { y: 0.29, size: 0.09 } }),
  T('そのさきは……？', 8, { t: { y: 0.29, size: 0.075 } }),
  // 最後：遊べる場所
  { text: 'スマホですぐ遊べる\n完全無料', start: at(9) + 0.2, end: total, style: 'pop', font: 'rounded', size: 0.06, y: 0.67, anim: 'pop' },
  { text: 'cadmium2525.github.io/hokorichan', start: at(9) + 0.7, end: total, style: 'subtitle', font: 'gothic', size: 0.04, y: 0.76, anim: 'fade' },
];

const SPLIT = at(5); // 世界へ のあたまで曲をかえる
const project = {
  version: 1,
  name: 'ほこりちゃん PV',
  width: 1080, height: 1920, fps: 30,
  background: '#fff6ea',
  fadeOut: 0.8, // 終わりだけ静かに消す。頭はフェードインなし
  media,
  clips,
  overlays: [],
  motions: [],
  texts,
  shapes: [],
  effects: [
    { type: 'sparkle', start: at(8) + 0.6, end: end(8), intensity: 0.5 },
    { type: 'sparkle', start: at(9) + 0.3, end: total, intensity: 0.5 },
  ],
  audios: [
    // in: 0.25 は mp3 の頭の余白（ループの輪のつづき）をとばして、拍の頭から鳴らす
    { media: 'bgm1', start: 0, in: 0.25, out: SPLIT + 1.2 + 0.25, volume: 1.35, fadeIn: 0, fadeOut: 1.2 },
    { media: 'bgm2', start: SPLIT, in: 0.25, volume: 1.35, fadeIn: 1.2, fadeOut: 1.2, loop: true },
  ],
};
process.stdout.write(JSON.stringify(project, null, 1) + '\n');
console.error(`長さ ${total.toFixed(1)} 秒 / ${CUTS.length} カット`);
