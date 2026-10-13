// 引き継ぎコード：セーブデータを圧縮して1つの文字列にする（サーバーなし）。
// 形式：HK1<方式>.<本文（base64url）>.<チェック（crc32の16進8けた）>
//   方式 z = deflate-raw で圧縮、p = 圧縮なし（圧縮が使えない古いブラウザ用）
// 読み込むときはチェックを確かめ、sanitize で今の版のセーブデータに整える。

import { sanitize } from './save.ts';
import type { SaveData } from './state.ts';

const PREFIX = 'HK1';

export type DecodeResult = { ok: true; save: SaveData } | { ok: false; reason: string };

/** CRC-32（まちがいの検出用） */
export function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const out = new Blob([copy.buffer]).stream().pipeThrough(stream as unknown as TransformStream<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function canCompress(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

/** セーブデータ → 引き継ぎコード */
export async function encodeSave(save: SaveData): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(save));
  const zip = canCompress();
  const body = zip ? await pipe(json, new CompressionStream('deflate-raw')) : json;
  const sum = crc32(body).toString(16).padStart(8, '0');
  return `${PREFIX}${zip ? 'z' : 'p'}.${toBase64Url(body)}.${sum}`;
}

/** 引き継ぎコード → セーブデータ。空白や改行がまじっていても読める */
export async function decodeSave(code: string, now = Date.now()): Promise<DecodeResult> {
  const text = code.replace(/\s+/g, '');
  const m = /^HK1([zp])\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(text);
  if (!m) return { ok: false, reason: 'コードの形がちがうみたい。ぜんぶコピーできているか確かめてね' };
  let body: Uint8Array;
  try {
    body = fromBase64Url(m[2]);
  } catch {
    return { ok: false, reason: 'コードの中に読めない文字があるみたい' };
  }
  if (crc32(body).toString(16).padStart(8, '0') !== m[3]) return { ok: false, reason: 'コードがとちゅうで切れているか、まちがっているみたい' };
  try {
    const json = m[1] === 'z' ? await pipe(body, new DecompressionStream('deflate-raw')) : body;
    const raw: unknown = JSON.parse(new TextDecoder().decode(json));
    if (typeof raw !== 'object' || raw === null || !('version' in raw)) return { ok: false, reason: 'ほこりちゃんのデータではないみたい' };
    return { ok: true, save: sanitize(raw, now) };
  } catch {
    return { ok: false, reason: 'このブラウザでは読めないコードみたい' };
  }
}
