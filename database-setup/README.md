# 🗄️ 初期構築SQLを手動で実行する

通常の準備は [ルートのREADME](../README.md) に集約しています。
ここは、SQL Server Management Studio（SSMS）で1本ずつ確認・実行する場合の補足です。

## 🧰 実行前の準備

1. `config/application.json` のID・DB名・スキーマ・表を確認。
2. 別業務へコピーした場合は、`templates/03_create_application_tables.sql` と `templates/05_insert_dummy_data.sql` を編集。
3. `npm run db:generate` で実行用SQLを生成。
4. SSMSで対象SQL Serverへ、DB作成権限のあるユーザーで接続。

`DB_CONFIG_NAME` を開発envに指定した場合、設定DB名はそちらを優先します。
このフォルダには資格情報・実データを含めず、本番へデプロイしません。

## 🔢 この順番で実行

各ファイルを**全体で**実行します。対象DBはSQL内で指定されるため、手動のDB切替は不要です。
SQLCMDモードやGOも不要です。

| 順番 | ファイル | 確認ポイント |
| --- | --- | --- |
| 1 | `01_create_databases.sql` | 本番・開発の4DB名が意図した接続先か |
| 2 | `02_create_configuration_tables.sql` | 両設定DBに接続先台帳を作るか |
| 3 | `03_create_application_tables.sql` | 列・型・主キー・計算列・既定値・索引・制約が正しいか |
| 4 | `04_insert_connection_settings.sql` | アプリID・環境・接続先の組合せが正しいか |
| 5 | `05_insert_dummy_data.sql` | ダミー300件を入れてよい対象か |
| 6 | `06_verify.sql` | 台帳と件数が期待どおりか |

## 🛟 既存データの扱い

- 既存DB・表・設定行・データは削除・上書きしません。
- ダミーは空の表だけ。1件でもあれば投入をスキップします。
- 再実行してもダミーは増えません。既存表の列を自動変更する処理もありません。
- 現在のサンプルは既存の16列を再現するものです。別業務では編集元テンプレートから変更します。

## 🔬 定義だけを調べる

`internal/inspect_schema.sql` は、参照先の列・主キー・索引・制約を確認する読取専用SQLです。
対象の業務DBへ接続して実行してください。データ行は取得しません。

## ✏️ 編集するのはtemplates側

生成済みSQLだけを直すと、次の生成で戻ります。
テンプレートを編集し、`npm run db:generate` で同期するのが基本です。
字下げは半角スペース2文字単位の偶数、タブは禁止。`npm run check` で確認できます。
