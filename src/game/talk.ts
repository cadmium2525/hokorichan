// まちの人との会話。章や出来事に合わせてセリフが変わり、遊び方のヒントもまぜる。
// 町の人は、ほこりちゃんがどれだけ大きくなっても真顔で普通に話す。

import { CONTEST, FUR_IDS, RAINY, type PersonId } from './catalog.ts';
import { areaUnlocked, chapter, hasEvent, rainyActive, type SaveData } from './state.ts';

/** まちに立っている人（お母さん・機構の人・管制官さんはまちにいない） */
export type TownPerson = Exclude<PersonId, 'mother' | 'agent' | 'controller'>;

/** その人がいま話しそうなセリフの候補 */
export function talkLines(id: TownPerson, save: SaveData): string[] {
  const ch = chapter(save);
  const rain = rainyActive(save);
  const lines: string[] = [];
  const add = (cond: boolean, ...texts: string[]) => {
    if (cond) lines.push(...texts);
  };
  switch (id) {
    case 'shopkeeper':
      add(ch === 1, 'いらっしゃいませ！ 掃除機があると、まわりのホコリも吸い寄せられますよ。', 'ケースが大きくなると、ほこりちゃんももっと大きく育ちますよ。');
      add(ch >= 2, '章が進むと、新しいアクセサリーが入荷するんです。のぞいていってくださいね。');
      add(ch === 3, '空を飛ぶなら、飛行ゴーグルがおすすめですよ。');
      add(ch === 4, '地球儀ぼうし、地球規模のかたにも人気なんですよ。');
      add(ch >= 5, '宇宙ヘルメット、入荷しました。月のとなりは寒いそうですから。');
      add(rain, '雨の日は売れ行きがいまひとつで……乾燥パウダー大作戦、がんばってくださいね。');
      add(true, 'ほこりちゃんの写真、「あそぶ」から撮れるんですって。うちにも一枚ほしいわ。');
      break;
    case 'friend':
      add(ch === 1, 'ほこりちゃん元気？ うちの猫も会いたがってるよ。', '猫の毛って、ほこりちゃんにあげたらもふもふになるのかな？');
      add(ch === 2, '大掃除大会、見に行くね！ 風でホコリが流されるから、追いかけるのがコツらしいよ。');
      add(ch === 3, '空を飛んだって本当？ いいなあ、今度乗せてよ。');
      add(ch === 4, '地球を包むって、どんな気分？ ……ふかふか？');
      add(ch >= 5, 'ゆうべ、ほこりちゃんが木星のまわりを回ってるのが見えたよ！ 手、ふった？', '星くずって、食べたらきらきらになるの？');
      add(true, `毛並み図鑑、いくつ集まった？ 全部で${FUR_IDS.length}種類もあるんだって！`);
      break;
    case 'friendMom':
      add(true, '玄関の砂ぼこり、またたまってきちゃった。お願いね。', 'うちの子と仲良くしてくれてありがとう。');
      break;
    case 'florist':
      add(true, '花粉をたくさん食べると、くしゃみで一気に吸い込めるようになるのよ。', '花粉の新しい品種、順調に育ってるわ。ありがとう！');
      add(rain, '雨で花はよろこんでるけど、お店はしっとり……。');
      add(hasEvent(save, 'contestWon'), '町の清掃係さん、今日もよろしくね。');
      break;
    case 'baker':
      add(true, '粉ぼこりを食べると、湿気に強くなるらしいよ。うちのパンと一緒だね。', '焼きたてのにおい、ほこりちゃんにも分かるのかな？');
      add(rain, '雨の日は粉がしけって大変だよ。乾燥パウダー、粉ぼこりならうちで集まるからね。');
      break;
    case 'grandma':
      add(true, '猫の毛は、もふもふの毛並みになるのよ。吸い寄せる範囲が広がるわ。', 'ランクが上がるときに食べていたもので、毛並みが決まるのよ。毛並み図鑑、見てごらん。');
      add(hasEvent(save, 'contestNotice') && !hasEvent(save, 'contestWon'), `大会のいちばん強いチームは${Math.max(...CONTEST.rivals.map((r) => r.score))}個よ。流される前に追いかけなさいね。`);
      add(hasEvent(save, 'contestWon'), '町内会長として鼻が高いわ。清掃係さん、ありがとう。');
      break;
    case 'stationMaster':
      add(true, '汽車が走るたびに、ホームにすすが積もるんです。時刻表どおりに。', 'すすを食べると、毛並みがいぶし銀になるそうですね。渋い。');
      add(rain, `乾燥パウダーには、すすも${RAINY.need.soot ?? 0}個いるそうです。ホームにたくさんありますよ。`);
      add(save.habitat === 6, '丘行きの電車、いつでもどうぞ。相棒さんによろしく。');
      add(save.habitat >= 7, '丘の発射場行き、ロケット乗りかえの電車です。時刻表どおりに。');
      break;
    case 'teacher':
      add(true, 'チョークの粉を食べると、空を速く飛べるようになるらしいわよ。', '宿題はちゃんとやってる？ ……ほこりちゃんのお世話も宿題みたいなものね。');
      add(areaUnlocked(save, 'school') && ch === 4, '地球規模の自由研究、先生も楽しみにしてるわ。');
      add(ch >= 5, '内側の軌道ほど速く回るのよ。理科の教科書にも書いてあるわ。', '宇宙のちりを食べると、岩にぶつかってもへっちゃらになるらしいわよ。');
      break;
  }
  return lines;
}

/** ランダムに1つ選ぶ（同じセリフが続きにくいよう、前回と違うものを選ぶ） */
export function pickTalk(id: TownPerson, save: SaveData, random: () => number, last?: string): string {
  const lines = talkLines(id, save);
  const choices = lines.length > 1 && last ? lines.filter((l) => l !== last) : lines;
  return choices[Math.floor(random() * choices.length)] ?? '……（にっこりしている）';
}

