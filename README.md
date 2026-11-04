# 📋 データ閲覧アプリ ― 使い方はここから

SQL Serverのデータを、**一覧・検索・並べ替え・ページ移動**で確認するアプリです。
普段の準備と運用は、このREADMEだけで進められます。
初回だけ順番に確認したい場合は [初回セットアップ手順](initial-setup.md) を使ってください。

## 🔧 技術スタック

| 分野 | 技術 | このアプリでの役割 |
| --- | --- | --- |
| 🟢 実行環境 | Node.js 22.23以上 / ES Modules | サーバー・開発コマンド・デプロイ処理を実行 |
| 🌐 Webサーバー | Express 5系 | HTML・静的ファイルの配信、API、エラー処理 |
| 🗄️ データベース | SQL Server | 一覧データと接続先台帳を管理 |
| 🔌 DB接続 | `mssql` 12系 | 接続プール・パラメーター付きSQLを実行 |
| 🖥️ 画面 | HTML / CSS / JavaScript | 一覧・検索・並べ替え・ページ送りを表示 |
| 🎨 基本スタイル | ress（同梱リセットCSS） | ブラウザごとの初期スタイルの差を調整 |
| 📡 通信 | Fetch API / JSON / SSE | データ取得はJSON、ログの更新通知はSSE |
| 🔄 開発支援 | nodemon / LiveReload | コード変更時のサーバー再起動と画面更新 |
| ✅ テスト・検査 | Node.js標準テスト / 独自検査スクリプト | 動作・構文・参照先・SQL書式を確認 |
| 📦 パッケージ管理 | npm / package-lock.json | 依存パッケージのバージョンを固定して準備 |

**画面の流れ：** ブラウザ → ExpressのAPI → 共通DB接続 → SQL Server → JSONで返却 → 表を更新。
本番では公開管理プロセスがアプリとログサーバーへ通信を振り分けます。
依存の指定範囲は `package.json`、固定したバージョンは `package-lock.json` で確認できます。

## 🧭 早見表

| やりたいこと | コマンド・場所 |
| --- | --- |
| 開発する | `npm run dev`（アプリ＋ログ画面を起動） |
| 本番へ配布する | `npm run dep`（クリック更新） |
| カウントダウンで更新する | `npm run depfo`（10秒後に画面更新） |
| アプリ名・表示バージョンを変える | `config/application.json` |
| コードを検査する | `npm run check` / `npm test` |
| SQLだけ生成する | `npm run db:generate`（DB実行なし） |
| DBを初期構築する | `npm run db:setup`（DBへ実行） |
| 保存済みの版を調べる | `npm run releases` |

## 🚀 1. 初めての準備

**必要なもの：Node.js 22.23以上、npm、SQL Serverへの接続情報。**
Node.jsの対応範囲は `package.json` の `engines.node` で確認できます。

プロジェクトのルートをPowerShellとエディターで開きます。

```powershell
npm ci
npm --prefix log ci
Copy-Item .env.example .env.development
```

`Copy-Item` は開発envがまだない初回だけ。既存envはそのまま使います。
`.env.development` を編集し、次を記入してください。

| 設定 | 入れるもの |
| --- | --- |
| `DB_USER` / `DB_PASSWORD` | SQL Serverのユーザーとパスワード |
| `DB_SERVER` / `DB_PORT` | SQL Serverのホストとポート |
| `DB_ENCRYPT` / `DB_TRUST_SERVER_CERTIFICATE` | 接続先に合う暗号化・証明書設定 |
| `DB_CONFIG_NAME` | 接続先台帳DBの基底名。現在は `application_config_db` |
| `APP_PORT` / `LOG_PORT` | 開発アプリ2001 / 開発ログ2601 |
| `LIVE_RELOAD_PORT` | 開発用の画面更新通知ポート。例は35001 |
| `DEPLOY_INITIALS` | 英数字3文字以上。英大文字・小文字を両方含む担当者識別子 |
| `DEPLOY_TARGET_DIR` | 開発フォルダと別の本番フォルダ。例：`C:/dev/app-prod` |

🔐 **パスワードはenvへ。README・画面・SQL・ログへは書きません。**

新しいDBを準備する場合だけ、次へ進みます。

```powershell
npm run db:generate
```

生成SQLのDB名・列・ダミーデータを確認後、DB作成権限のある接続で実行します。

```powershell
npm run db:setup
```

既存DBを利用する場合、初期構築は必要なときだけ実行してください。

## 🛠️ 2. 開発する

```powershell
npm run dev
```

アプリとログ画面が**別プロセス**で起動します。終了は `Ctrl+C`、アプリの手動再起動は端末で `rs`。
コード・設定・SQLの変更でアプリが再起動し、画面ファイルの変更はLiveReloadが通知します。
ログ画面はSSEで新しいログを受け取ります。

