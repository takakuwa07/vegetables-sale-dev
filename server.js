// ── 🚀 アプリの起動 ────────────────────────────────────
// DBと対象テーブルの読取を確認してから、単一アプリを公開する。
// 本番は管理プロセスから渡された内部ポートで新版を準備する。

import { createServer } from 'node:http';
import { setupLogger } from './middleware/logger.js';
import { getServerAddress } from './config/server-address.js';

// 📝 設定の読込に失敗した場合も記録できるよう、最初にログを準備する。
setupLogger({ plainConsole: true });

try {
  // ── ⚙️ 1. 設定と各機能の準備 ─────────────────────────
  // 設定不備も最後のcatchで受け取り、起動失敗として記録する。
  const { default: express } = await import('express');
  const { default: env } = await import('./config/env.js');
  const { initializeDatabaseConnections, getDatabaseConnection } = await import('./db/connection.js');
  const { readColumns, checkDataAccess } = await import('./backend/data.js');
  const { default: setupCommon } = await import('./middleware/common.js');
  const { default: setupFrontend } = await import('./middleware/frontend.js');
  const { setupHealth } = await import('./middleware/deployment.js');
  const { default: registerRoutes } = await import('./backend/routes.js');
  const { default: setupErrors } = await import('./middleware/errors.js');

  // ── 🗄️ 2. DB接続と読取権限の確認 ─────────────────────
  // 接続設定専用DBから接続先を取得し、業務DBへ接続する。
  // 参照先を読み取れることまで確認してからHTTPを公開する。
  await initializeDatabaseConnections();
  const pool = await getDatabaseConnection('application');
  await readColumns(pool);

  // 🔎 列定義の取得に加えて、実テーブルのSELECT権限も検査する。
  await checkDataAccess(pool);

  // ── 🔗 3. 画面・API・共通処理の登録 ───────────────────
  // ヘルスチェック → 共通処理 → 画面 → API → エラー処理の順に登録する。
  const app = express();
  app.disable('x-powered-by');

  // 🔒 本番は同じPCの公開管理プロセスを経由するため、その接続元情報を信頼する。
  if (!env.isDevelopment) {
    app.set('trust proxy', 'loopback');
  }

  // 🩺 起動確認用の応答を先に登録し、その後へ共通処理を適用する。
  setupHealth(app);
  setupCommon(app);

  // 📝 ログ画面は別プロセス・専用ポートで提供するため、ここには登録しない。
  // 🖥️ 画面配信を準備する。開発時に作成されるLiveReloadは停止時に閉じる。
  const liveReload = await setupFrontend(app, env);

  // 📡 業務APIを登録し、処理されなかったエラーは最後の共通処理へ渡す。
  registerRoutes(app);
  setupErrors(app);

  // ── 🌐 4. HTTP待受と起動完了の通知 ────────────────────
  const server = createServer(app);
  server.on('error', error => {
    // ❌ ポートの使用中など、待受で発生した失敗を記録して終了する。
    console.error('サーバーの待受に失敗しました:', error);
    process.exit(1);
  });

  // 本番は内部ポートで待ち受け、準備完了と実ポートを管理プロセスへ伝える。
  // 起動ログには、利用者が接続する公開ポートのURLを案内する。
  server.listen(env.port, env.host, () => {
    // ✅ 管理プロセスから起動された場合に、待受の準備完了を伝える。
    process.send?.({ type: 'production:ready', port: server.address().port });
    console.info(`アプリを起動しました: ${env.environment}`);

    // 📍 起動PCのIPと公開ポートを使い、ブラウザで開くURLを表示する。
    const address = getServerAddress();
    console.info(`アプリ画面: http://${address}:${env.publicPort}/`);
    console.info(`ログ画面: http://${address}:${env.logPort}/server-log-viewer/index-log-viewer.html`);
  });

  // ── 🛑 5. 安全な停止処理 ──────────────────────────────
  // 停止要求を受け取り、処理中のHTTP応答を最大5秒待つ。
  // 複数の停止要求が重なっても、終了処理は一度だけ行う。
  let stopping = false;
  const shutdown = () => {
    if (stopping) {
      return;
    }
    stopping = true;

    // 🧹 開発用の更新通知を閉じ、新しいHTTP接続の受付を止める。
    liveReload?.close();
    server.close(() => process.exit(0));

    // ⏱️ 接続が残り続けても5秒で終了する。タイマーだけでプロセスを延命しない。
    setTimeout(() => process.exit(0), 5000).unref();
  };

  // ⌨️ Ctrl+Cや、外部からの終了要求を同じ停止処理で受け取る。
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  // 🔌 管理プロセスとの接続が切れた場合も、子サーバーだけを残さない。
  process.once('disconnect', shutdown);

  // 📨 デプロイ時など、管理プロセスから届く停止指示を受け取る。
  process.on('message', message => {
    if (message === 'production:stop') {
      shutdown();
    }
  });
} catch (error) {
  // ❌ 設定・DB接続・画面準備など、起動中の失敗をここへ集約する。
  console.error('アプリの起動に失敗しました:', error);
  process.exit(1);
}
