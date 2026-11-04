// ── 🔌 公開ポートの設定を確認 ─────────────────────────────
// 一時的な .env ファイルから、環境別のポート番号を読み取れるか試す。
// 設定漏れ、不正な番号、番号の重複を拒否することも確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readPorts } from '../config/ports.js';
import { ensureEnvironmentPortsDistinct } from '../scripts/deploy-prod.js';

test('公開ポートは環境別envから読み、欠落・不正値・重複を拒否する', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ports-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, '.env.development');

  fs.writeFileSync(file, 'APP_PORT=3432\nLOG_PORT=3532\nLIVE_RELOAD_PORT=35732\n');
  assert.deepEqual(readPorts(root, 'development'), {
    APP_PORT: 3432, LOG_PORT: 3532, LIVE_RELOAD_PORT: 35732
  });

  fs.writeFileSync(file, 'APP_PORT=3432\nLOG_PORT=3532\n');
  assert.throws(() => readPorts(root, 'development'), /LIVE_RELOAD_PORT/);

  fs.writeFileSync(file, 'APP_PORT=abc\nLOG_PORT=3532\nLIVE_RELOAD_PORT=35732\n');
  assert.throws(() => readPorts(root, 'development'), /APP_PORT/);

  fs.writeFileSync(file, 'APP_PORT=3432\nLOG_PORT=3532\nLIVE_RELOAD_PORT=3432\n');
  assert.throws(() => readPorts(root, 'development'), /重複/);

  fs.writeFileSync(file, 'APP_PORT=3432\nLIVE_RELOAD_PORT=35732\n');
  assert.throws(() => readPorts(root, 'development'), /LOG_PORT/);
  fs.writeFileSync(file, 'APP_PORT=3432\nLOG_PORT=3432\nLIVE_RELOAD_PORT=35732\n');
  assert.throws(() => readPorts(root, 'development'), /重複/);
});

test('本番の共通サーバーにはAPP_PORTとLOG_PORTが必要', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'production-ports-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '.env.production'), 'APP_PORT=2050\n');
  assert.throws(() => readPorts(root, 'production'), /LOG_PORT/);
  fs.writeFileSync(path.join(root, '.env.production'), 'APP_PORT=2050\nLOG_PORT=2056\n');
  assert.deepEqual(readPorts(root, 'production'), { APP_PORT: 2050, LOG_PORT: 2056 });
});

test('デプロイ前に開発と本番のポート重複を拒否する', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-ports-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const development = path.join(root, 'development');
  const production = path.join(root, 'production');
  fs.mkdirSync(development);
  fs.mkdirSync(production);
  fs.writeFileSync(path.join(development, '.env.development'), 'APP_PORT=3100\nLOG_PORT=3106\nLIVE_RELOAD_PORT=33100\n');
  fs.writeFileSync(path.join(production, '.env.production'), 'APP_PORT=3100\nLOG_PORT=2106\n');
  assert.throws(() => ensureEnvironmentPortsDistinct(development, production), /3100（開発 APP_PORT \/ 本番 APP_PORT）/);

  fs.writeFileSync(path.join(production, '.env.production'), 'APP_PORT=2100\nLOG_PORT=33100\n');
  assert.throws(() => ensureEnvironmentPortsDistinct(development, production), /33100（開発 LIVE_RELOAD_PORT \/ 本番 LOG_PORT）/);

  fs.writeFileSync(path.join(production, '.env.production'), 'APP_PORT=33100\nLOG_PORT=2106\n');
  assert.throws(() => ensureEnvironmentPortsDistinct(development, production), /33100（開発 LIVE_RELOAD_PORT \/ 本番 APP_PORT）/);

  fs.writeFileSync(path.join(production, '.env.production'), 'APP_PORT=2100\nLOG_PORT=2106\n');
  assert.deepEqual(ensureEnvironmentPortsDistinct(development, production), { APP_PORT: 2100, LOG_PORT: 2106 });
  fs.writeFileSync(path.join(production, '.env.production'), 'APP_PORT=2100\nLOG_PORT=3106\n');
  assert.throws(() => ensureEnvironmentPortsDistinct(development, production), /3106（開発 LOG_PORT \/ 本番 LOG_PORT）/);
  fs.writeFileSync(path.join(production, '.env.production'), 'APP_PORT=33100\nLOG_PORT=2106\n');
  assert.throws(() => ensureEnvironmentPortsDistinct(development, production), /33100（開発 LIVE_RELOAD_PORT \/ 本番 APP_PORT）/);
});