| 用途 | 開発 | 本番 |
| --- | --- | --- |
| アプリ | `http://<起動PCのIP>:2001/` | `http://<起動PCのIP>:3001/` |
| ログ画面 | `http://<起動PCのIP>:2601/server-log-viewer/index-log-viewer.html` | `http://<起動PCのIP>:3601/server-log-viewer/index-log-viewer.html` |

番号は現在の設定です。変更先は環境別envの `APP_PORT` / `LOG_PORT`。
起動時にもURLが表示されます。IPv4は172帯を優先し、なければ192帯などを使います。
アプリが起動に失敗しても、ログ画面から原因を確認できます。

📋 一覧は見出し・説明の段を省き、件数・列数・閲覧専用を表の上へ集約しています。
上下の余白と行の高さを抑え、長い値は横スクロールで確認できます。

## 📦 3. 本番へデプロイする

初回だけ、本番envを用意します。

```powershell
npm run prod:setup
```

`DEPLOY_TARGET_DIR` の直下に `.env.production` を作ります。
DB接続項目は開発envから引き継ぎます。**本番の接続先・権限・ポートを確認**してください。
既存の本番envは上書きしません。開発・本番のフォルダは同一・親子関係にしません。

| コマンド | デプロイ | 利用者の画面 |
| --- | --- | --- |
| `npm run dep` | 新版を配布・起動確認・公開切替 | 右上の通知をクリックして更新 |
| `npm run depfo` | 同じ配布・確認・切替 | 通知後10秒で自動更新 |

新版を内部ポートで起動し、正常応答を確認してから公開先を切り替えます。
コマンドが終わっても、本番アプリとログサーバーはバックグラウンドで動きます。
通常の起動・デプロイでは、DB作成やダミーデータ投入は行いません。

```text
<本番ルート>/
  .env.production
  releases/
    YYMMDD-NNN-担当者識別子-HHMMSS-UUID/
  log/
    server-app.log
    gateway.log
    releases/<リリース名>/
      server.log
      log-server.log
```

- 📅 `YYMMDD` は東京日付、`NNN` は連番。時刻とUUIDでフォルダの重複を防ぎます。
- ↩️ 古い版の `node_modules` は切り戻しに必要です。公開版・切り戻し候補を確認して整理します。
- 🧳 `database-setup/`・`tests/`・説明書・AI指示・開発envは配布しません。
- ⚙️ 現在は独自のNode.js管理プロセスを使用。`pm2.production.json` は予備として残しています。

### ↩️ 前の版へ戻す

開発フォルダから実行します。

```powershell
npm run releases
npm run rollback -- <一覧のリリース名>
```

保存済みコードと依存パッケージで起動を確認してから切り替えます。DBやデータは巻き戻しません。

## 🔎 4. ログを見る

ログ画面は **`log/server-app.log` 専用**。最新行は下に追加され、最下部では自動追従します。
画面全体ではなくログ領域をスクロールします。過去行を読んでいる間は位置を保ちます。

| ファイル | 記録するもの | 出番 |
| --- | --- | --- |
| `log/server-app.log` | console出力・APIアクセス結果 | 普段の動作確認。ログ画面の表示対象 |
| `log/releases/<版>/server.log` | その版のアプリの標準出力・標準エラー | 版ごとの起動失敗・エラー |
| `log/releases/<版>/log-server.log` | その版のログ閲覧サーバーの出力 | ログ画面自体が起動しないとき |
| `log/gateway.log` | 公開管理プロセスの出力 | 公開ポート・管理プロセスの調査 |

consoleが呼ばれるたびに、その処理のログが増えます。起動時だけの記録ではありません。
ログ画面でgatewayやリリース別ログを選択する機能は、現在ありません。

本番ルートでファイルを直接追う場合は、次を使います。終了は `Ctrl+C`。

```powershell
Get-Content -LiteralPath .\log\gateway.log -Tail 50 -Wait
```

## 🗄️ 5. 開発DBと本番DB

**設定は基底名、開発は自動で `-dev`。** DB名の切替は `config/database-name.js` に集約しています。

| 用途 | 本番DB | 開発DB | テーブル |
| --- | --- | --- | --- |
| 接続先台帳 | `application_config_db` | `application_config_db-dev` | `dbo.m_database_connection` |
| 現在の業務データ | `vegetables_maintenance_db` | `vegetables_maintenance_db-dev` | `dbo.t_vegetable_sales` |

- 接続先台帳をアプリID・環境・有効状態で絞り、業務DBへ接続します。`common_db` は使いません。
- envの `DB_CONFIG_NAME` は、アプリ設定の `configurationDatabase` より優先されます。
- 開発DBがなくても本番DBへ代替接続しません。起動を止めます。
- 起動時は接続・列定義・SELECT権限を確認してからHTTPを公開します。

