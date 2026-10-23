# X 用 PV の作り方

ゲームを録画して、[つなぐ](https://github.com/cadmium2525/mp4mp3)（`editor/`）のエンジンで書き出します。完成品は `promo/hokorichan_pv.mp4`（1080×1920・約32秒）。

```bash
npx vite build && npx vite preview --port 4173 &
# 1. ゲームの録画（CDP スクリーンキャスト → mp4）。tools/pv/*.mp4 ができる
PW=$(npm root -g)/playwright node tools/pv/scenes.cjs          # 場面を指定するなら末尾に clean feed …
# 2. 書き出し用に webm（VP9）へ（ヘッドレス Chromium は H.264 を読めないことがある）
mkdir -p /tmp/pvm && for n in titleDesk clean feed town sky world space galaxy bubbles; do
  ffmpeg -y -i tools/pv/$n.mp4 -c:v libvpx-vp9 -crf 28 -b:v 0 -an /tmp/pvm/$n.webm; done
cp public/bgm/home.mp3 public/bgm/sky.mp3 /tmp/pvm/
# 3. プロジェクト JSON → 動画
node tools/pv/make-pv.mjs /tmp/pvm webm > tools/pv/pv.json
node ../mp4mp3/editor/tools/render.mjs tools/pv/pv.json /tmp/pvm promo/hokorichan_pv.mp4
```

- 頭はフェードインしません（最初のクリップは切りかえなし、BGM も fadeIn 0）。終わりだけ 0.8 秒で消えます。
- テロップや長さは `make-pv.mjs` の `CUTS` と `texts` を直します。
