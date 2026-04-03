# 変更履歴

## [未リリース]

### 追加

- **Meadow 3D**: 平面円盤から **球体大地**へ刷新。北極起点の **球冠**（活動量に応じ 0〜π、π で球全体が緑）、`MeshStandardMaterial` のシェーダで茶／緑を混合。
- **草**: 球面一様配置、極角ソート、`InstancedMesh.count` と球冠角で成長を表現。
- **導入演出**: ロード時に球冠角と草本数をイージングで 0→目標へ（約 2.85s）。

### ドキュメント

- README / PROJECT / HISTORY / STATUS / CLAUDE を球体前提に更新。
- **エージェント向け**: `.cursor/rules/git-pr-workflow.mdc`（常時適用）、`AGENTS.md`、CLAUDE / PROJECT / README に **ブランチ→PR→マージ**運用を明記。
