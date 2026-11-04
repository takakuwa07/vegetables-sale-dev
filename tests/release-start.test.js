// ── 🚀 配布された実コードの起動確認 ─────────────────────
// 仮の本番フォルダでアプリとログを起動し、一覧API・公開状態まで確認する。
// 実DBへの接続だけを代替し、接続失敗時にはHTTP起動を止めることも試す。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { deploy } from '../scripts/deploy-prod.js';
import { manageGateway, gatewayCommand, atomicJson } from '../scripts/production-gateway.js';

test('実アプリを配布し、DB失敗時の起動停止と成功時のAPI・公開通知を確認する', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vegetable-release-test-'));
  const source = path.resolve(import.meta.dirname, '..');
  const directory = path.join(root, 'releases', 'actual');
  fs.writeFileSync(path.join(root, '.env.production'), [
    'DB_USER=test', 'DB_PASSWORD=test', 'DB_SERVER=127.0.0.1', 'DB_PORT=1433',
    'DB_ENCRYPT=false', 'DB_TRUST_SERVER_CERTIFICATE=true', 'APP_PORT=3001', 'LOG_PORT=3801', '',
  ].join('\n'));
  fs.mkdirSync(path.join(root, 'log'));
  const manager = await manageGateway(root, [0, 0], '127.0.0.1');
  t.after(async () => {
    await manager.close();
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'vegetable-release-test-')));
    fs.rmSync(root, { recursive: true, force: true });
  });
  deploy(source, directory, { updateMode: 'force', version: '261104-001-TestUser' });
  for (const name of ['.git', '.env.development', '.env.production', 'tests', 'scripts', 'README.md']) {
    assert.equal(fs.existsSync(path.join(directory, name)), false);
  }
  assert.throws(() => deploy(source, directory, { version: '261104-002-TestUser' }), /未使用/);
  assert.throws(() => deploy(source, path.join(source, 'invalid'), { validateOnly: true }), /同一・親子/);
  fs.symlinkSync(path.join(source, 'node_modules'), path.join(directory, 'node_modules'), 'junction');
  fs.symlinkSync(path.join(source, 'log/node_modules'), path.join(directory, 'log/node_modules'), 'junction');
  fs.writeFileSync(path.join(directory, 'db/connection.js'), `
    import sql from 'mssql'; export { sql };
    export async function initializeDatabaseConnections() { throw new Error('テスト用DB接続失敗'); }
    export async function getDatabaseConnection() { throw new Error('テスト用DB接続失敗'); }
  `);
  const failed = spawnSync(process.execPath, [path.join(directory, 'server.js')], {
    cwd: root, env: { ...process.env, PRODUCTION_INTERNAL_PORT: '0' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(failed.status, 1);
  assert.match(failed.stdout + failed.stderr, /テスト用DB接続失敗/);

  fs.writeFileSync(path.join(directory, 'db/connection.js'), `
    import sql from 'mssql'; export { sql };
    export async function initializeDatabaseConnections() {}
    export async function getDatabaseConnection() {
      return { request() { return { input() { return this; }, async query(query) {
        if (query.includes('DB_NAME()')) return { recordset: [{ name: 'vegetables_maintenance_db' }] };
        if (query.includes('sys.columns')) return { recordset: [
          { name: 'sale_id', type: 'bigint', position: 1, keyOrder: 1 },
          { name: 'vegetable_name', type: 'nvarchar', position: 2, keyOrder: 0 }
        ] };
        if (query.includes('COUNT_BIG')) return { recordset: [{ total: 1 }] };
        return { recordset: [{ sale_id: '9007199254740993', vegetable_name: '<script>表示用文字列</script>' }] };
      } }; } };
    }
  `);
  await gatewayCommand(root, 'prepare', 'actual');
  await gatewayCommand(root, 'publish');
  const state = await gatewayCommand(root, 'status');
  const base = `http://127.0.0.1:${state.ports[0]}`;
  assert.equal((await fetch(base + '/api/deployment-policy')).status, 503);
  atomicJson(path.join(root, '.deployment-ready.json'), { version: '261104-001-TestUser' });
  const html = await fetch(base + '/');
  assert.equal(html.status, 200);
  assert.equal(html.headers.get('cache-control'), 'no-store');
  assert.match(await html.text(), /data-version="261104-001-TestUser"/);
  const result = await (await fetch(base + '/api/sales')).json();
  assert.equal(result.ok, true);
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].sale_id, '9007199254740993');
  assert.equal((await fetch(base + '/api/sales?pageSize=999')).status, 400);
  assert.equal((await fetch(base + '/api/sales?sort=unknown')).status, 400);
  assert.equal((await fetch(base + '/api/unknown')).status, 404);
  assert.equal((await fetch(base + '/.env.production')).status, 404);
  assert.deepEqual(await (await fetch(base + '/api/deployment-policy')).json(), {
    status: 'ok', version: '261104-001-TestUser', updateMode: 'force',
  });
  assert.equal((await fetch(`http://127.0.0.1:${state.ports[1]}/server-log-viewer/index-log-viewer.html`)).status, 200);
  assert.match(fs.readFileSync(path.join(root, 'log/server-app.log'), 'utf8'), /野菜売上アプリを起動しました: production/);
});
