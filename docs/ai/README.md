# AI向け文書の索引

## 必須ルールの正本は2種類

| 種類 | ファイル | 置く内容 |
| --- | --- | --- |
| 全アプリ共通 | [.github/copilot-instructions.md](../../.github/copilot-instructions.md) | コメント・書式・SQL・データ保護・検証・文書の共通方針 |
| このアプリ固有 | [.github/instructions/application.instructions.md](../../.github/instructions/application.instructions.md) | 現在の構成・設定・DB・ポート・実行コマンド |

作業前に両方を全文読む。SQLの共通書式とアプリ固有の配置もこの2ファイルに含める。
このフォルダへ第三の必須ルールや規則の複製を作らない。

## 入口と読込

- Copilotのリポジトリ全体指示は `.github/copilot-instructions.md`。
- アプリ固有指示は `applyTo: "**"` の `.instructions.md`。対応するCopilot機能で全ファイルを対象とする。
- 共通指示から固有指示も読むよう指定し、ルートの [AGENTS.md](../../AGENTS.md) も同じ2ファイルを参照する。
- 通常のMarkdownへのリンクは独立した自動読込機能ではない。利用するIDE・機能で指示の適用を確認する。

## 人向け文書

- 操作説明の正本は [README.md](../../README.md)。準備・開発・配布・ログ・DB・横展開をここへ集約する。
- [initial-setup.md](../../initial-setup.md) は初回のみ使う実行順チェックリスト。設定から初回起動までの操作手順を記載する。
- [docs/human](../human/README.md) は開発例・運用調査の補足。日常の手順を複製しない。
- [database-setup/README.md](../../database-setup/README.md) はSQLを手動実行する詳細。

## 変更時の手順

1. 実装の実行経路と利用者の指示を確認する。
2. 共通の作り方なら共通ルール、固有の構成ならアプリ固有ルールを更新する。
3. 人の操作が変わる場合はルートREADMEを更新する。長い調査例だけ補足へ置く。
4. 全自作Markdownのリンクと記載コマンドを確認する。
5. 実装済み・今後の規則・未実装案を混同しない。参考プロジェクトの規則を無条件に移植しない。

## 仕様の参照

Copilotの配置・frontmatter・両指示の併用は [GitHub公式のIDE別説明](https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/customize-copilot/configure-custom-instructions/add-repository-instructions-in-your-ide?tool=vscode) に基づく（確認日: 2026-11-04）。
利用するIDE・Copilot設定での適用確認は別途必要。ファイルの配置検査だけで、実際の読込を確認済みとはしない。
