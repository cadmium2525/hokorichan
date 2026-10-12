import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPRITE_ROWS } from '../src/ui/sprites.ts';
import { CHARACTER_IDS, CHAR_H, CHAR_W, FRAMES, drawCharacter, facingFromScreen, type Facing, type Pose } from '../src/render/pixelCharacters.ts';

test('アイコンの各行の長さがそろっている', () => {
  for (const group of Object.values(SPRITE_ROWS)) {
    for (const [id, [rows]] of Object.entries(group)) {
      for (const r of rows) assert.equal(r.length, rows[0].length, `${id}: "${r}"`);
    }
  }
});

const POSES: Pose[] = ['idle', 'walk', 'run', 'clean', 'wipe', 'surprise', 'joy', 'talk', 'give'];
const FACINGS: Facing[] = ['down', 'up', 'left', 'right'];

function opaque(data: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
  return n;
}

test('すべての人物・ポーズ・向き・コマが描ける', () => {
  for (const id of CHARACTER_IDS) {
    for (const pose of POSES) {
      for (const facing of FACINGS) {
        for (let f = 0; f < FRAMES; f++) {
          const fr = drawCharacter({ id, pose, facing, frame: f });
          assert.equal(fr.data.length, CHAR_W * CHAR_H * 4);
          const n = opaque(fr.data);
          assert.ok(n > 200 && n < CHAR_W * CHAR_H * 0.75, `${id}/${pose}/${facing}/${f}: ${n}`);
          // アルファは 0 か 255（にじませない）
          for (let i = 3; i < fr.data.length; i += 4) assert.ok(fr.data[i] === 0 || fr.data[i] === 255);
        }
      }
    }
  }
});

test('右向きは左向きの鏡像', () => {
  const l = drawCharacter({ id: 'girl', pose: 'walk', facing: 'left', frame: 1 });
  const r = drawCharacter({ id: 'girl', pose: 'walk', facing: 'right', frame: 1 });
  for (let y = 0; y < CHAR_H; y++) {
    for (let x = 0; x < CHAR_W; x++) {
      const a = (y * CHAR_W + x) * 4 + 3;
      const b = (y * CHAR_W + (CHAR_W - 1 - x)) * 4 + 3;
      assert.equal(l.data[a], r.data[b]);
    }
  }
});

test('歩きのコマはそれぞれ違う絵になる', () => {
  const frames = [0, 1, 2].map((f) => Buffer.from(drawCharacter({ id: 'boy', pose: 'walk', facing: 'down', frame: f }).data).toString('base64'));
  assert.equal(new Set(frames).size, 3);
});

test('掃除ポーズは道具の先が床（下端付近）にあり、向きで左右が入れかわる', () => {
  for (const tool of ['hand', 'rag', 'mop', 'vacuum', 'broom'] as const) {
    const l = drawCharacter({ id: 'boy', pose: 'clean', facing: 'left', frame: 0, tool });
    const r = drawCharacter({ id: 'boy', pose: 'clean', facing: 'right', frame: 0, tool });
    assert.ok(l.tip && r.tip);
    assert.ok(l.tip.y >= CHAR_H - 3, tool);
    assert.ok(l.tip.x < CHAR_W / 2 && r.tip.x > CHAR_W / 2, tool);
  }
});

test('画面上の移動方向から向きを決める', () => {
  assert.equal(facingFromScreen(-1, 0.2, 'down'), 'left');
  assert.equal(facingFromScreen(1, 0, 'down'), 'right');
  assert.equal(facingFromScreen(0.1, 1, 'left'), 'down');
  assert.equal(facingFromScreen(0, -1, 'left'), 'up');
  assert.equal(facingFromScreen(0, 0, 'left'), 'left');
});
