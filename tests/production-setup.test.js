// ── 📁 本番設定の安全な初期化 ────────────────────────────
// 仮フォルダだけを使い、接続情報の引き継ぎと既存設定の保護を確認する。
// 設定を作るだけで、公開・DB接続・秘密値の出力を行わないことを試す。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

test('本番envは開発接続情報を引き継ぎ、秘密値を表示せず既存ファイルを保持する', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-setup-test-'));
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'app-setup-test-')));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const development = path.join(root, 'development');
  const production = path.join(root, 'production');
  fs.mkdirSync(development);
  const source = path.resolve(import.meta.dirname, '..');
  for (const name of ['scripts/setup-production.js', 'scripts/deploy-prod.js', 'scripts/production-gateway.js',
    'scripts/production-log-retention.js', 'config/ports.js', '.env.production.example']) {
    fs.mkdirSync(path.dirname(path.join(development, name)), { recursive: true });
    fs.copyFileSync(path.join(source, name), path.join(development, name));
  }
  fs.writeFileSync(path.join(development, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(development, '.env.development'), [
    'DB_USER=reader', 'DB_PASSWORD="test#pass$word"', 'DB_SERVER=127.0.0.1', 'DB_PORT=1433',
    'DB_ENCRYPT=false', 'DB_TRUST_SERVER_CERTIFICATE=true', 'DB_CONFIG_NAME=application_config_db',
    `DEPLOY_TARGET_DIR=${production.replaceAll('\\', '/')}`, '',
  ].join('\n'));
  const run = () => spawnSync(process.execPath, [path.join(development, 'scripts/setup-production.js')], { encoding: 'utf8' });
  const initial = run();
  assert.equal(initial.status, 0, initial.stderr);
  assert.doesNotMatch(initial.stdout + initial.stderr, /test#pass|reader/);
  const file = path.join(production, '.env.production');
  const values = parseEnv(fs.readFileSync(file, 'utf8'));
  assert.equal(values.DB_PASSWORD, 'test#pass$word');
  assert.equal(values.DB_SERVER, '127.0.0.1');
  assert.equal(values.DB_CONFIG_NAME, 'application_config_db');
  assert.equal(values.APP_PORT, '3001');
  assert.equal(values.LOG_PORT, '3601');
  const previous = fs.readFileSync(file, 'utf8') + '# 既存設定を保持\n';
  fs.writeFileSync(file, previous);
  assert.equal(run().status, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), previous);
  assert.equal(fs.existsSync(path.join(production, 'releases')), false);
});
