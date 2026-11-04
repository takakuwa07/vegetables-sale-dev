# 🛠️ 開発の具体例

通常の準備・構成・規則は [README](../../README.md) にまとめています。ここは書き方の見本帳です。

## 💬 コメントは「何のため？」を一言で

関数の役割、起動前に検査する理由、停止の条件などを説明します。

```js
// ── 🗄️ DB接続と読取権限の確認 ────────────────────
// 参照先を読めることまで確認してから、HTTPを公開する。
await initializeDatabaseConnections();
const pool = await getDatabaseConnection('application');
await checkDataAccess(pool);

// ── 🌐 HTTP待受の開始 ────────────────────────────
// 本番は内部ポートで待ち受け、管理プロセスが公開ポートへ転送する。
server.listen(env.port, env.host);
```

これは説明用の抜粋です。実際の起動処理は `server.js` を確認してください。

| 見出しの例 | 意味 |
| --- | --- |
| ⚙️ 設定 | 設定読込・検証 |
| 🗄️ DB | 接続・権限・データ取得 |
| 🌐 起動 | HTTP待受・URL案内 |
| 🛑 停止 | 受付停止・接続待ち・終了 |
| ❌ 失敗 | エラーの記録・失敗通知 |

絵文字は道しるべ。毎行に付けず、まとまりの先頭へ置きます。

## 📐 SELECTの続きは8文字でもOK

```sql
-- 列定義を確認する。データ行は取得しない。
SELECT c.column_id, c.name,
        c.max_length, c.is_nullable
FROM sys.columns AS c
WHERE c.object_id = OBJECT_ID(@tableName)
ORDER BY c.column_id;
```

行頭が0・2・4・6・8…文字なら規則に合います。7文字の位置合わせやタブは使いません。
`npm run check` が違反ファイルと行番号を表示します。

## 🧱 SQLを直したら、どこまで確認？

| 変更 | 確認 |
| --- | --- |
| SQLの字下げだけ | `npm run check` |
| 一覧の検索・並べ替え | クエリ関連テストと画面の結果 |
| 初期構築テンプレート | `npm run db:generate` 後、生成SQLのDB名・列・制約 |
| 既存表の列構成 | データを保持する移行手順を別途検討 |

`db:generate` はファイル生成、`db:setup` はDBへ実行。似た名前でも、仕事は別です。

## 📝 ルールを変える場所

- 🌍 横展開しても守ること → `.github/copilot-instructions.md`
- 📍 このアプリの構成・設定 → `.github/instructions/application.instructions.md`
- 📖 人が操作するときの説明 → ルートの `README.md`

共通ルールへ固定ポートや業務DB名を入れないことが、コピー先で迷わないコツです。
