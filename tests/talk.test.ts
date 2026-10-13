import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESETS } from '../src/dev/presets.ts';
import { PERSON_IDS } from '../src/game/catalog.ts';
import { pickTalk, talkLines, type TownPerson } from '../src/game/talk.ts';
import { createRandom } from '../src/game/rng.ts';

const TOWN_PEOPLE = PERSON_IDS.filter((p): p is TownPerson => p !== 'mother' && p !== 'agent');

test('まちの人は、どの場面でも話すことがある', () => {
  for (const p of PRESETS) {
    const s = p.make('boy');
    for (const id of TOWN_PEOPLE) {
      const lines = talkLines(id, s);
      assert.ok(lines.length > 0, `${p.id}/${id}`);
      for (const l of lines) assert.ok(l.length > 0 && !l.includes('undefined') && !l.includes('NaN'), `${p.id}/${id}: ${l}`);
    }
  }
});

test('話しかけるたびに、前回と違うセリフを選ぶ（候補が2つ以上あるとき）', () => {
  const s = PRESETS[1].make('girl');
  const random = createRandom(7);
  let last: string | undefined;
  for (let i = 0; i < 30; i++) {
    const t = pickTalk('grandma', s, random, last);
    assert.notEqual(t, last);
    last = t;
  }
});
