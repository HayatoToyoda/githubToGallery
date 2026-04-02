# 経緯・現在地・展望

この文書は、**これまでの議論と実装の流れ**、**いまの到達点**、**今後の伸ばしどころ**を一箇所にまとめたものです。技術マップは [PROJECT.md](PROJECT.md)、スナップショットとツール一覧は [STATUS_AND_TOOLS.md](STATUS_AND_TOOLS.md) を参照してください。

---

## 1. 経緯（どういう議論と実装が重なってきたか）

### 1.1 プロジェクトの出発点

- **githubToGallery** は、個人の **GitHub README 用ビジュアル**（ヒーロー GIF・静止画）と、**活動量に連動する「畑」の Web デモ（`meadow/`）** を同じリポジトリで扱うことを目的にしている。
- 静的ホスト（GitHub Pages）と **OAuth / client secret を安全に扱う必要がある処理**を分離するため、**Cloudflare Worker（`workers/meadow-auth`）** を置く二段構成になっている。

### 1.2 ドキュメント整備

- 利用者向け [README.md](../README.md) に加え、**エージェントや初参加者が迷わない「地図」**として [PROJECT.md](PROJECT.md) を整備した。
- **実装スナップショットとツール一覧**は [STATUS_AND_TOOLS.md](STATUS_AND_TOOLS.md) に分離し、README 冒頭からも辿れるようにした。

### 1.3 README に埋め込める動的画像

- [github-readme-stats](https://github.com/anuraghazra/github-readme-stats) のように、README から `<img>` で埋め込める **SVG カード**を、同一 Worker に **`GET /api/readme-card.svg`** として追加した（公開 GitHub Users API ベース。任意で `GITHUB_TOKEN` でレート緩和）。

### 1.4 3D シーンの地面・体験の方向性

- **当初の課題**: 円盤の外側がカメラ角によっては **空（sky）だけ**に見える、**草の外側〜円盤端**を **茶色の土壌**で見せたい、という要望があった。
- **プロダクト方針の整理**: **OAuth で GitHub と連携したユーザー**に対し、**「更地から緑が広がり草が生えていく」**体験を目指す。**草は中心から円周方向に広がる**イメージとした。
- **指標の方針（確定）**:
  - OAuth 時は **Contribution Calendar の `totalContributions`（過去約1年）** を活動量の正とする（既存 GraphQL と整合）。
  - **未連携・クエリなし**の訪問者には、**いまのように「育った畑」のデモ**で魅力を見せる（フォールバック用の十分大きい活動量で **緑が最大付近まで**広がるように）。

### 1.5 直近の実装（meadow）

- **緑の半径** `growthRadiusFromActivity(commits)` を導入し、**活動量に応じて緑の円が小さく／大きく**なる（ログスケール、外周上限は `FIELD_RADIUS_MAX`）。
- **地面**: `growthRadius` 内を **緑**、その外から畑の端まで **茶色リング**、さらに **地平延長**の茶色リングで「水色だけ」の領域を減らす。
- **草**: ドーナツ状配置をやめ、**緑の半径内に一様（面積）配置**し、中心から外へ広がる見え方に寄せた。

---

## 2. 現在地（2026 年時点の到達点）

| 領域 | 状態 |
|------|------|
| **目的** | README 素材 + **OAuth / REST / デモ** に応じた活動連動の Three.js 畑。 |
| **データ** | OAuth 優先で `totalContributions`（`oauth-contributions.js`）。URL クエリで公開 REST。未指定・未 OAuth は **デモで「育った畑」**。 |
| **3D** | `growthRadius` + 土壌リング + 地平リング、草は円内配置（[`meadow/main.js`](../meadow/main.js)）。 |
| **Worker** | OAuth、GraphQL プロキシ、**README 用 SVG カード**（[`workers/meadow-auth`](../workers/meadow-auth/)）。 |
| **ドキュメント** | PROJECT / STATUS_AND_TOOLS / 本書。README に PROJECT・STATUS への案内。 |
| **運用上のプレースホルダ** | `assets/` の GIF・PNG 未配置の可能性、README の Live demo の `YOUR_USERNAME`、`MEADOW_API_BASE` 未設定時は OAuth 非表示。 |

---

## 3. 展望（これから伸ばせること）

優先度はリポジトリの運用次第。実装の有無は [STATUS_AND_TOOLS.md](STATUS_AND_TOOLS.md) の「任意・未実装」と併せて見るとよい。

### 3.1 体験・演出

- **入場時アニメーション**: 緑の半径を **0 から目標値へ補間**し、「広がっていく」瞬間を強調する（現状は静的スナップショット）。
- **ビジュアル調整**: 土・緑の色、フォグ、カメラ距離のさらなる調整。

### 3.2 プロダクト・運用

- **GitHub Pages / Live demo URL** の実 URL 化、`assets/` への **ヒーロー GIF・3D キャプチャ**の配置。
- **リポジトリ名**: README にある `readme-visual-lab` 等へのリネーム時は **URL・remote・Pages パス**の一括更新。

### 3.3 技術的拡張（オプション）

- **GitHub Actions + PAT で `data/contributions.json` を書き出す**方式は README に言及のみ。必要なら読み込みパスを `meadow` に追加する拡張。
- **README カード**の指標追加（スター数など）は Worker 側の API 呼び出しと SVG レイアウトの拡張で可能。

### 3.4 非目標（現状のまま）

- **他人の非公開データ**を本人の同意なしに取ることは前提にしない。
- **Worker 必須**ではない（静的のみ + 公開 REST でもデモは動く）。

---

## 4. 関連ドキュメント

- [PROJECT.md](PROJECT.md) — アーキテクチャ・データの流れ・ファイル対応表
- [STATUS_AND_TOOLS.md](STATUS_AND_TOOLS.md) — 現状スナップショット・ツール一覧
- [README.md](../README.md) — 利用者向け手順・OAuth・README カード
- [meadow/CAPTURE.md](../meadow/CAPTURE.md) — 録画・GIF

---

*この文書は、プロダクトの方向性やマイルストーンが変わったら更新してください。*