### 🧱 初期構築SQLの中身

`database-setup/templates/` を編集 → `npm run db:generate` → 生成SQLを確認、の順です。

| 実行順 | 生成ファイル | 内容 |
| --- | --- | --- |
| 1 | `01_create_databases.sql` | 本番・開発の4DB |
| 2 | `02_create_configuration_tables.sql` | 両設定DBの接続先台帳 |
| 3 | `03_create_application_tables.sql` | 両業務DBの表・索引 |
| 4 | `04_insert_connection_settings.sql` | 環境別の接続先登録 |
| 5 | `05_insert_dummy_data.sql` | 空の表へ架空データ300件 |
| 6 | `06_verify.sql` | 接続先・件数確認 |

`db:generate` はファイル生成だけ。`db:setup` は再生成して上の6本をDBへ実行します。
既存のDB・表・設定行・データは削除・上書きしません。1件でもある表へダミーは追加しません。
既存表の列構成は自動変更しないため、列変更は別途移行が必要です。
現在のサンプルは16列・主キー・計算列・既定値・索引・チェック制約を再現します。

## 🧳 6. 別のアプリへ横展開する

フォルダをコピーしたら、まずここを変更します。

| 場所 | 変更内容 |
| --- | --- |
| `config/application.json` | ID・画面名・ラベル・表示バージョン・説明・設定DB・業務DB・スキーマ・表・APIパス |
| `.env.development` | 接続資格情報・開発ポート・担当者識別子・本番フォルダ |
| 本番ルートの `.env.production` | 本番の接続情報・公開ポート |
| `database-setup/templates/03_create_application_tables.sql` | コピー先の列・制約 |
| `database-setup/templates/05_insert_dummy_data.sql` | コピー先のサンプルデータ |
| `.github/instructions/application.instructions.md` | コピー先固有の構成・DB・コマンド・前提 |

**共通ルールは持っていく。アプリ固有ルールは合わせ直す。**
同じデータを使うコピーなら、既存のアプリID・DB名・表名は維持します。
新しいIDを使う場合は、接続先台帳にも対応する行が必要です。初期構築SQLは設定したIDの行を登録します。
同じPCで動かすアプリ同士は、アプリ・ログ・LiveReloadのポートを重複させません。

## 🧩 7. ファイルの地図と書き方

### 🌳 フォルダ構造

```text
プロジェクト/
│
├─ server.js                  # 🚀 アプリの起動・停止
├─ package.json               # 📦 依存パッケージと実行コマンド
├─ package-lock.json          # 🔒 依存パッケージの固定情報
├─ runtime.json               # 🔀 開発・本番の環境種別
│
├─ .env.development           # 🔑 開発用の接続情報・ポート等
├─ .env.example               # 📝 開発envのひな形
├─ .env.production.example    # 📝 本番envのひな形
│
├─ config/                    # ⚙️ アプリ名・環境・DB名・ポート等の設定
│  └─ application.json        # 🏷️ アプリ固有設定の入口
│
├─ backend/                   # 📡 一覧API・データ取得処理
│  └─ queries/                # 🗄️ 一覧取得・件数・列定義のSQL
│
├─ db/                        # 🔌 DB接続とSQL読込の共通処理
│  └─ queries/                # 🗄️ 接続先台帳等を読むSQL
│
├─ middleware/                # 🧩 画面配信・ログ・エラー等の共通処理
│
├─ public/                    # 🖥️ アプリ画面のHTML・CSS・JavaScript
│  └─ shared/                 # 🎨 同梱する共通CSS
│
├─ log/                       # 📜 ログ閲覧機能と開発ログの保存先
│  ├─ server-log.js           # 🚀 ログ閲覧サーバーの起動
│  ├─ backend/                # 📡 ログ取得・SSE配信のAPI
│  └─ public/                 # 🖥️ ログ画面のHTML・CSS・JavaScript
│
├─ scripts/                   # 🛠️ 開発・検査・デプロイ・切り戻しの処理
│
├─ database-setup/            # 🧱 DB初期構築専用。デプロイ対象外
│  ├─ templates/              # 📝 SQL生成元。変更するときはここを編集
│  └─ internal/               # 🔎 表定義を確認する読取専用SQL
│
├─ tests/                     # ✅ 自動テスト
│  └─ fixtures/               # 🧪 テスト用SQL
│
├─ .github/                   # 🤖 GitHub Copilot向けの必須ルール
│  ├─ copilot-instructions.md # 🌍 全アプリ共通ルール
│  └─ instructions/           # 📍 このアプリ固有ルール
│
├─ docs/
│  ├─ human/                  # 📖 人向けの詳細例・調査手順
│  └─ ai/                     # 🤖 AI向けの文書索引
│
├─ AGENTS.md                  # 🤖 対応AIが読む入口
├─ initial-setup.md           # 🏁 初回だけ使う手順書
└─ README.md                  # 📚 普段使うマニュアル
```

