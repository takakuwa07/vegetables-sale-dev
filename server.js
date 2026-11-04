// ── 🥬 野菜売上ビューアーの起動 ─────────────────────────
// DBと対象テーブルの読取を確認してから、単一アプリを公開する。
// 本番は管理プロセスから渡された内部ポートで新版を準備する。

import { createServer } from 'node:http';
import path from 'node:path';
import { setupLogger } from './middleware/logger.js';

setupLogger({ plainConsole: true });

try {
  const { default: express } = await import('express');
  const { default: env } = await import('./config/env.js');
  const { initializeDatabaseConnections, getDatabaseConnection } = await import('./db/connection.js');
  const { readSalesColumns } = await import('./backend/bk-sales-data.js');
  const { default: setupCommon } = await import('./middleware/common.js');
  const { default: setupFrontend } = await import('./middleware/frontend.js');
  const { setupHealth } = await import('./middleware/deployment.js');
  const { default: registerRoutes } = await import('./backend/routes.js');
  const { default: setupErrors } = await import('./middleware/errors.js');

  await initializeDatabaseConnections();
  const pool = await getDatabaseConnection('application');
  await readSalesColumns(pool);
  // メタデータを読めるだけで公開成功にせず、実テーブルのSELECT権限も検査する。
  await pool.request().query('SELECT TOP (0) * FROM dbo.t_vegetable_sales;');

  const app = express();
  app.disable('x-powered-by');
  if (!env.isDevelopment) {
    app.set('trust proxy', 'loopback');
  }
  setupHealth(app);
  setupCommon(app);
  if (env.isDevelopment) {
    const { default: logRouter } = await import('./log/backend/bk-server-log-viewer.js');
    app.use('/api/server-log-viewer', logRouter);
    app.use('/server-log-viewer', express.static(path.resolve(import.meta.dirname, 'log/public')));
  }
  const liveReload = await setupFrontend(app, env);
  registerRoutes(app);
  setupErrors(app);

  const server = createServer(app);
  server.on('error', error => {
    console.error('サーバーの待受に失敗しました:', error);
    process.exit(1);
  });
  server.listen(env.port, env.host, () => {
    process.send?.({ type: 'production:ready', port: server.address().port });
    console.info(`野菜売上アプリを起動しました: ${env.environment}`);
    console.info(`売上一覧: http://localhost:${env.publicPort}/`);
    console.info(`ログ画面: http://localhost:${env.logPort}/server-log-viewer/index-log-viewer.html`);
  });

  let stopping = false;
  const shutdown = () => {
    if (stopping) {
      return;
    }
    stopping = true;
    liveReload?.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.once('disconnect', shutdown);
  process.on('message', message => {
    if (message === 'production:stop') {
      shutdown();
    }
  });
} catch (error) {
  console.error('野菜売上アプリの起動に失敗しました:', error);
  process.exit(1);
}
