const { open, record, W, H } = require('./rec.cjs');
const only = process.argv.slice(2);
const wait = (p, ms) => p.waitForTimeout(ms);
const storyAll = async (p) => { for (let i = 0; i < 14 && (await p.$('.modal--story')); i++) { await p.click('.modal [data-action]'); await wait(p, 350); } };
const box = async (p) => p.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const zig = async (p, b, secs, rows = 7) => {
  const t0 = Date.now(); let k = 0;
  await p.mouse.move(b.x + b.w * 0.15, b.y + b.h * 0.2); await p.mouse.down();
  while (Date.now() - t0 < secs * 1000) {
    const y = b.y + b.h * (0.2 + 0.6 * ((k % rows) / (rows - 1)));
    await p.mouse.move(b.x + b.w * (k % 2 ? 0.15 : 0.85), y, { steps: 18 });
    k++;
  }
  await p.mouse.up();
};
const scenes = {
  async title() {
    const { browser, p } = await open('ch4', 'http://localhost:4173/?hour=11&seed=3');
    await wait(p, 1200);
    await record(p, 'title', async () => { await wait(p, 3000); });
    await browser.close();
  },
  async titleDesk() {
    const { browser, p } = await open('desk', 'http://localhost:4173/?hour=11&seed=3');
    await wait(p, 1200);
    await record(p, 'titleDesk', async () => { await wait(p, 3200); });
    await browser.close();
  },
  async titleFinal() {
    const { browser, p } = await open('final', 'http://localhost:4173/?hour=11&seed=3');
    await wait(p, 1200);
    await record(p, 'titleFinal', async () => { await wait(p, 4200); });
    await browser.close();
  },
  async clean() {
    const { browser, p } = await open('caseM', 'http://localhost:4173/?hour=12&seed=3&damp=0');
    await wait(p, 1200);
    await p.tap('.title-screen'); await wait(p, 700);
    await p.click('[data-action=openMap]'); await wait(p, 300);
    await p.click('[data-action=goSpot][data-arg=window]'); await wait(p, 1200);
    const b = await box(p);
    await record(p, 'clean', async () => { await wait(p, 500); await zig(p, b, 6); });
    await browser.close();
  },
  async feed() {
    const { browser, p } = await open('ch5', 'http://localhost:4173/?hour=12&seed=3', ['bag']);
    await wait(p, 600);
    await p.tap('.title-screen'); await wait(p, 700);
    await storyAll(p);
    await wait(p, 600);
    await record(p, 'feed', async () => {
      await wait(p, 600);
      await p.click('[data-action=openFeed]'); await wait(p, 900);
      await p.click('[data-action=feedType][data-arg=cotton]'); await wait(p, 250);
      await p.click('.modal [data-action=closeModal]'); await wait(p, 3800);
    });
    await browser.close();
  },
  async town() {
    const { browser, p } = await open('ch4', 'http://localhost:4173/?hour=12&seed=3');
    await wait(p, 600);
    await p.tap('.title-screen'); await wait(p, 700);
    await storyAll(p);
    await p.click('[data-action=goOut]'); await wait(p, 900);
    await storyAll(p);
    const b = await box(p);
    await record(p, 'town', async () => {
      await wait(p, 800);
      await p.mouse.move(b.x + b.w * 0.5, b.y + b.h * 0.7); await p.mouse.down();
      await p.mouse.move(b.x + b.w * 0.5, b.y + b.h * 0.3, { steps: 40 }); await wait(p, 900);
      await p.mouse.move(b.x + b.w * 0.8, b.y + b.h * 0.3, { steps: 30 }); await p.mouse.up();
      await wait(p, 1500);
    });
    await browser.close();
  },
  async sky() {
    const { browser, p } = await open('ch4', 'http://localhost:4173/?hour=17&seed=3');
    await wait(p, 600);
    await p.tap('.title-screen'); await wait(p, 700);
    await storyAll(p);
    await p.click('[data-action=goSky]'); await wait(p, 1200);
    const b = await box(p);
    await record(p, 'sky', async () => { await wait(p, 600); await zig(p, b, 5, 5); });
    await browser.close();
  },
  async world() {
    const { browser, p } = await open('ch4', 'http://localhost:4173/?hour=12&seed=3');
    await wait(p, 600);
    await p.tap('.title-screen'); await wait(p, 700);
    await storyAll(p);
    await p.click('[data-action=goWorld]'); await wait(p, 1500);
    const b = await box(p);
    await record(p, 'world', async () => {
      await wait(p, 500);
      await p.mouse.move(b.x + b.w * 0.25, b.y + b.h * 0.5); await p.mouse.down();
      await p.mouse.move(b.x + b.w * 0.75, b.y + b.h * 0.5, { steps: 50 }); await wait(p, 300);
      await p.mouse.move(b.x + b.w * 0.4, b.y + b.h * 0.4, { steps: 40 }); await p.mouse.up();
      await wait(p, 1200);
    });
    await browser.close();
  },
  async space() {
    const { browser, p } = await open('ch5', 'http://localhost:4173/?hour=12&seed=3');
    await wait(p, 600);
    await p.tap('.title-screen'); await wait(p, 700);
    await storyAll(p);
    await p.click('[data-action=goSpace]'); await wait(p, 1500);
    const b = await box(p);
    await record(p, 'space', async () => {
      await wait(p, 600);
      await p.mouse.move(b.x + b.w * 0.92, b.y + b.h * 0.6); await p.mouse.down(); await wait(p, 4500); await p.mouse.up();
    });
    await browser.close();
  },
  async galaxy() {
    const { browser, p } = await open('galaxyDue', 'http://localhost:4173/?hour=12&seed=4');
    await wait(p, 600);
    await p.tap('.title-screen'); await wait(p, 700);
    await storyAll(p);
    await wait(p, 800);
    await p.click('[data-action=goGalaxy]'); await wait(p, 1200);
    const b = await box(p);
    await record(p, 'galaxy', async () => {
      await wait(p, 500);
      const cx = b.x + b.w / 2, cy = b.y + b.h * 0.5;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        await p.mouse.move(cx + Math.cos(a) * b.w * 0.48, cy + Math.sin(a) * b.w * 0.32);
        await p.mouse.down();
        await p.mouse.move(cx + Math.cos(a) * 20, cy + Math.sin(a) * 14, { steps: 14 });
        await p.mouse.up(); await wait(p, 250);
      }
    });
    await browser.close();
  },
  async bubbles() {
    const { browser, p } = await open('final', 'http://localhost:4173/?hour=12&seed=2');
    await wait(p, 600);
    await p.tap('.title-screen'); await wait(p, 700);
    await storyAll(p);
    await p.click('[data-action=goBubbles]'); await wait(p, 900);
    const b = await box(p);
    await record(p, 'bubbles', async () => {
      await wait(p, 800);
      await zig(p, b, 4, 6);
    });
    await browser.close();
  },
  async big() {
    const { browser, p } = await open('final', 'http://localhost:4173/?hour=12&seed=2');
    await wait(p, 600);
    await p.tap('.title-screen'); await wait(p, 700);
    await storyAll(p);
    await wait(p, 600);
    await record(p, 'big', async () => { await wait(p, 3500); });
    await browser.close();
  },
};
(async () => { for (const k of Object.keys(scenes)) if (!only.length || only.includes(k)) { try { await scenes[k](); } catch (e) { console.log(k, 'ERROR', e.message.split('\n')[0]); } } })();
