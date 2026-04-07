# README 用アセットの撮り方

`meadow/` の **日中・ポップな大地** を、`assets/hero.gif` と `assets/3d-showcase.png` に落とし込む手順です。

## データ連動（コミット数）

**草の量と大地の半径**は **contributors のコミット数**だけを使います。

- **フォームでユーザー名のみ**: 公開リポジトリを走査し、あなたのコミットが最も多いリポを自動選択。
- 例: `http://127.0.0.1:8080/?user=octocat`
- クエリなし: デモ用の固定コミット数相当。

## ローカルで確認

```bash
cd meadow && python3 -m http.server 8080
```

ブラウザで `http://127.0.0.1:8080/` を開く。

## `hero.gif`（ループ向け）

1. ウィンドウ幅を README 向けに揃える（目安 **920px**）。
2. **6〜10 秒**ほど画面録画。
3. リポジトリルートで `ffmpeg` 例:

```bash
ffmpeg -i clip.mp4 -vf "fps=12,scale=920:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 assets/hero.gif
```

## `3d-showcase.png`（静止画）

1. ローカル `meadow` を表示し、**`?noRotate=1`** を付けて自動回転を止める。
2. スクリーンショットを **PNG** で保存し、`assets/3d-showcase.png` に置く。

## GitHub Pages 上で撮る場合

公開 URL は **`https://<USER>.github.io/<REPO>/meadow/`**（旧 **`/night-field/`** は `meadow/` に移行しました）。
