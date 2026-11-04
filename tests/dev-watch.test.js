// nodemonのminimatchを脆弱性修正版へ差し替えても、開発用の監視対象が変わらないことを確認する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const match = require('nodemon/lib/monitor/match.js');
const config = JSON.parse(fs.readFileSync(new URL('../nodemon.json', import.meta.url), 'utf8'));

test('開発監視はサーバー・設定・SQLを検知し、画面・ログ・依存ファイルを除外する', () => {
  const rules = match.rulesToMonitor(config.watch, config.ignore, { dirs: [] });
  for (const file of [
    'server.js', 'runtime.json', '.env.development', 'config/ports.js',
    'middleware/common.js', 'db/connection.js', 'backend/queries/select_record_columns.sql',
  ]) {
    assert.equal(match([file], [...rules], config.ext).result.length, 1, file);
  }
  for (const file of [
    'public/records.js', 'node_modules/express/index.js',
    'log/server-app.log', 'backend/debug.log', 'backend/notes.txt',
  ]) {
    assert.equal(match([file], [...rules], config.ext).result.length, 0, file);
  }
});
