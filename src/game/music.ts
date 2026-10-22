// どの場面でどの BGM を流すか（ルールだけ。鳴らすのは audio.ts）
import type { Mode } from './Game.ts';

export type BgmId = 'home' | 'night' | 'town' | 'cleaning' | 'contest' | 'sky' | 'world' | 'space' | 'galaxy' | 'bubbles' | 'finale';

export interface MusicContext {
  mode: Mode;
  /** 大そうじ大会の最中 */
  contest: boolean;
  /** 夜（ほこりちゃんがねる時間）のおうち */
  sleepy: boolean;
  /** おしまいの場面〜夢からさめるか選ぶまで */
  finale: boolean;
}

/** 流す曲。null は「いまの曲のまま」（結果画面は、遊んでいた曲を続ける） */
export function bgmFor(c: MusicContext): BgmId | null {
  if (c.finale) return 'finale';
  switch (c.mode) {
    case 'BOOT':
      return 'home';
    case 'HOME':
      return c.sleepy ? 'night' : 'home';
    case 'TOWN':
      return 'town';
    case 'CLEANING':
      return c.contest ? 'contest' : 'cleaning';
    case 'SKY':
      return 'sky';
    case 'WORLD':
      return 'world';
    case 'SPACE':
      return 'space';
    case 'GALAXY':
      return 'galaxy';
    case 'BUBBLES':
      return 'bubbles';
    case 'RESULT':
      return null;
  }
}
