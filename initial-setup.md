# 🚀 初回セットアップ手順

**最初の1回だけ使うチェックリストです。** 上から順に進めてください。
完了後の日常操作は [README.md](README.md) を使います。

## 🧰 1. 必要なものを確認

- [ ] Node.js 22.23以上とnpmが利用できる
- [ ] SQL Serverの接続先・ユーザー・パスワードが分かる
- [ ] 新規DBを作る場合は、DB・表・索引を作成できる権限がある
- [ ] アプリ用フォルダと本番用フォルダを別々に決めた

PowerShellで、`package.json` があるフォルダを開きます。
以降のコマンドも、特記がなければこのフォルダで実行します。

```powershell
node --version
npm --version
npm ci
npm --prefix log ci
```

📦 依存パッケージはlockファイルに従って準備します。

## ⚙️ 2. アプリ設定を確認

`config/application.json` を開きます。

| 項目 | 確認すること |
| --- | --- |
| `id` | 接続先台帳と対応するアプリ識別子 |
| `title` / `label` / `version` | 画面名・ラベル・表示バージョン |
| `configurationDatabase` | 接続先台帳のDB基底名 |
| `data.database` | データを読むDBの基底名 |
| `data.schema` / `data.table` | 読み取るスキーマ・表 |
| `data.apiPath` | 一覧APIのパス。現在は `/api/records` |

同じアプリ・同じデータを使う場合は、ID・DB名・表名を維持します。
別の列構成にする場合は、DB準備の前に初期構築テンプレートも変更します。

## 🔐 3. 開発用envを準備

envがない場合だけ、ひな形から作ります。既存ファイルは上書きしません。

```powershell
if (-not (Test-Path -LiteralPath .env.development)) {
  Copy-Item -LiteralPath .env.example -Destination .env.development
}
```

`.env.development` を開き、**既存の値も含めて接続先に合うか**確認します。

| 設定 | 記入内容 |
| --- | --- |
| `DB_SERVER` / `DB_PORT` | SQL Serverのホスト・接続ポート |
| `DB_USER` / `DB_PASSWORD` | 接続ユーザー・パスワード |
| `DB_ENCRYPT` / `DB_TRUST_SERVER_CERTIFICATE` | 接続先の暗号化・証明書設定に合わせる |
| `DB_CONFIG_NAME` | 設定DBの基底名。現在は `application_config_db` |
| `APP_PORT` | `2001` |
| `LOG_PORT` | `2601` |
| `LIVE_RELOAD_PORT` | `35001`（ほかと重複しない番号） |
| `DEPLOY_INITIALS` | 英数字3文字以上。英大文字・小文字を両方含める |
| `DEPLOY_TARGET_DIR` | 本番フォルダの絶対パス。例：`C:/dev/app-prod` |

🔑 パスワードはenvだけに記入します。この手順書には書き込みません。
本番フォルダは、アプリ用フォルダの中・親フォルダ・同一フォルダにはしません。

## 🗄️ 4. DB・テーブルを準備

### 📝 まずSQLを生成

```powershell
npm run db:generate
```

この時点ではDBへ接続しません。`database-setup/` の生成SQLを確認します。

- [ ] 作成対象のDB名が正しい
- [ ] 開発用は `-dev` 付き、本番用は接尾語なしになっている
- [ ] 表の列・型・制約が目的に合う
- [ ] ダミーデータを投入してよい対象になっている

現在の設定では、次のDBと表を準備します。

| 用途 | 本番DB | 開発DB | 表 |
| --- | --- | --- | --- |
| 接続先台帳 | `application_config_db` | `application_config_db-dev` | `dbo.m_database_connection` |
| 一覧データ | `vegetables_maintenance_db` | `vegetables_maintenance_db-dev` | `dbo.t_vegetable_sales` |

### 🧱 新規構築が必要な場合だけ実行

```powershell
npm run db:setup
```

