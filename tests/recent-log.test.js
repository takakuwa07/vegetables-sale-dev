// 📜 実ファイルを使い、直近行・改行・日本語・巨大な1行の読取上限を確認する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRecentLog, maximumLogLines } from '../log/backend/recent-log.js';

function temporaryLog(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'app-recent-log-'));
  t.after(() => {
    assert.ok(directory.startsWith(path.join(os.tmpdir(), 'app-recent-log-')));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return path.join(directory, 'sample.log');
}

test('大量ログは末尾から10,000行だけ読み、追記後も元ファイルを保持する', t => {
  const file = temporaryLog(t);
  const original = Array.from({ length: 25000 }, (_, i) => `ログ行${i + 1} ${'確認用の文字列'.repeat(3)}`).join('\n') + '\n';
  fs.writeFileSync(file, original);
  const result = readRecentLog(file);
  assert.equal(result.displayedLineCount, maximumLogLines);
  assert.ok(result.logText.startsWith('ログ行15001 '));
  assert.ok(result.logText.trimEnd().endsWith('ログ行25000 ' + '確認用の文字列'.repeat(3)));
  assert.ok(result.bytesRead < result.stat.size);
  assert.equal(result.truncated, true);
  assert.equal(result.byteLimited, false);
  assert.equal(result.logText.includes('\ufffd'), false);
  assert.equal(fs.readFileSync(file, 'utf8'), original);

  fs.appendFileSync(file, '追加した行\n');
  const updated = readRecentLog(file);
  assert.equal(updated.displayedLineCount, maximumLogLines);
  assert.ok(updated.logText.startsWith('ログ行15002 '));
  assert.ok(updated.logText.endsWith('追加した行\n'));
  assert.equal(fs.readFileSync(file, 'utf8'), original + '追加した行\n');
});

test('空・末尾改行・CRLF・空行・未完の最終行を正しく数える', t => {
  const file = temporaryLog(t);
  for (const [text, expected, count] of [
    ['', '', 0], ['確認', '確認\n', 1], ['確認\n', '確認\n', 1],
    ['\n', '\n', 1], ['先頭\r\n\r\n末尾', '先頭\n\n末尾\n', 3],
    ['一\n二\n三\n', '二\n三\n', 2], ['一\n二\n三', '二\n三\n', 2],
  ]) {
    fs.writeFileSync(file, text);
    const result = readRecentLog(file, { maxLines: count === 2 ? 2 : 10000, chunkSize: 2 });
    assert.equal(result.logText, expected);
    assert.equal(result.displayedLineCount, count);
    assert.equal(result.logText.includes('\ufffd'), false);
  }
});

test('改行のない巨大な1行でも読取バイト数を制限する', t => {
  const file = temporaryLog(t);
  fs.writeFileSync(file, '日本語'.repeat(1000));
  const result = readRecentLog(file, { maxBytes: 100, chunkSize: 7 });
  assert.equal(result.bytesRead, 100);
  assert.equal(result.byteLimited, true);
  assert.equal(result.displayedLineCount, 1);
  assert.equal(result.logText.includes('\ufffd'), false);
  assert.ok(result.logText.trimEnd().endsWith('日本語'));
});

test('空行が多いログも上限を超えず、不正な上限は拒否する', t => {
  const file = temporaryLog(t);
  fs.writeFileSync(file, '\n'.repeat(12000));
  const result = readRecentLog(file);
  assert.equal(result.displayedLineCount, 10000);
  assert.equal(result.logText, '\n'.repeat(10000));
  assert.throws(() => readRecentLog(file, { maxLines: 0 }), /正の整数/);
  assert.throws(() => readRecentLog(file, { maxBytes: NaN }), /正の整数/);
});
