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
// ✅ 表示する最大行数
// ログファイルが何百MBになっても、ブラウザへ送るのは最新1000行だけにする
// -----------------------------------------------------------
// const MAX_DISPLAY_LINES = 1000;

// -----------------------------------------------------------
// ✅ ファイル末尾から読むときのサイズ
// 64KBずつ後ろから読んで、1000行集まったら止める
// -----------------------------------------------------------
// const READ_CHUNK_SIZE = 64 * 1024;

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
// ログファイルの末尾から最新行だけ読む
// -----------------------------------------------------------
// function readLastLines(filePath, maxLines) {
//   // ファイル情報を取得
//   const stat = fs.statSync(filePath);

//   // ファイルが空なら空文字を返す
//   if (stat.size === 0) {
//     return {
//       logText: '',
//       displayedLineCount: 0,
//       fileSizeBytes: stat.size,
//       fileSizeText: formatFileSize(stat.size)
//     };
//   }

//   // ファイルを開く
//   const fd = fs.openSync(filePath, 'r');

//   try {
//     let position = stat.size;
//     let chunks = [];
//     let lineCount = 0;

//     // -------------------------------------------------------
//     // ✅ ファイルの後ろから少しずつ読む
//     // -------------------------------------------------------
//     // 例：
//     // 1回目：末尾64KB
//     // 2回目：その前の64KB
//     // 3回目：さらに前の64KB
//     //
//     // 1000行分が集まったら、それ以上は読まない。
//     // これにより、ログファイルが何百MBでも全文読み込みしない。
//     // -------------------------------------------------------
//     while (position > 0 && lineCount <= maxLines) {
//       const readSize = Math.min(READ_CHUNK_SIZE, position);
//       position = position - readSize;

//       const buffer = Buffer.alloc(readSize);

//       fs.readSync(fd, buffer, 0, readSize, position);

//       const chunkText = buffer.toString('utf8');

//       // 後ろから読んでいるので、先頭に追加して元の順番へ戻す
//       chunks.unshift(chunkText);

//       // 現時点で集まった改行数を数える
//       lineCount = chunks.join('').split(/\r?\n/).length;
//     }

//     // 読み取った範囲を1つの文字列にする
//     const text = chunks.join('');

//     // 改行で配列化
//     const lines = text.split(/\r?\n/);

//     // 最後が空行なら除外
//     if (lines[lines.length - 1] === '') {
//       lines.pop();
//     }

//     // 最新 maxLines 行だけ取得
//     const lastLines = lines.slice(-maxLines);

//     return {
//       // ここでは古い → 新しいの順番で返す
//       // 画面側で reverse して、新しい → 古いにする
//       logText: lastLines.join('\n'),
//       displayedLineCount: lastLines.length,
//       fileSizeBytes: stat.size,
//       fileSizeText: formatFileSize(stat.size)
//     };

//   } finally {
//     // ファイルを閉じる
//     fs.closeSync(fd);
//   }
// }

// -----------------------------------------------------------
// ✅ 関数
// ログファイルの中身を読み取り、画面用のオブジェクトにして返す
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
  
  // try {
  //   // ファイルが存在しない場合
  //   if (!fs.existsSync(logFilePath)) {
  //     return {
  //       ok: false,
  //       message: 'server-app.log が見つかりません',
  //       logFilePath,
  //       logText: '',
  //       displayedLineCount: 0,
  //       fileSizeText: '---',
  //       lastUpdated: '---'
  //     };
  //   }

  //   // ログファイルの情報を取得
  //   const stat = fs.statSync(logFilePath);

  //   // 最新1000行だけ取得
  //   const logData = readLastLines(logFilePath, MAX_DISPLAY_LINES);

  //   return {
  //     ok: true,
  //     message: 'ログ取得成功',
  //     logFilePath,
  //     logText: logData.logText,
  //     displayedLineCount: logData.displayedLineCount,
  //     maxDisplayLines: MAX_DISPLAY_LINES,
  //     fileSizeBytes: logData.fileSizeBytes,
  //     fileSizeText: logData.fileSizeText,
  //     lastUpdated: stat.mtime.toLocaleString('ja-JP')
  //   };

  // } catch (error) {
  //   return {
  //     ok: false,
  //     message: error.message,
  //     logFilePath,
  //     logText: '',
  //     displayedLineCount: 0,
  //     fileSizeText: '---',
  //     lastUpdated: '---'
  //   };
  // }
}

// -----------------------------------------------------------
// ✅ 関数
// 接続中のブラウザへログ内容を一斉送信する
// -----------------------------------------------------------
function broadcastLog() {
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
