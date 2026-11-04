# 🔎 運用の調査手順

起動・配布・ログの基本は [README](../../README.md) へ。ここは困ったときの工具箱です。

## 🔌 ポート使用中：まず持ち主を確認

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in 2001,2601,3001,3601 } |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

`OwningProcess` がPIDです。次の `<確認したPID>` を実際の番号へ置き換えます。

```powershell
Get-CimInstance Win32_Process -Filter 'ProcessId=<確認したPID>' |
  Select-Object ProcessId,ParentProcessId,CommandLine
```

プロセス名がNode.jsでも、別アプリの可能性があります。コマンドとフォルダを確認してから扱います。

## 📜 リリースごとのログを追う

本番ルートへ移動し、`<対象リリース名>` を実際のフォルダ名へ置き換えます。

```powershell
Get-Content -LiteralPath '.\log\releases\<対象リリース名>\server.log' -Tail 50 -Wait
```

| 調べたいもの | ファイル名 |
| --- | --- |
| アプリの起動・実行エラー | `server.log` |
| ログ画面自体の起動エラー | `log-server.log` |
| 公開管理プロセス | 本番ルートの `log/gateway.log` |

追跡を止めるときは `Ctrl+C`。ログの内容は変更しません。

## 🩺 公開管理プロセスの状態を見る

本番ルートで実行します。状態照会だけで、公開版は変わりません。

```powershell
node scripts/production-gateway.js status
```

| 項目 | 見るところ |
| --- | --- |
| `running` | 公開版が動いているか |
| `version` / `release` | 公開中の版とフォルダ |
| `ports` | 公開ポート。現在は3001と3601 |
| `prepared` | 切替前の準備済み候補があるか |
| `draining` | 旧版の通信完了を待っているか |

## ↩️ 切り戻し候補が起動しない

1. 開発フォルダで `npm run releases` を確認。
2. 同じ版番号が複数なら、完全なリリースフォルダ名で指定。
3. 対象フォルダのコードと `node_modules` が残っているか確認。
4. `server.log` でDB接続・権限・設定エラーを確認。

切り戻しはコードの切替です。DBを以前の構造へ戻す処理は含みません。

## 🧹 古いファイルを片付ける前に

| 対象 | 確認 |
| --- | --- |
| リリース | 公開中・準備中・切り戻し候補ではないか |
| `node_modules` | その版を再起動する予定がないか |
| ログ | 調査や保存に必要な期間を満たしたか |
| PM2設定 | 現在は予備として残す方針 |

参照が見当たらないだけで削除しないこと。運用ファイルには「たまに出番がある」ものもあります。
