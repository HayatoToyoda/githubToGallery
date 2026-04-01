# githubToGallery

自分の GitHub README を更新するためのビジュアル（ヒーロー GIF・3D キャプチャ）と、公開用インタラクティブデモ（`night-field/`）をまとめたリポジトリです。リポジトリ名を **`readme-visual-lab`** などへ変えてもよいです（GitHub の Rename。ローカルフォルダ名は `git remote` と揃えると管理しやすいです）。

## ビジュアル方針（確定・自分用 × シネマティック 3D）

| 項目 | 内容 |
|------|------|
| **ひと言コンセプト** | 「夜のフィールド」— 静かな実験ログとしてのリポジトリ。 |
| **記憶に残す主役** | **光とフォグ**（月明かり風のディレクショナル＋リム、奥行きのフォグ）。 |
| **シーン案（採用）** | **`night-field/` の草フィールド**を、夕方〜夜のシネマトーンに調整したものを主役にする。単体モデルレンダーや抽象ループは、必要になったら別アセットで追加する想定。 |
| **`assets/hero.gif`** | **動きの「ドカン」**：自動回転＋草の揺れのループ。README 先頭のヒーロー。 |
| **`assets/3d-showcase.png`** | **キービジュアルの静止画**：同シーンの別アングルでも、同構図の高解像スチルでも可。 |

撮影手順・`ffmpeg` 例は **[night-field/CAPTURE.md](night-field/CAPTURE.md)** を参照。

### GitHub 活動と草（実験中）

**狙い**: 各ユーザーの **コミットや活動**に応じて草の量が変わり、**README や Pages から「自分の畑」として楽しめる**ようにする。

- **いまできること（ブラウザ・公開 API のみ）**  
  - `night-field` を開くとき、URL に **`?user=GitHubユーザー名`** を付けると、その人の **公開プロフィール**から粗いスコアを取り、草の本数に反映します。  
  - **`?repo=オーナー/リポジトリ名&user=ユーザー名`** なら、その **リポジトリにおけるその人のコミット数**（[contributors 統計](https://docs.github.com/en/rest/metrics/statistics?apiVersion=2022-11-28)）を使います。`user` を省略すると **全 contributors の合計コミット**を使います。  
  - 認証なし API には **レート制限**があります。統計が未生成のときは **HTTP 202** で、自動リトライします。

- **これから足したいもの（みんなが組み込みやすくする方向）**  
  - **GitHub Actions** で `GITHUB_TOKEN` / GraphQL を使い、**本人の contribution カレンダー相当**を JSON 化して Pages に置く（ブラウザ直叩きより正確）。  
  - **このリポジトリをテンプレート化**し、fork した人が Actions だけで自分用の畑を更新できるようにする。  
  - **README に貼るバッジ・iframe** や、**Organization 用の集約ビュー**は要検討。

実装の入口は **[night-field/github-activity.js](night-field/github-activity.js)** と **[night-field/main.js](night-field/main.js)** です。

---

<p align="center">
  <img
    src="assets/hero.gif"
    alt="メインのGIFアニメーション（ヒーロー）"
    width="920"
  />
</p>

<p align="center">
  <sub>上記は <code>assets/hero.gif</code> を配置すると表示されます（未配置のときはリンク切れに見えます）。</sub>
</p>

---

## 3D / ビジュアル

<p align="center">
  <img
    src="assets/3d-showcase.png"
    alt="自作3Dのキャプチャ（レンダーまたはスクリーンショット）"
    width="920"
  />
</p>

<p align="center">
  <sub><code>assets/3d-showcase.png</code>。静止画の撮り方は <a href="night-field/CAPTURE.md">night-field/CAPTURE.md</a>（<code>?noRotate=1</code> で自動回転オフ）。</sub>
</p>

---

## デモ（GitHub Pages）

インタラクティブなデモ（夜トーンの草フィールド）はこちら。リポジトリ公開後、**`YOUR_USERNAME` を自分のユーザー名**に、リポジトリ名を実際の名前に合わせてください（リネームした場合は `readme-visual-lab` など）。

**[Live demo](https://YOUR_USERNAME.github.io/githubToGallery/night-field/)**

---

## アセットの置き場

| 種類 | 推奨パス | メモ |
|------|-----------|------|
| メイン GIF | `assets/hero.gif` | 幅 920px 前後を目安。[night-field/CAPTURE.md](night-field/CAPTURE.md) |
| 3D キャプチャ | `assets/3d-showcase.png` | PNG / WebP。透明背景が必要なら PNG。 |
| 追加の GIF | `assets/` 任意 | README に `<p align="center"><img ...></p>` を追加。 |

### ハイクオリティにするコツ（事実ベース）

- **GIF**: 録画後、`ffmpeg` や [gifsicle](https://www.lcdf.org/gifsicle/) でパレット最適化・フレーム間引き。
- **解像度**: 横 920〜1280px 程度が README 上で見やすいことが多い。
- **3D**: Three.js のスクリーンショット、または Blender レンダー。動きは GIF、キービジュアルは PNG に分けると整理しやすい。

---

## ローカル開発（Pages 用）

`night-field/` が静的サイトです。GitHub の **Settings → Pages** で **Deploy from branch** の **/ (root)** を選ぶと、サブパスとして **`https://<USER>.github.io/<REPO>/night-field/`** で公開されます（以前の **`/docs`** フォルダ指定は使いません。設定を変更した場合は反映まで数分かかることがあります）。

シーンの見た目は **[night-field/main.js](night-field/main.js)**（ライト・フォグ・草の色・自動回転）。録画・書き出しは **[night-field/CAPTURE.md](night-field/CAPTURE.md)**。
