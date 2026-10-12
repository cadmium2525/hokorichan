# ほこりちゃん（MVP）

掃除 → 持ち帰り → 餌やり → 成長 → ケース拡張 をスマホ縦持ちで反復する Web ゲームの MVP です。
Three.js + TypeScript + Vite。画像・3D モデル・効果音はすべてコードで生成し、サーバー・ログイン・外部 API は使いません。

企画書・仕様書などの資料は `docs/`、開発指示は `CLAUDE.md` にあります。

## 遊び方

1. 「掃除に行く」→ 画面を指でなぞると掃除機がホコリを吸い込みます。画面の左右端に指を寄せると部屋がスクロールします。
2. 8 割以上集めると「掃除完了」で報酬（基本 20 ＋ 回収数 × 2 コイン）。全部集めると自動で完了します。
3. 帰宅して「餌をあげる」→ バッグのホコリ 1 個につき成長 +1。ケース容量（30 / 100 / 300）を超えては与えられません。
4. コインで「ケース拡張」（Lv2: 80、Lv3: 220）。
5. 清掃のたびに 20% の確率で湿気状態になって帰宅後にしょんぼりします。「乾燥させる」（無料）で元に戻ります。成長 XP は減りません。

## 開発

```bash
npm install
npm run dev        # http://localhost:5173 （--host 付きなので同一 LAN のスマホからも開けます）
npm run build      # 型チェック + 本番ビルド（dist/）
npm run preview    # ビルド結果の確認
npm test           # ルールとセーブデータのユニットテスト（Node 22+）
```

`dist/` は静的ファイルだけなので、GitHub Pages などの無料ホスティングにそのまま置けます（`base: './'`）。

### GitHub Pages で公開する

`.github/workflows/deploy.yml` が main への push ごとにビルドして `dist/` を公開します。
リポジトリの Settings → Pages → Build and deployment → Source を **GitHub Actions** にしてください
（「Deploy from a branch」のままだとビルド前のソースが配信され、ゲームが起動しません）。

### テスト用 URL パラメータ

- `?seed=123` … 部屋の配置・ホコリ・湿気判定の乱数を固定
- `?damp=1` / `?damp=0` … 次の清掃後に必ず湿気る / 湿気ない

## 構成

| パス | 役割 |
| --- | --- |
| `src/game/state.ts` | ルール（報酬・餌やり・容量・拡張・湿気・サイズ）。DOM/描画に依存しない |
| `src/game/save.ts` | localStorage 保存（キー `hokorichan.save.v1`、バージョン管理、不正値の項目単位復旧） |
| `src/game/Game.ts` | 状態遷移 BOOT→HOME→CLEANING→RESULT→HOME と入力・保存・HUD の橋渡し |
| `src/game/audio.ts` | Web Audio による効果音合成 |
| `src/scenes/CleaningScene.ts` | 清掃シーン（吸引、回収演出、端スクロール） |
| `src/scenes/PetScene.ts` | 飼育シーン（ケース、餌やり・拡張・乾燥の演出） |
| `src/render/pixelRenderer.ts` | 低解像度 RenderTarget → NearestFilter 拡大の擬似ピクセル描画 |
| `src/render/proceduralArt.ts` / `roomBuilder.ts` / `hokorichan.ts` | テクスチャ・家具・部屋・ほこりちゃんの手続き生成 |
| `src/ui/hud.ts` / `src/styles.css` | HTML/CSS の HUD・ボタン・モーダル |
