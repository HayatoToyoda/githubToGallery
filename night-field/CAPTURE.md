# README 用アセットの撮り方（このリポジトリの確定案）

`night-field/` の **夜トーン草フィールド** を、`assets/hero.gif` と `assets/3d-showcase.png` に落とし込む手順です。

## 前提

- **ヒーロー GIF**: 動き（ゆっくりのカメラ回転＋風）。デフォルトで `OrbitControls` の **自動回転**が有効。
- **キービジュアル PNG**: 同じシーンの **高解像スチル**。角取り用に別アングルでもよい。

## ローカルで確認

リポジトリルートで:

```bash
cd night-field && python3 -m http.server 8080
```

ブラウザで `http://127.0.0.1:8080/` を開く。

## `hero.gif`（ループ向け）

1. ウィンドウ幅を README 向けに揃える（目安 **920px** 幅。DevTools でレスポンシブ指定可）。
2. **6〜10 秒**ほど画面録画（macOS: QuickTime / OBS など）。ループが分かりやすいよう **1 周以上**撮る。
3. 動画を `clip.mp4` などにしたうえで、例として `ffmpeg` でパレット GIF 化（要: ffmpeg インストール済み）。**リポジトリルート**で実行し、出力を `assets/hero.gif` にする:

```bash
ffmpeg -i clip.mp4 -vf "fps=12,scale=920:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 assets/hero.gif
```

フレームレートや `scale` は好みで調整。ファイルが大きすぎる場合は `fps` を下げるか幅を減らす。

## `3d-showcase.png`（静止画）

1. 同じくローカル `night-field` を表示した状態で、**好みの構図**にドラッグで合わせる。
2. **自動回転を止める**: アドレスに **`?noRotate=1`** を付ける（例: `http://127.0.0.1:8080/?noRotate=1`）。
3. スクリーンショットを **PNG** で保存し、リポジトリの `assets/3d-showcase.png` に置く。ぼけを減らすならウィンドウを大きくし、README 表示幅は README 側の `width` で調整。

## GitHub Pages 上で撮る場合

公開後の URL でも同様。`?noRotate=1` は本番 URL にも付与可能。
