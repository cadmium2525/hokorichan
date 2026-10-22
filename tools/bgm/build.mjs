#!/usr/bin/env node
/*
 * BGM を書き出す。作曲エンジンは「かなでる」（https://github.com/cadmium2525/mp4mp3 の daw/）を使う。
 *
 *   node tools/bgm/build.mjs <mp4mp3 の daw フォルダ> [曲 id ...] [--json]
 *
 * ループ曲は 3 周ぶん演奏して 2 周目を切り出す（1 周目の残響が頭に乗るので、つなぎ目が自然になる）。
 * ノイズや揺れは周ごとに少しちがうので、2 周目の頭に 3 周目の頭を XFADE 秒かけて重ね、
 * 終わり → 頭 のつなぎ目でぷつっと鳴らないようにする。
 * mp3 は頭に数十ミリ秒の無音が入ることがあるので、ループの前後に PAD 秒ぶん（輪のつづき）をつけ、
 * ループの位置（loopStart / loopEnd）を public/bgm/bgm.json に書く。
 * 出力：public/bgm/<id>.mp3、public/bgm/bgm.json（--json なら曲の JSON も tools/bgm/out/ に）
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SONGS } from './songs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const [engineDir, ...only] = args.filter((a) => !a.startsWith('--'));
if (!engineDir) {
  console.error('使い方: node tools/bgm/build.mjs <mp4mp3 の daw フォルダ> [曲 id ...] [--json]');
  process.exit(1);
}
const eng = (p) => import(pathToFileURL(resolve(engineDir, p)).href);
const { renderSong } = await eng('js/engine/mix.js');
const { encodeWav } = await eng('js/engine/wav.js');
const { validateSong } = await eng('js/engine/validate.js');
const { analyzeAudio } = await eng('js/engine/analyze.js');

const OUT = join(root, 'public/bgm');
const PAD = 0.25; // 秒
const XFADE = 0.15; // 秒
const LOUDNESS = -18; // LUFS（全曲そろえる）
const BITRATE = '112k';
mkdirSync(OUT, { recursive: true });
if (wantJson) mkdirSync(join(here, 'out'), { recursive: true });

const manifestPath = join(OUT, 'bgm.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { tracks: [] };

/** ループ曲：クリップを cycles 周ぶんに並べる */
function repeatSong(def, cycles) {
  const beats = def.loopBars * 4;
  const tracks = def.tracks.map((t) => ({
    ...t,
    clips: t.clips.flatMap((c) => Array.from({ length: cycles }, (_, k) => ({ ...c, at: (c.at ?? 0) + k * beats }))),
  }));
  return { ...def, tracks, bars: def.loopBars * cycles, tail: 0 };
}

for (const entry of SONGS) {
  if (only.length && !only.includes(entry.id)) continue;
  const def = entry.make();
  const loop = !!def.loopBars;
  const base = {
    sig: [4, 4],
    sends: { reverb: { size: 1.3, decay: 2.4, damp: 6500, predelay: 0.02 }, delay: { time: '1/8d', feedback: 0.3, tone: 4000 } },
    master: { loudness: LOUDNESS, ceiling: -1.5 },
  };
  const song = { ...base, ...(loop ? repeatSong(def, 3) : def) };
  delete song.loopBars;
  delete song.fade;
  const chk = validateSong(song);
  for (const w of chk.warnings) console.error(`  △ ${entry.id}: ${w}`);
  if (chk.errors.length) {
    for (const e of chk.errors) console.error(`  ✗ ${entry.id}: ${e}`);
    process.exit(1);
  }
  if (wantJson) writeFileSync(join(here, 'out', `${entry.id}.json`), JSON.stringify(song));

  const t0 = Date.now();
  const { L, R, sr } = renderSong(song, {});
  const spb = 60 / song.bpm;
  let cl, cr, loopStart = null, loopEnd = null;
  if (loop) {
    const n = Math.round(def.loopBars * 4 * spb * sr);
    const pad = Math.round(PAD * sr);
    const xf = Math.round(XFADE * sr);
    const ring = (src) => {
      const one = src.slice(n, 2 * n);
      for (let i = 0; i < xf; i++) {
        const k = (i + 0.5) / xf;
        one[i] = src[n + i] * Math.sin((k * Math.PI) / 2) + src[2 * n + i] * Math.cos((k * Math.PI) / 2);
      }
      const out = new Float32Array(n + 2 * pad);
      out.set(one.subarray(n - pad), 0);
      out.set(one, pad);
      out.set(one.subarray(0, pad), pad + n);
      return out;
    };
    cl = ring(L);
    cr = ring(R);
    loopStart = pad / sr;
    loopEnd = (pad + n) / sr;
  } else {
    cl = L;
    cr = R;
  }
  if (!loop) {
    // 最後は 2 秒かけて消す
    const f = Math.round(2 * sr);
    for (let i = 0; i < f; i++) { const g = 1 - i / f; cl[cl.length - f + i] *= g; cr[cr.length - f + i] *= g; }
  }
  const tmp = join(OUT, `${entry.id}.tmp.wav`);
  writeFileSync(tmp, encodeWav(cl, cr, sr, 16));
  const mp3 = join(OUT, `${entry.id}.mp3`);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', BITRATE, '-ar', '44100', mp3], { stdio: 'inherit' });
  unlinkSync(tmp);
  if (r.status !== 0) throw new Error('ffmpeg での変換に失敗しました');

  const an = analyzeAudio(cl, cr, sr, { bpm: song.bpm });
  const kb = Math.round(readFileSync(mp3).length / 1024);
  const item = {
    id: entry.id, title: entry.title, scene: entry.scene, bpm: song.bpm, key: def.key,
    duration: +(cl.length / sr).toFixed(3), loop, loopStart: loopStart && +loopStart.toFixed(5), loopEnd: loopEnd && +loopEnd.toFixed(5), kb,
  };
  const i = manifest.tracks.findIndex((x) => x.id === entry.id);
  if (i >= 0) manifest.tracks[i] = item; else manifest.tracks.push(item);
  const lufs = an.integrated ?? an.lufs ?? an.loudness?.integrated;
  console.log(`${entry.id.padEnd(9)} ${item.duration.toFixed(1)}s  ${kb}KB  ${typeof lufs === 'number' ? lufs.toFixed(1) + ' LUFS' : ''}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
manifest.tracks.sort((x, y) => SONGS.findIndex((s) => s.id === x.id) - SONGS.findIndex((s) => s.id === y.id));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
console.log(`書き出し: ${manifestPath}`);
