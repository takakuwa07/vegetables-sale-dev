// ── 📝 サーバーとAPIのログ ────────────────────────────────
// console の出力とAPIへのアクセスを、日時・接続元IP付きで記録する。
// リクエストごとのIPを処理中も保ち、表示用とファイル保存用の文面を作る。

import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { AsyncLocalStorage } from 'node:async_hooks';
import { projectRoot } from '../config/project-root.js';

// -----------------------------------------------------------
// 📝 ログの共通設定
// -----------------------------------------------------------
let logPath = path.join(projectRoot, 'log/server-app.log');

// 🧵 リクエストごとのIPなどを保持する。awaitの先でも同じ情報を参照できる。
const requestContext = new AsyncLocalStorage();

// 二重にconsoleを置き換えないためのフラグと、ファイル保存を行うかの設定。
let initialized = false;
let recordFile = true;

// 🖥️ 起動時のアプリ一覧など、サーバー自身のIPが分かる出力に明示的に付ける。
// 接続元IPとは異なり、ここで渡すのはURLに使用するサーバーのIP。
function withLogIp(ip, callback) {
  // 既存の情報を残しながらIPを設定し、callback内のログに適用する。
  return requestContext.run({ ...requestContext.getStore(), ip }, callback);
}

// 🕒 日本時間で「26/09/26 13:32:32」の形にする。
function formatLogDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo', year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);

  // 年・月・日などの要素を、values.yearのように取り出せるオブジェクトに変換する。
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const day = `${values.year}/${values.month}/${values.day}`;
  const time = `${values.hour}:${values.minute}:${values.second}`;

  return `${day} ${time}`;
}

// 🏷️ 日時・IP・本文を組み立てる。IP不明なら15文字のハイフンを表示する。
function formatLogMessage(level, message) {
  const context = requestContext.getStore();
  const ip = `[${context?.ip || '-'.repeat(15)}]`;

  // 🔎 「/URL status=数字 time=数字ms」という形式のinfoだけをアクセス結果と判断する。
  // APIの応答結果には[INFO]を付けず、日時・IP・メソッド・URLの順で表示する。
  const isAccessLog = context && level === 'info'
    && /^\/\S* status=\d{3} time=\d+ms$/.test(message);
  const label = isAccessLog ? '' : `[${level.toUpperCase()}] `;

  // HTTPメソッドはアクセス結果だけに付ける。通常のconsole出力にはIPのみ引き継ぐ。
  const method = isAccessLog ? `${context.method} ` : '';

  return `[${formatLogDate()}] ${ip} ${method}${label}${message}`;
}

// 💾 渡された文字列をログの末尾へ追加する。過去の内容は上書きしない。
// fileNameを省略した場合は、共通設定のlogPathを使う。
function appendLog(text, fileName) {
  const destination = fileName
    ? path.join(projectRoot, fileName)
    : logPath;

  fs.appendFileSync(destination, text, 'utf8');
}

