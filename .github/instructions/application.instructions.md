---
applyTo: "**"
---

# このアプリ固有の必須ルール

共通規則は [全アプリ共通ルール](../copilot-instructions.md)。このファイルには現在の構成・設定・運用だけを書く。
横展開時はコピー先の実装に合わせて更新する。共通規則との矛盾を作らない。

## 実行環境と構成

- Node.jsはpackage.jsonのengines.nodeに従い、現在は22.23以上。Express・mssql・素のHTML/CSS/JavaScriptを使う単一アプリである。
- server.jsが起動、backend/routes.jsがAPI登録、backend/records.jsが一覧API、backend/data.jsが読取処理を担当する。
- 画面はpublic、共通HTTP処理はmiddleware、設定はconfig、接続とSQL読込はdb、運用コマンドはscriptsに置く。
- ブラウザJSは通常scriptとして扱い、一括module化しない。共有CSSは同梱資産を使い、隣接フォルダに依存しない。
- logはログ閲覧機能。開発・本番とも業務サーバーと別プロセス・専用ポートで動かす。
- 一覧は見出し・説明の専用段を置かず、件数・列数・閲覧専用を表上の情報行へまとめる。上下の余白を抑え、長い値は自動折返しで行を高くせず横スクロールで表示する。開発バッジはアプリのヘッダー内に置く。

## 設定とDB

- 固有設定はconfig/application.json、検証はconfig/application.js。現在のIDはvegetables-sale、表示バージョンは1.5、一覧APIは/api/records。
- 設定DBの基底名はapplication_config_db、業務DBはvegetables_maintenance_db、参照先はdbo.t_vegetable_sales。既存データとの対応を保つため一律置換しない。
- 資格情報とポート等は.env.developmentと本番ルートの.env.production。config/env.jsで読み、DB_CONFIG_NAMEはapplication.jsonのconfigurationDatabaseより優先する。
- 環境の正本はruntime.json。開発はdevelopment、本番runtimeはデプロイ処理が生成する。開発runtimeを手でproductionへ変更しない。
- 台帳は設定DBのdbo.m_database_connection。アプリID・環境・is_enabledで接続先を選び、common_dbは使わない。
- config/database-name.jsで開発の設定DB・業務DBへ-devを付与し、本番では基底名を使う。
- DB接続はdb/connection.jsへ集約する。業務処理はgetDatabaseConnection('application')を使う。
- 起動時にDB接続・列定義・実テーブルのSELECT権限を検証してからHTTP待受を開始する。

## SQLの配置と初期構築

- 業務SQLはbackend/queries、接続用はdb/queries、fixtureはtests/fixturesに置く。
- db/sql.jsのreadSql・readSqlSections・renderSqlを使う。テンプレート置換は1回とし、差込値を再解釈しない。
- 初期構築の編集元はdatabase-setup/templates。編集後はnpm run db:generateで生成済みSQLを同期する。このコマンドはDBへ接続しない。
- npm run db:setupは再生成後に6本のSQLを実DBへ実行する。書式確認や通常デプロイの検査に使わない。
- 既存DB・表・設定行・データは削除・上書きしない。ダミー300件は対象表が空の場合だけ投入する。
- 現在の16列・主キー・計算列・既定値・索引・制約を再現する。移植のために業務列を残しており、規則だけを理由に列追加やトリガー導入をしない。
- 現行のm_は接続先マスタ、t_は発生記録。internal/inspect_schema.sqlは定義確認だけの読取SQLである。

## ポートとログ

- 公開ポートはconfig/ports.jsで環境別envから読み、未設定・不正値・重複を拒否する。
- 現在は開発APP_PORT=2001、LOG_PORT=2601、本番APP_PORT=3001、LOG_PORT=3601。開発ではLIVE_RELOAD_PORTも必要。
- npm run devでアプリをnodemon、ログ画面を別の子プロセスとして起動し、Ctrl+Cで両方停止する。アプリの再起動・起動失敗中もログ閲覧を維持する。
- 通常consoleとAPIアクセスの記録にはmiddleware/logger.jsを使う。ログ画面は環境ルートのlog/server-app.logを表示する。
- log/gateway.logは管理プロセス、log/releases/<版>/server.logとlog-server.logは各プロセスの標準出力・標準エラー。ログ画面に選択機能はない。
- 起動URLはconfig/server-address.jsでIPv4を選ぶ。172帯、192帯、その他の順を基本とし、固定IP・個人用DNSを埋め込まない。

## 配布と確認

- npm run depはクリック更新、npm run depfoは10秒後の自動更新。新版の正常応答を確認して公開先を切り替える。
- scripts/deploy-prod.jsの許可リストを維持し、database-setup・tests・docs・.github・AGENTS.md・開発envをリリースへ配布しない。
- リリース名は東京日付のYYMMDD-NNN-担当者識別子-HHMMSS-UUID。本番envとログはリリース外で保持する。
- 公開管理は独自Node.jsプロセス。PM2は使用していないが、pm2.production.jsonは利用者の意向で残す。
- npm run checkで構文・参照・SQL直書き検出・偶数字下げを確認し、変更に対応するテストを実行する。全体テストはnpm test。
- 人向け操作説明の正本はREADME.md。docs/humanは補足、database-setup/README.mdはSQL手動実行の詳細に限る。
