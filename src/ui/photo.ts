// ほこりちゃんの写真：3D画面から切り抜いてカードにし、端末の共有・X・保存でシェアする。
// サーバーは使わない（画像は端末の中だけで作る）。

export type PhotoInfo = {
  /** 写真の上に書く名前（例：ほこりちゃん） */
  title: string;
  rank: string;
  xp: number;
  home: string;
};

export type Photo = { blob: Blob; url: string; text: string };

const CARD_W = 720;
const CARD_H = 880;
const IMAGE = 640;

/**
 * source（WebGLのcanvas）の、中心(cx,cy)・半径r（0〜1の割合）の円が入る正方形を切り抜いてカードにする。
 * ドットはぼかさずに拡大する。
 */
export async function makePhotoCard(source: HTMLCanvasElement, focus: { x: number; y: number; r: number }, info: PhotoInfo): Promise<Photo | null> {
  const card = document.createElement('canvas');
  card.width = CARD_W;
  card.height = CARD_H;
  const ctx = card.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  // 背景（クリームのカード）
  ctx.fillStyle = '#f8e3cc';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = '#fffaf2';
  roundRect(ctx, 24, 24, CARD_W - 48, CARD_H - 48, 28);
  ctx.fill();

  // 写真の部分：ほこりちゃんを中心に正方形で切り抜く
  const sw = source.width;
  const sh = source.height;
  let side = Math.min(sw, sh, Math.max(focus.r * 2 * 1.5 * sh, sh * 0.35));
  side = Math.max(1, Math.floor(side));
  let sx = Math.round(focus.x * sw - side / 2);
  let sy = Math.round(focus.y * sh - side / 2);
  sx = Math.max(0, Math.min(sw - side, sx));
  sy = Math.max(0, Math.min(sh - side, sy));
  const ix = (CARD_W - IMAGE) / 2;
  const iy = 40;
  ctx.save();
  roundRect(ctx, ix, iy, IMAGE, IMAGE, 20);
  ctx.clip();
  ctx.drawImage(source, sx, sy, side, side, ix, iy, IMAGE, IMAGE);
  ctx.restore();
  ctx.strokeStyle = '#e8b48a';
  ctx.lineWidth = 6;
  roundRect(ctx, ix, iy, IMAGE, IMAGE, 20);
  ctx.stroke();

  // 文字（名前・ランク・成長）
  const font = (size: number, bold = true) => `${bold ? 'bold ' : ''}${size}px "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6b4a3a';
  ctx.font = font(40);
  ctx.fillText(info.title, 56, iy + IMAGE + 58);
  const titleW = ctx.measureText(info.title).width;
  ctx.fillStyle = '#9a86c6';
  ctx.font = font(30);
  ctx.fillText(info.rank, 56 + titleW + 20, iy + IMAGE + 60);
  ctx.fillStyle = '#8a7a70';
  ctx.font = font(26, false);
  ctx.fillText(`成長 ${info.xp} ・ ${info.home}`, 56, iy + IMAGE + 112);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f08a9a';
  ctx.font = font(26);
  ctx.fillText('#ほこりちゃん', CARD_W - 56, iy + IMAGE + 112);

  const blob = await new Promise<Blob | null>((resolve) => card.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  const text = `うちのほこりちゃんが「${info.rank}」に育ったよ！（成長${info.xp}）#ほこりちゃん`;
  return { blob, url: URL.createObjectURL(blob), text };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 遊んでいるページのURL（シェアに添える） */
export function gameUrl(): string {
  return `${location.origin}${location.pathname}`;
}

function photoFile(photo: Photo): File {
  return new File([photo.blob], 'hokorichan.png', { type: 'image/png' });
}

/** 端末の共有シート（画像つき）が使えるか */
export function canShareImage(photo: Photo): boolean {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [photoFile(photo)] });
  } catch {
    return false;
  }
}

/** 端末の共有シートで画像つきでシェアする。キャンセルは失敗にしない */
export async function shareImage(photo: Photo): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    await navigator.share({ files: [photoFile(photo)], text: `${photo.text} ${gameUrl()}` });
    return 'shared';
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/** Xの投稿画面を開く（画像は添付できないので、保存した画像を自分で付けてもらう） */
export function openXIntent(photo: Photo): void {
  const q = new URLSearchParams({ text: photo.text, url: gameUrl() });
  window.open(`https://x.com/intent/post?${q.toString()}`, '_blank', 'noopener');
}

/** 画像を保存する（ダウンロード） */
export function savePhoto(photo: Photo): void {
  const a = document.createElement('a');
  a.href = photo.url;
  a.download = 'hokorichan.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
