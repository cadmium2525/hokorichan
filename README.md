# ほこりちゃん（MVP）

掃除 → 持ち帰り → 餌やり → 成長 → ケース拡張 をスマホ縦持ちで反復する Web ゲームの MVP です。
Three.js + TypeScript + Vite。画像・3D モデル・効果音はすべてコードで生成し、サーバー・ログイン・外部 API は使いません。

企画書・仕様書などの資料は `docs/`、開発指示は `CLAUDE.md` にあります。

## 遊び方

1. 最初に主人公（男の子／女の子）をえらぶと、勉強机の上でほこりちゃんと出会います。
2. 「おそうじへ」で家の中の場所（窓のさん・洗濯機のフィルター・自分の部屋・本棚の上・リビング）をえらび、指でなぞってホコリを集めます。最初は素手です。
3. 8 割以上集めるとお母さんからお小遣い（場所の基本額 ＋ 回収数 × 2）。
4. 帰って「餌をあげる」と成長します。机の上（容量 10）がいっぱいになったら、ショップでケース（30 / 100 / 300）を買います。
5. 「おでかけ」でまちへ。タップした場所へ歩き、ショップで掃除用具（ぞうきん・ハンディモップ・掃除機）・ケース・アクセサリーを買えます。ほこりちゃんが成長 30 になると友だちの家も掃除できるようになります。
6. ホコリは実時間で少しずつ積もります。待つ間は「あそぶ」で、なでる・アクセサリー・形の変更ができます。
7. ときどき湿気でしょんぼりします。「乾燥させる」（無料）で元に戻り、成長 XP は減りません。

詳しい数値は `docs/06_追加仕様_v0.2.md`・`docs/07_追加仕様_v0.3.md` と `src/game/catalog.ts` にあります。

ホーム画面に追加すると PWA として全画面で起動し、一度開けばオフラインでも遊べます。

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
- `?fast=1` … ホコリが積もる速さを 60 倍（1 分で 1 時間分）

## 構成

| パス | 役割 |
| --- | --- |
| `src/game/catalog.ts` | 掃除場所・道具・すみか・アクセサリー・形の定義と数値 |
| `src/game/state.ts` | ルール（報酬・ホコリの復活・餌やり・ショップ・湿気・サイズ）。DOM/描画に依存しない |
| `src/game/save.ts` | localStorage 保存（キー `hokorichan.save.v1`、バージョン管理、不正値の項目単位復旧） |
| `src/game/Game.ts` | 状態遷移 BOOT→HOME→CLEANING→RESULT→HOME と入力・保存・HUD の橋渡し |
| `src/game/audio.ts` | Web Audio による効果音合成 |
| `src/scenes/CleaningScene.ts` | 清掃シーン（道具ごとの集め方、回収演出、端スクロール） |
| `src/scenes/PetScene.ts` | 飼育シーン（勉強机／ケース、餌やり・なでる・着せ替え・乾燥の演出） |
| `src/render/spotBuilder.ts` / `toolModels.ts` | 掃除場所のレイアウトと道具の3Dモデル |
| `src/scenes/TownScene.ts` / `src/render/townBuilder.ts` / `heroModel.ts` | まち（タップ移動・当たり判定・カメラ追従）と主人公の3Dモデル |
| `public/manifest.webmanifest` / `public/sw.js` / `public/icons/` | PWA（ホーム画面追加・オフライン） |
| `src/render/pixelRenderer.ts` | 低解像度 RenderTarget → NearestFilter 拡大の擬似ピクセル描画 |
| `src/render/proceduralArt.ts` / `roomBuilder.ts` / `hokorichan.ts` | テクスチャ・家具・部屋・ほこりちゃんの手続き生成 |
| `src/ui/hud.ts` / `src/styles.css` | HTML/CSS の HUD・ボタン・モーダル |
| `src/ui/screens.ts` / `sprites.ts` | マップ・ショップ・あそぶ・お話の画面と、主人公・お母さんのドット絵 |