// -----------------------------------------------------------
// ✅ console出力を受け取り、端末表示とファイル保存を振り分ける
// -----------------------------------------------------------
// plainConsole: trueなら通常のconsoleは端末で本文だけ表示する。
// saveToFile: falseなら、このconsole出力のファイル保存を行わない。
// fileName: 保存先を変更したい場合に指定する。
// = {}は引数なしでも呼べる設定。各項目を省略すると、指定された初期値を使う。
function setupLogger({ fileName, plainConsole = false, saveToFile = true } = {}) {
  // 一度設定していたら、consoleを二重に置き換えないようにここで終了する。
  if (initialized) return;

  // 引数で受け取った保存設定を、このファイル共通の変数に保持する。
  recordFile = saveToFile;
  // 保存先が指定されている場合だけ、標準の保存先を変更する。
  if (fileName) {
    // プロジェクトのフォルダとファイル名を組み合わせて、保存先のパスを作る。
    logPath = path.join(projectRoot, fileName);
  }

  // 📄 ファイルがなければ作成する。'a'なので既存のログは消えない。
  if (recordFile) {
    // 保存先のフォルダを作る。recursive: trueなら途中のフォルダも作成できる。
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    // ファイルを追記用に開いてすぐ閉じることで、ファイルが存在する状態にする。
    fs.closeSync(fs.openSync(logPath, 'a'));
  }
  // 設定済みの印を付け、次回のsetupLogger呼び出しでは処理を省略する。
  initialized = true;

  // 🚨 捕捉されなかった例外も記録する。例外を握りつぶして実行を続ける機能ではない。
  // onは通知を受けたときの処理を登録する。errorはエラー本体、originは発生経路。
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    console.error('未処理のエラー（' + origin + '）:', error);
  });

  // levelにlog、info、warn、error、debugを順番に入れ、それぞれのconsoleを設定する。
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    // 元のconsoleを保存する。置き換えたconsole自身を呼ぶと再帰してしまうため。
    // console[level]はconsole.logなどを選ぶ書き方。bindは呼び出し元をconsoleに固定する。
    const original = console[level].bind(console);

    // consoleの動きを新しい関数に置き換える。...argsは渡された引数をすべて配列で受け取る。
    console[level] = (...args) => {
      // ここから下は、setupLoggerの実行時ではなく、consoleが呼ばれるたびに実行される。
      // formatWithOptionsで色を付けずに文字列化する。例外のスタックや改行も保持する。
      // ...argsで配列の中身を個別の引数として渡し、表示する本文を作る。
      const body = util.formatWithOptions({ colors: false }, ...args);

      // 📝 ファイル保存用に日時・IPを付け、アクセス結果かも確認する。
      // 本文に日時・IP・ログの種類を付けて、保存用の文面を作る。
      const message = formatLogMessage(level, body);
      // 現在処理しているリクエストのIPなどを取得する。情報がなければundefinedになる。
      const context = requestContext.getStore();
      // 情報があり、infoで、本文が「/URL status=200 time=10ms」の形式ならアクセス結果と判断する。
      const isAccessLog = context && level === 'info'
        && /^\/\S* status=\d{3} time=\d+ms$/.test(body);

      // 通常のconsoleは端末で本文だけ表示する。アクセス結果は日時・IP付きで表示する。
      // 条件 ? A : Bは、条件が成立すればA、成立しなければBを選ぶ書き方。
      const terminal = plainConsole && !isAccessLog ? body : message;

      // 📬 npm run devではscripts/dev.jsが出力を受け取る。
      // APP_LOGは内部の目印。JSONを読み解いて端末表示とファイル保存を分ける。
      // ここでreturnするのは、起動スクリプトとの二重保存を防ぐため。
      // 起動スクリプトが出力を管理しているか、環境変数の値で判断する。
      if (process.env.APP_LOG_CAPTURED === '1') {
        // 識別用の目印に、端末用と保存用の文面をJSON文字列にして付け、元のconsoleへ渡す。
        original('\x1eAPP_LOG ' + JSON.stringify({ terminal, log: message }));

        // 起動スクリプトに処理を渡したので、この後の表示・保存処理は実行しない。
        return;
      }

      // 保存しておいた元のconsoleを使って、端末用の文面を表示する。
      original(terminal);

      // ファイル保存が無効なら、端末への表示だけで終了する。
      if (!recordFile) return;

      // 端末への出力は済んでいるため、ファイル保存の失敗だけを捕捉する。
      try {
        // 保存用の文面に改行を付けて、ログファイルの末尾へ追加する。
        appendLog(message + '\n');
      } catch (error) {
        // 保存失敗は元のconsoleへ出す。同じ保存処理を繰り返さないようにする。
        original('ログの保存に失敗しました:', error.message);
      }
    };
  }
}


// -----------------------------------------------------------
// 🌐 APIの接続元情報と、応答結果を記録する
// -----------------------------------------------------------
function apiLogger(req, res, next) {
  // ⏱️ 受付時刻を保存し、応答完了までにかかった時間を計算する。
  const start = Date.now();

  // ::ffff:192.168.11.6のようなIPv4表記を、192.168.11.6へそろえる。
  // 転送ヘッダーを直接信用せず、Expressが取得した接続元を使う。
  const ip = (req.ip || req.socket.remoteAddress || '-').replace(/^::ffff:/, '');
  const context = { ip, method: req.method };

  // runの中から始まる非同期処理にも、このリクエストの情報を引き継ぐ。
  // 同時アクセスがあっても、別の利用者のIPと混ざらない。
  requestContext.run(context, () => {
    // 🏁 応答を送信し終えた時点で、確定したステータスコードと所要時間を記録する。
    res.on('finish', () => {
      requestContext.run(context, () => {
        // アクセス結果はターミナルへ出さず、同じ形式でログファイルにだけ記録する。
        const message = formatLogMessage(
          'info',
          `${req.originalUrl} status=${res.statusCode} time=${Date.now() - start}ms`
        );

        // APIの応答結果をファイルへ保存し、失敗時はconsoleへ通知する。
        try {
          appendLog(message + '\n');
        } catch (error) {
          console.error('APIログの保存に失敗しました:', error.message);
        }
      });
    });

    // ➡️ ログの準備ができたら、次のミドルウェアやAPIの本処理へ進む。
    next();
  });
}

export { setupLogger, apiLogger, formatLogDate, formatLogMessage, appendLog, withLogIp };
