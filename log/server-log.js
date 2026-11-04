// -----------------------------------------------------------
// 📦 使用する機能の読み込み
// -----------------------------------------------------------
// ExpressはHTTP配信、共通のアドレス設定は起動URLの表示に使う。
import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getServerAddress } from '../config/server-address.js';
// with { type: 'json' }で、JSONファイルを設定オブジェクトとして読み込む。
import runtime from '../runtime.json' with { type: 'json' };
import { setupLogger } from '../middleware/logger.js';
import { projectRoot } from '../config/project-root.js';
import { readPorts } from '../config/ports.js';
import { addDevelopmentBadge } from '../middleware/development-badge.js';

// -----------------------------------------------------------
// 📝 ログ専用サーバーの準備
// -----------------------------------------------------------
// 業務サーバーとは別プロセスなので、業務側の停止に巻き込まれない。
// 業務側だけがserver-app.logへ記録する。閲覧サーバー自身は端末表示のみ。
// 開発ではルートのnpm run dev、本番では公開管理プロセスが起動する。
// ログ画面はSSEで更新するため、ブラウザのLiveReloadは使わない。
setupLogger({ saveToFile: false, plainConsole: true });

try {
  // -----------------------------------------------------------
  // ⚙️ 環境の確認とポート番号の決定
  // -----------------------------------------------------------
  // 環境種別からログ閲覧用のポートを決める。
  // includesは値が配列に含まれるかを確認し、!は判定を反転する。
  // 許可した環境名以外なら、誤った設定で起動しないようにエラーを投げる。
  if (!['development', 'production'].includes(runtime.environment)) {
    throw new Error('runtime.jsonのenvironmentが不正です');
  }

  // 公開ポートは環境別のenvファイルから読む。本番の内部ポートは管理プロセスが渡す。
  const ports = readPorts(projectRoot, runtime.environment);
  const port = process.env.PRODUCTION_INTERNAL_PORT !== undefined
    ? Number(process.env.PRODUCTION_INTERNAL_PORT)
    : ports.LOG_PORT;

  // -----------------------------------------------------------
  // 🧩 ログ取得APIと画面配信の準備
  // -----------------------------------------------------------
  // await import()で読み込み完了を待ち、export defaultの値を指定した名前で受け取る。
  const { default: logRouter } = await import('./backend/bk-server-log-viewer.js');
  const { default: setupErrors } = await import('../middleware/errors.js');

  const app = express();
  const { setupHealth } = await import('../middleware/deployment.js');
  setupHealth(app);

  // import.meta.urlはこのファイルの位置。その位置を基準に画面フォルダを探す。
  const publicPath = new URL('./public/', import.meta.url);

  // URLをWindowsでも使えるファイルパスに変換し、HTML・CSS・JSなどの配信を用意する。
  const serveLogFiles = express.static(fileURLToPath(publicPath));

  if (runtime.environment === 'development') {
    // 業務サーバーと同じ開発用表示を、ログ画面の両方のURLへ追加する。
    const logHtml = new URL('./public/index-log-viewer.html', import.meta.url);
    app.get(['/server-log-viewer/index-log-viewer.html', '/apps/server-log-viewer/frontend/index-log-viewer.html'], async (req, res, next) => {
      try {
        res.set('Cache-Control', 'no-store');
        res.type('html').send(addDevelopmentBadge(await readFile(logHtml, 'utf8')));
      } catch (error) {
        next(error);
      }
    });
    app.get('/development-badge.js', (req, res) => {
      res.sendFile(fileURLToPath(new URL('../public/development-badge.js', import.meta.url)));
    });
  }

  // ログ取得とSSE配信は、業務側のserver-app.logだけを読み込む。
  // SSEは、ファイルの更新をサーバーからブラウザへ通知する仕組み。
  // 業務サーバーが異常終了しても、このAPIと画面は稼働を続ける。
  app.use('/api/server-log-viewer', logRouter);

  // ログサーバーのトップページを開いた場合も、ログ画面へ案内する。
  app.get('/', (req, res) => res.redirect('/server-log-viewer/index-log-viewer.html'));

  // 通常のURLと、外部アプリが使っていたURLの両方から同じ画面を開ける。
  app.use('/server-log-viewer', serveLogFiles);
  app.use('/apps/server-log-viewer/frontend', serveLogFiles);

  // 未定義APIや処理エラーの対応は、ほかのルートを登録した後に置く。
  setupErrors(app);

  // -----------------------------------------------------------
  // 🌐 待ち受けを開始し、ログ画面のURLを表示する
  // -----------------------------------------------------------
  // 0.0.0.0は、この端末のすべてのIPv4インターフェースで接続を受け付ける指定。
  const server = app.listen(port, runtime.environment === 'production' ? '127.0.0.1' : '0.0.0.0', () => {
    process.send?.({ type: 'production:ready', port: server.address().port });
    // 業務サーバーと同じ優先順位で、起動PCのIPv4を案内する。
    // URLの表示だけを変え、実際の待受アドレスや公開ポートは上の設定を使う。
    const displayHost = getServerAddress();

    console.log('ログ閲覧サーバーを起動しました: ' + runtime.environment);

    // 本番の内部ポートではなく、公開ポートを案内する。
    const displayPort = ports.LOG_PORT;
    console.log('サーバーログ: http://' + displayHost + ':' + displayPort + '/server-log-viewer/index-log-viewer.html');
  });

  // ポートが使用中など、待ち受け開始に失敗した場合は記録して異常終了する。
  server.on('error', error => {
    console.error('ログ閲覧サーバーの起動に失敗しました:', error);
    process.exit(1);
  });

  // -----------------------------------------------------------
  // 🛑 このログサーバーへの終了要求を処理する
  // -----------------------------------------------------------
  // Ctrl+Cや終了要求を受けたら停止する。業務サーバーの終了には連動しない。
  const shutdown = () => {
    console.info('ログ閲覧サーバーを停止します');
    // 新しい接続を止め、既存接続が閉じたら正常終了する。
    server.close(() => process.exit(0));

    // SSEなどの接続が残っても5秒後には終了する。
    // unref()により、このタイマーだけのためにプロセスが残ることを防ぐ。
    setTimeout(() => process.exit(0), 5000).unref();
  };

  // onceは通知を1回だけ受け取る。SIGINTはCtrl+C、SIGTERMは終了要求。
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.on('message', message => { if (message === 'production:stop') shutdown(); });
  process.once('disconnect', shutdown);
} catch (error) {
  // -----------------------------------------------------------
  // ❌ 設定や初期化のエラーを記録する
  // -----------------------------------------------------------
  console.error('ログ閲覧サーバーの起動に失敗しました:', error);
  // 呼び出し元へ失敗を伝えるため、終了時のコードを1に設定する。
  process.exitCode = 1;
}