SQLを再生成し、本番・開発のDB、表、接続先台帳を準備します。
**空の一覧表にはダミー300件が入ります。本番用の空表も対象です。**
既存のデータは削除・上書きせず、1件でもある表へダミーを追加しません。
既存表の列構成を変更する処理はありません。

既存DBを使う場合は、必要な表・台帳行・権限がそろっていればこの実行を省略できます。
作成権限がない場合は、[SQLの手動実行手順](database-setup/README.md) でDB管理担当者に準備を依頼してください。

アプリ起動用ユーザーには、設定台帳と一覧データを読み取れる権限が必要です。
初期構築用と起動用でユーザーを分ける場合は、構築後にenvを起動用へ変更します。

## 🛠️ 5. 開発画面で動作確認

```powershell
npm run check
npm test
npm run dev
```

起動ログに表示されたURLをブラウザで開きます。

| 確認先 | URLの形式 |
| --- | --- |
| アプリ | `http://<起動PCのIP>:2001/` |
| ログ | `http://<起動PCのIP>:2601/server-log-viewer/index-log-viewer.html` |

- [ ] 一覧に列とデータが表示される
- [ ] 検索・並べ替え・ページ移動ができる
- [ ] 画面下の接続DB名が `-dev` 付きになっている
- [ ] ログ画面が開き、新しいログを確認できる

確認後は `Ctrl+C`。アプリとログサーバーの両方が停止します。

## 📦 6. 本番用envを準備

```powershell
npm run prod:setup
```

`DEPLOY_TARGET_DIR` の直下に `.env.production` が作られます。
DB接続項目は開発envから引き継ぐため、本番の接続内容を必ず確認してください。
既存の本番envは上書きしません。

| 確認項目 | 設定 |
| --- | --- |
| 本番のアプリポート | `APP_PORT=3001` |
| 本番のログポート | `LOG_PORT=3601` |
| 設定DB名 | `DB_CONFIG_NAME` は `-dev` なしの基底名 |
| 接続ユーザー | 本番の設定台帳・一覧表を読み取れるユーザー |

別端末から利用する場合は、3001・3601への接続がネットワーク設定で許可されているか確認します。

## 🌐 7. 初回デプロイ

```powershell
npm run dep
```

新版の起動と正常応答を確認してから、公開先が切り替わります。
**通常のデプロイでは、DB構築やダミーデータ投入は行いません。**

| 確認先 | URLの形式 |
| --- | --- |
| 本番アプリ | `http://<起動PCのIP>:3001/` |
| 本番ログ | `http://<起動PCのIP>:3601/server-log-viewer/index-log-viewer.html` |

- [ ] 本番アプリが開く
- [ ] 画面下の接続DB名に `-dev` が付いていない
- [ ] 本番ログが開く
- [ ] 起動・接続エラーが出ていない
- [ ] `npm run releases` で公開中の版を確認できる

コマンド終了後も、本番アプリとログサーバーは動作します。
`database-setup/` とこの手順書は本番リリースへ配布されません。

## 🎉 8. 初回作業の完了

すべて確認できたら、このチェックリストの作業は完了です。
以降は [README.md](README.md) のコマンド早見表を使ってください。

| 次回からの操作 | コマンド |
| --- | --- |
| 開発を始める | `npm run dev` |
| 本番を更新する | `npm run dep` |
| 通知後10秒で画面も更新する | `npm run depfo` |
| 保存済みの版を確認する | `npm run releases` |

## 🩹 途中で止まったら

| 状況 | 確認すること |
| --- | --- |
| パッケージを取得できない | npmの接続先・通信設定・Node.jsのバージョン |
| DBへ接続できない | ホスト・ポート・認証・証明書設定 |
| 開発DBが見つからない | `-dev` 付きDBと接続先台帳が準備済みか |
| 読取権限がない | 起動用ユーザーが設定台帳と対象表を読めるか |
| ポートが使用中 | 同じ番号で別のサーバーが動いていないか |
| 本番envが見つからない | `DEPLOY_TARGET_DIR` と `prod:setup` の結果 |
| 本番の起動確認に失敗 | 表示された `server.log` と `log/gateway.log` |
