// -----------------------------------------------------------
// ✅ Server Log Viewer API
// server-app.log をブラウザに表示するためのルーター
// -----------------------------------------------------------
import express from 'express';
import fs from 'fs';
import path from 'path';
import { formatLogDate } from '../../middleware/logger.js';
import { projectRoot } from '../../config/project-root.js';

const router = express.Router();

// -----------------------------------------------------------
// ✅ 監視するログファイル
// 開発・本番それぞれのプロジェクトルートにあるlog/server-app.logを見る。
// -----------------------------------------------------------
const logFilePath = path.join(projectRoot, 'log/server-app.log');
// 業務サーバーが未起動でも、空のファイルを用意して監視を開始できるようにする。
fs.closeSync(fs.openSync(logFilePath, 'a'));

// -----------------------------------------------------------
// ✅ SSE接続中のブラウザ一覧
// 複数の人が同時に画面を開いた場合も配信できるように配列で管理
// -----------------------------------------------------------
const clients = [];

// -----------------------------------------------------------
// ✅ ログファイル監視状態
// 何度も fs.watch を作らないようにするための変数
// -----------------------------------------------------------
let isWatching = false;
let watchTimer = null;

// -----------------------------------------------------------
// ✅ 関数
// ファイルサイズを見やすい文字に変換する
// -----------------------------------------------------------
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// -----------------------------------------------------------
// ✅ 関数
// ログ全文とファイル情報を読み取り、初回取得・SSE配信に共通の形式で返す。
// 読み取り失敗もオブジェクトで返し、画面側が接続状態や案内を表示できるようにする。
// -----------------------------------------------------------
function readServerLog() {
  try {
    // ファイルが存在しない場合
    if (!fs.existsSync(logFilePath)) {
      return {
        ok: false,
        message: 'server-app.log が見つかりません',
        logFilePath,
        logText: '',
        displayedLineCount: 0,
        fileSizeText: '---',
        lastUpdated: '---'
      };
    }

    // ログファイルの情報を取得
    const stat = fs.statSync(logFilePath);

    // -------------------------------------------------------
    // ✅ server-app.log を全文取得
    // -------------------------------------------------------
    // 注意：
    // ログが何百MBある場合、この処理で全文をメモリに読み込む。
    // そのため、ログ容量が大きい現場では動作が重くなる可能性あり。
    // 旧起動スクリプトが付けた余分な日時を除き、[日時]から始まるログを配信する。
    // 元のログファイルは保持する。修正前に記録された行にも適用する。
    const logText = fs.readFileSync(logFilePath, 'utf8').replace(
      /^\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} .*?(?=\[\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\])/gm,
      ''
    );

    // 行数を数える
    // 空ファイルなら 0 行にする
    const displayedLineCount = logText
      ? logText.split(/\r?\n/).length
      : 0;

    return {
      ok: true,
      message: 'ログ取得成功',
      logFilePath,
      logText,
      displayedLineCount,
      fileSizeBytes: stat.size,
      fileSizeText: formatFileSize(stat.size),
      lastUpdated: formatLogDate(stat.mtime)
    };

  } catch (error) {
    return {
      ok: false,
      message: error.message,
      logFilePath,
      logText: '',
      displayedLineCount: 0,
      fileSizeText: '---',
      lastUpdated: '---'
    };
  }
  

}

// -----------------------------------------------------------
// ✅ 関数
// 接続中のブラウザへログ内容を一斉送信する
// -----------------------------------------------------------
function broadcastLog() {
  // 1回の更新につき読み取り・JSON変換は1回だけ行い、同じ内容を全接続へ送る。
  const data = readServerLog();
  const payload = `data: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    client.write(payload);
  }
}

// -----------------------------------------------------------
// ✅ 関数
// server-app.log の変更監視を開始する
// -----------------------------------------------------------
function startWatchingLogFile() {
  // すでに監視中なら何もしない
  if (isWatching) {
    return;
  }

  // ファイルがない状態で fs.watch するとエラーになりやすいため、存在確認する
  if (!fs.existsSync(logFilePath)) {
    console.log('server-app.log がまだ存在しないため、監視開始を保留します:', logFilePath);
    return;
  }

  isWatching = true;

  fs.watch(logFilePath, () => {
    // fs.watch は1回の保存で複数回発火することがある
    // そのため少し待ってから1回だけ配信する
    clearTimeout(watchTimer);

    watchTimer = setTimeout(() => {
      broadcastLog();
    }, 150);
  });

  console.log('server-app.log の監視を開始しました:', logFilePath);
}

// -----------------------------------------------------------
// ✅ API
// 現在のログを1回取得する
// -----------------------------------------------------------
router.get('/log', (req, res) => {
  const data = readServerLog();

  if (!data.ok) {
    res.status(404).json(data);
    return;
  }

  res.json(data);
});

// -----------------------------------------------------------
// ✅ API
// SSEでログ更新をブラウザへ通知する
// -----------------------------------------------------------
router.get('/stream', (req, res) => {
  // SSE用ヘッダー
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // すぐにヘッダーを送る
  res.flushHeaders?.();

  // 応答を閉じずに保持し、変更があったときに同じ接続へログ全体を再送する。
  // 接続中ブラウザ一覧に追加
  clients.push(res);

  // 接続直後にも現在のログを送る
  const firstData = readServerLog();
  res.write(`data: ${JSON.stringify(firstData)}\n\n`);

  // ログ監視開始
  startWatchingLogFile();

  // ブラウザが閉じられたとき、clients から削除する
  req.on('close', () => {
    const index = clients.indexOf(res);

    if (index !== -1) {
      clients.splice(index, 1);
    }
  });
});

export default router;
