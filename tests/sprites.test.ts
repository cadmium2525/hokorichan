import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPRITE_ROWS } from '../src/ui/sprites.ts';

test('ドット絵の各行の長さがそろっている', () => {
  const { BOY, GIRL, MOTHER, ...icons } = SPRITE_ROWS;
  for (const [name, rows] of Object.entries({ BOY, GIRL, MOTHER })) {
    for (const r of rows) assert.equal(r.length, 16, `${name}: "${r}"`);
  }
  for (const group of Object.values(icons)) {
    for (const [id, [rows]] of Object.entries(group)) {
      for (const r of rows) assert.equal(r.length, rows[0].length, `${id}: "${r}"`);
    }
  }
});
