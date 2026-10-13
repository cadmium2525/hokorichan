// 現実の時刻とゲームの中の時間をつなぐ（朝・昼・夕方・夜、ほこりちゃんのおやすみ）。

export type DayPhase = 'morning' | 'day' | 'evening' | 'night';

/** 時（0〜23、小数可）から時間帯を決める */
export function dayPhase(hour: number): DayPhase {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 9) return 'morning';
  if (h >= 9 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'evening';
  return 'night';
}

/** ほこりちゃんがねむる時間（夜10時〜朝6時） */
export function isSleepTime(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h >= 22 || h < 6;
}

export const PHASE_NAMES: Record<DayPhase, string> = { morning: '朝', day: '昼', evening: '夕方', night: '夜' };
