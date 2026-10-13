import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESETS } from '../src/dev/presets.ts';
import { crc32, decodeSave, encodeSave } from '../src/game/transfer.ts';

test('引き継ぎコードにして読み直すと、同じデータになる', async () => {
  for (const p of PRESETS) {
    const s = p.make('girl');
    const code = await encodeSave(s);
    assert.match(code, /^HK1z\./);
    const back = await decodeSave(code, Date.now());
    assert.ok(back.ok, p.id);
    if (back.ok) assert.deepEqual(back.save, s, p.id);
  }
});

test('コードは短め（いちばん進んだデータでも数千文字）で、改行がまじっても読める', async () => {
  const s = PRESETS.find((p) => p.id === 'afterFinale')!.make('boy');
  const code = await encodeSave(s);
  assert.ok(code.length < 4000, String(code.length));
  const wrapped = code.replace(/(.{40})/g, '$1\n ');
  assert.equal((await decodeSave(wrapped)).ok, true);
});

test('こわれたコード・ちがうコードは読み込まない', async () => {
  const code = await encodeSave(PRESETS[1].make('boy'));
  const broken = code.slice(0, 20) + (code[20] === 'A' ? 'B' : 'A') + code.slice(21);
  assert.equal((await decodeSave(broken)).ok, false);
  assert.equal((await decodeSave(code.slice(0, -10))).ok, false);
  assert.equal((await decodeSave('hello')).ok, false);
  assert.equal((await decodeSave('')).ok, false);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('新しい版で作ったコードは、白紙にせず読み込まない', async () => {
  const s = { ...PRESETS[1].make('boy'), version: 99 } as unknown as Parameters<typeof encodeSave>[0];
  const r = await decodeSave(await encodeSave(s));
  assert.equal(r.ok, false);
});