主なファイルを抜粋しています。`node_modules/` は `npm ci` で準備します。
本番の `.env.production`・`releases/`・ログは、別の本番ルートに置きます。

### 🧭 変更する場所の早見表

| 場所 | 担当 |
| --- | --- |
| `server.js` | 設定 → DB確認 → HTTP登録 → 起動 → 停止 |
| `config/` | アプリ設定・環境・ポート・DB名・IP選択 |
| `backend/` | API登録・一覧の取得。SQLは `queries/` |
| `db/` | 共通DB接続・SQL読込。接続用SQLは `queries/` |
| `middleware/` | 画面配信・ログ・エラー・開発表示・更新通知 |
| `public/` | HTML・CSS・ブラウザJS・画像 |
| `log/` | ログ閲覧サーバー・API・画面 |
| `scripts/` / `tests/` | 開発・運用コマンド / テスト |
| `database-setup/` | 移植先DBの初期構築。配布対象外 |

### ✏️ 統一した書き方

| 統一すること | 書き方 |
| --- | --- |
| 💬 コメント | 日本語で目的・理由を説明。関数と重要な処理に付ける |
| 🪄 見出し | 設定⚙️・DB🗄️・起動🌐・停止🛑など、意味のある絵文字 |
| 🌬️ 空白行 | 設定・検証・DB操作など、処理のまとまりの間に置く |
| 📐 字下げ | JSは2文字。SQLは半角スペース2文字単位の偶数、タブ禁止 |
| 🗂️ SQL | JSへ直書きせず `.sql` へ。検索語はパラメーターで渡す |
| 🧱 分岐 | 波括弧と改行を使い、一行に処理を詰めない |
| 📱 スクロール | 一覧・ログ領域の中で行い、操作部を見失わせない |
| 🏷️ 命名 | 追加ファイルは小文字ハイフン、SQLは小文字アンダースコア。標準名は維持 |

`.gitattributes` はテキスト・改行形式の取り決め、`.editorconfig` はSQL字下げのエディター設定です。

## 🤖 8. GitHub Copilotの設定

エディターでは、`.github` と `package.json` がある**プロジェクト全体**を開きます。
必須ルールの正本は、次の2種類です。

| 種類 | ファイル | 横展開時 |
| --- | --- | --- |
| 🌍 全アプリ共通 | `.github/copilot-instructions.md` | 共通の作り方として引き継ぐ |
| 📍 このアプリ固有 | `.github/instructions/application.instructions.md` | コピー先に合わせて更新 |

共通ルールはリポジトリ全体の指示、固有ルールは `applyTo: "**"` の指示ファイルにしています。
VS CodeのCopilotでは、対象ファイルに共通・固有の両方を適用する構成です。
通常のMarkdownを置くだけでなく、Copilot所定の場所と形式を使っています。

カスタム指示を有効にし、Copilotの応答の参照一覧で読込を確認してください。
IDE・機能によって対応範囲は異なります。指示はAIへの必須要件ですが、完全な強制機構ではないため検査も併用します。
対応状況は [GitHub公式のIDE別説明](https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/customize-copilot/configure-custom-instructions/add-repository-instructions-in-your-ide?tool=vscode) で確認できます。
Codex等の対応AIには `AGENTS.md` から同じ2ファイルを読むよう指示しています。

## ✅ 9. 修正後の確認

```powershell
npm run check
npm test
```

`check` はJS構文・ローカル参照・HTMLアセット・SQL直書き検出・SQLの字下げを確認します。
コメントの分かりやすさなど、自動判定しないルールはレビューで確認します。
画面・実DB・本番の確認は、テスト実行と分けて記録します。

## 🩹 10. 困ったときの一手

| 症状 | 最初に確認 |
| --- | --- |
| 本番のenvがない | `DEPLOY_TARGET_DIR` を確認して `npm run prod:setup` |
| 開発DBがない | `-dev` 付きDB・接続先台帳・読取権限を確認 |
| ポート使用中 | envの番号と、既存の起動プロセスを確認 |
| ログ画面が開かない | 開発2601 / 本番3601、ログ閲覧サーバーの起動ログを確認 |
| 画面が旧版のまま | 右上の更新通知を確認。`dep` はクリックで更新 |
| `npm audit` の指摘 | 対象・修正内容を確認。`--force` での一括変更は避け、互換性を検証 |

さらに掘るときだけ： [開発の具体例](docs/human/development.md) · [運用の調査手順](docs/human/operations.md) · [SQLの手動実行](database-setup/README.md)。
