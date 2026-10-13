import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESETS, TWEAKS } from '../src/dev/presets.ts';
import { sanitize } from '../src/game/save.ts';
import { clusterDue, galaxyLetterDue, solarDue, spaceCenter, spaceLetterDue, worldLetterDue, earthWrapDue, cityTownDue, contestDue, landMeetingDue, rainyActive, rainyDue, warehouseDue, canDeliverRainy, chapter } from '../src/game/state.ts';

const get = (id: string) => {
  const p = PRESETS.find((x) => x.id === id);
  assert.ok(p, id);
  return p.make('girl');
};

test('開発用の場面はどれも保存データとして正しい（読み直しても変わらない）', () => {
  for (const p of PRESETS) {
    const s = p.make('boy');
    assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s)), Date.now()), s, p.id);
  }
});

test('山場の直前の場面は、その出来事が起きる状態になっている', () => {
  assert.equal(landMeetingDue(get('landMeeting')), true);
  assert.equal(chapter(get('ch2')), 2);
  assert.equal(contestDue(get('contestDue')), true);
  assert.equal(warehouseDue(get('warehouseDue')), true);
  assert.equal(cityTownDue(get('ch3')), true);
  assert.equal(rainyDue(get('rainyDue')), true);
  assert.equal(rainyActive(get('rainyReady')), true);
  assert.equal(canDeliverRainy(get('rainyReady')), true);
  assert.equal(rainyActive(get('ch3done')), false);
  assert.equal(worldLetterDue(get('worldDue')), true);
  assert.equal(chapter(get('ch4')), 4);
  assert.equal(earthWrapDue(get('earthWrapDue')), true);
  assert.equal(spaceLetterDue(get('spaceDue')), true);
  assert.equal(chapter(get('ch5')), 5);
  assert.equal(spaceCenter(get('ch5')), 'jupiter');
  assert.equal(spaceCenter(get('sunCenter')), 'sun');
  assert.equal(solarDue(get('solarDue')), true);
  assert.equal(galaxyLetterDue(get('galaxyDue')), true);
  assert.equal(chapter(get('ch6')), 6);
  assert.equal(clusterDue(get('clusterDue')), true);
});

test('すぐ足す操作は保存データを壊さない', () => {
  const s0 = get('caseM');
  for (const t of TWEAKS) {
    const s = t.apply(s0);
    assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s)), Date.now()), s, t.id);
  }
});
