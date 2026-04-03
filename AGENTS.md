# githubToGallery — エージェント向けメモ

Cursor / Claude / その他のコーディング AI は、リポジトリ内の次を参照すること。

| 内容 | パス |
|------|------|
| プロジェクトの地図 | [docs/PROJECT.md](docs/PROJECT.md) |
| **Git / PR 運用（必須）** | [.cursor/rules/git-pr-workflow.mdc](.cursor/rules/git-pr-workflow.mdc) |
| Claude Code 向け詳細 | [CLAUDE.md](CLAUDE.md) |

## Git（要約）

- **`main` に直接 push しない**。機能・修正は **ブランチ → PR → マージ**。
- 実装後は **必ず PR を作成**してから `main` に統合する。
