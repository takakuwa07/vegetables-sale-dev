# 📚 詳しく調べたいときの補足

**普段は [ルートのREADME](../../README.md) だけでOKです。**
このフォルダには、必要なときだけ開く具体例と調査手順を置いています。

| もう一歩知りたいこと | 補足 |
| --- | --- |
| 💬 コメントの書き方・SQLの字下げ例 | [開発の具体例](development.md) |
| 🔎 ポート競合・本番ログ・切り戻しの調査 | [運用の調査手順](operations.md) |
| 🗄️ SSMSからSQLを順番に実行 | [SQL手動実行](../../database-setup/README.md) |

## 🤖 GitHub Copilotの設定

必須ルールは `.github/copilot-instructions.md`（全アプリ共通）と
`.github/instructions/application.instructions.md`（このアプリ固有）の2種類です。
ルートのREADMEに、読込の仕組みと確認方法をまとめています。

同じ操作説明を複数ファイルへ増やさず、普段の手順はREADMEへ、長くなる調査例だけをここへ追加します。
