// ── 🔄 開発用サーバーの起動 ───────────────────────────────
// nodemonで業務サーバーを起動し、コード変更時に再起動できるようにする。
// サーバーの出力を端末へ表示しながら、業務ログのファイルにも保存する。

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { stripVTControlCharacters } from 'node:util';
import { appendLog as writeLog, formatLogMessage } from '../middleware/logger.js';

// 開発ログ画面は業務サーバー内に登録し、ポートの追加を避ける。
const logFile = 'log/server-app.log';
const appendLog = text => {
  writeLog(text, logFile);
};

// -----------------------------------------------------------
// 🔄 nodemonと業務サーバーの出力を、端末とログへ同じ内容で送る
// -----------------------------------------------------------
// npm自身がこのスクリプトより前に表示する起動見出しも、ファイルに残す。
if (process.env.npm_lifecycle_event) {
  appendLog(`\n> ${process.env.npm_package_name}@${process.env.npm_package_version} ${process.env.npm_lifecycle_event}\n> ${process.env.npm_lifecycle_script}\n\n`);
}

const nodemonPath = fileURLToPath(import.meta.resolve('nodemon/bin/nodemon.js'));
const nodemonArgs = ['server.js'];

// nodemonの既定の色を維持する（起動は緑、案内は黄、エラーは赤）。
const child = spawn(process.execPath, [nodemonPath, ...nodemonArgs], {
  cwd: new URL('../', import.meta.url),
  env: { ...process.env, APP_LOG_CAPTURED: '1', APP_DEV_SERVER: '1' },
  stdio: ['pipe', 'pipe', 'pipe']
});

// チャンクの途中で日本語や改行が分断されても、1行ずつ正しく復元する。
function capture(stream, destination) {
  const decoder = new StringDecoder('utf8');
  let pending = '';

  function write(line) {
    // 業務サーバーから渡されたconsole出力は、表示用と保存用を分けて扱う。
    if (line.startsWith('\x1eAPP_LOG ')) {
      const entry = JSON.parse(line.slice('\x1eAPP_LOG '.length));
      destination.write(entry.terminal + '\n');
      appendLog(stripVTControlCharacters(entry.log) + '\n');
      return;
    }

    // 旧形式の日時が新形式の前に重なっていた場合も、角括弧付きの日時だけ残す。
    line = line.replace(/^\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} .*?(?=\[\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\])/, '');
    // 日時・IP・ログレベルは業務サーバー側だけで付ける。
    // ここでは追加せず、nodemonの色や複数行のconsole出力もそのまま端末へ渡す。
    const text = line + '\n';
    destination.write(text);
    appendLog(stripVTControlCharacters(text));
  }

  stream.on('data', chunk => {
    pending += decoder.write(chunk);
    let end;
    while ((end = pending.indexOf('\n')) !== -1) {
      write(pending.slice(0, end).replace(/\r$/, ''));
      pending = pending.slice(end + 1);
    }
  });
  stream.on('end', () => {
    pending += decoder.end();
    if (pending) write(pending);
  });
}

capture(child.stdout, process.stdout);
capture(child.stderr, process.stderr);

// ターミナルでrsと入力すると、従来どおりnodemonへ再起動要求を送れる。
process.stdin.pipe(child.stdin);
child.stdin.on('error', error => {
  if (error.code !== 'EPIPE') throw error;
});

child.on('error', error => {
  const text = formatLogMessage('error', '開発サーバーの起動に失敗しました: ' + error.message) + '\n';
  process.stderr.write(text);
  appendLog(text);
  process.stdin.unpipe(child.stdin);
  process.stdin.pause();
  process.exitCode = 1;
});
child.on('close', code => {
  process.stdin.unpipe(child.stdin);
  process.stdin.pause();
  process.exitCode = code ?? 1;
});

// Ctrl+Cや終了要求を、ログ画面も配信している業務サーバーへ渡す。
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

