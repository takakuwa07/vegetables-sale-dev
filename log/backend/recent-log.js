// 📜 ログは末尾から必要な範囲だけを読み、保存済みファイル自体は変更しない。
import fs from 'node:fs';

export const maximumLogLines = 10000;
export const maximumLogBytes = 16 * 1024 * 1024;

// 🧮 行数に加えて読取バイト数も制限し、改行のない巨大なログでもメモリ使用量を抑える。
export function readRecentLog(file, {
  maxLines = maximumLogLines,
  maxBytes = maximumLogBytes,
  chunkSize = 64 * 1024,
} = {}) {
  for (const value of [maxLines, maxBytes, chunkSize]) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error('ログの読取上限には正の整数を指定してください');
    }
  }

  const descriptor = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(descriptor);
    let position = stat.size;
    let bytesRead = 0;
    let newlineCount = 0;
    const chunks = [];

    // 🔎 1つ多く改行を探し、先頭の読取断片を完全な1行として数えないようにする。
    while (position > 0 && newlineCount <= maxLines && bytesRead < maxBytes) {
      const length = Math.min(chunkSize, position, maxBytes - bytesRead);
      position -= length;
      const buffer = Buffer.allocUnsafe(length);
      const size = fs.readSync(descriptor, buffer, 0, length, position);
      if (size === 0) {
        break;
      }
      const chunk = buffer.subarray(0, size);
      chunks.push(chunk);
      bytesRead += size;
      for (const byte of chunk) {
        if (byte === 10) {
          newlineCount++;
        }
      }
    }

    // 🔤 バイト列を結合してからUTF-8へ変換し、チャンク境界の日本語を分断しない。
    const buffer = Buffer.concat(chunks.reverse());
    let start = 0;
    if (position > 0) {
      // 上限が1行の途中に当たった場合も、不完全なUTF-8の先頭バイトは表示しない。
      while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) {
        start++;
      }
    }
    const text = buffer.subarray(start).toString('utf8');
    const lines = text ? text.split('\n') : [];
    if (lines.at(-1) === '') {
      lines.pop();
    }
    if (position > 0 && lines.length > 1) {
      lines.shift();
    }

    const recentLines = lines.slice(-maxLines).map(line => line.replace(/\r$/, ''));
    return {
      logText: recentLines.length ? recentLines.join('\n') + '\n' : '',
      displayedLineCount: recentLines.length,
      truncated: position > 0 || lines.length > maxLines,
      byteLimited: position > 0 && bytesRead >= maxBytes && newlineCount <= maxLines,
      maxLines,
      bytesRead,
      stat,
    };
  } finally {
    fs.closeSync(descriptor);
  }
}
