// CDP スクリーンキャストでゲームを録画 → ffmpeg で一定フレームレートの mp4 にする
const { chromium } = require(process.env.PW);
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const W = 390, H = 693, DPR = 1080 / 390;
exports.W = W; exports.H = H;
exports.open = async (save, url, tweaks = []) => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('hokorichan.installHint', '1'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  if (save) {
    await p.goto('http://localhost:4173/dev.html'); await p.click(`[data-preset=${save}]`);
    for (const t of tweaks) await p.click(`[data-tweak=${t}]`);
  }
  await p.goto(url || 'http://localhost:4173/?hour=12&seed=3');
  return { browser, p };
};
exports.record = async (p, name, fn) => {
  const dir = path.join(__dirname, 'frames_' + name);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await p.context().newCDPSession(p);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const i = frames.length;
    fs.writeFileSync(path.join(dir, `${i}.jpg`), Buffer.from(f.data, 'base64'));
    frames.push(f.metadata.timestamp);
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  await fn();
  const tEnd = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  // concat 用の長さ
  let list = '';
  for (let i = 0; i < frames.length; i++) {
    const d = i + 1 < frames.length ? frames[i + 1] - frames[i] : Math.max(0.05, tEnd - frames[i]);
    list += `file '${path.join(dir, i + '.jpg')}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`;
  }
  list += `file '${path.join(dir, (frames.length - 1) + '.jpg')}'\n`;
  fs.writeFileSync(path.join(dir, 'list.txt'), list);
  const out = path.join(__dirname, name + '.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', 'fps=30,scale=1080:1920:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-preset', 'fast', out], { stdio: 'inherit' });
  const dur = tEnd - frames[0];
  console.log(name, frames.length, 'frames', dur.toFixed(2) + 's', (frames.length / dur).toFixed(1) + 'fps', r.status === 0 ? 'ok' : 'FAIL');
  fs.rmSync(dir, { recursive: true, force: true });
};
