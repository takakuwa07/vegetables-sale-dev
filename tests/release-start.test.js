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
import application from '../config/application.js';

test('実アプリを配布し、DB失敗時の起動停止と成功時のAPI・公開通知を確認する', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-release-test-'));
  const source = path.resolve(import.meta.dirname, '..');
  const directory = path.join(root, 'releases', 'actual');
  fs.writeFileSync(path.join(root, '.env.production'), [
    'DB_USER=test', 'DB_PASSWORD=test', 'DB_SERVER=127.0.0.1', 'DB_PORT=1433',
    'DB_CONFIG_NAME=application_config_db',
    'DB_ENCRYPT=false', 'DB_TRUST_SERVER_CERTIFICATE=true', 'APP_PORT=3001', 'LOG_PORT=3601', '',
  ].join('\n'));
  fs.mkdirSync(path.join(root, 'log'));
  const manager = await manageGateway(root, [0, 0], '127.0.0.1');
  t.after(async () => {
    await manager.close();
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'app-release-test-')));
    fs.rmSync(root, { recursive: true, force: true });
  });
  deploy(source, directory, { updateMode: 'force', version: '261104-001-TestUser' });
  // コピー先で識別子・DB・表・URLを変えても、共通コードを修正せず起動できることを確認する。
  const configuredApplication = {
    ...application, id: 'test-app', title: 'テストアプリ',
    data: { database: 'test_data_db', schema: 'test_schema', table: 't_records', apiPath: '/api/items' },
  };
  fs.writeFileSync(path.join(directory, 'config/application.json'), JSON.stringify(configuredApplication));

  // SQLの読込処理と各SQLファイルが、実際の本番配布にも含まれることを確認する。
  for (const file of ['db/sql.js', 'db/queries/select_database_connections.sql',
    'db/queries/select_current_database.sql', 'backend/queries/check_records_access.sql',
    'backend/queries/count_records.sql', 'backend/queries/select_records.sql',
    'backend/queries/record_fragments.sql', 'backend/queries/select_record_columns.sql']) {
    assert.ok(fs.existsSync(path.join(directory, file)), file);
  }

  for (const name of ['.git', '.env.development', '.env.production', 'tests', 'scripts', 'README.md', 'database-setup', 'db/setup']) {
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
    import application from '../config/application.js';
    import { databaseNameForEnvironment } from '../config/database-name.js';
    export async function initializeDatabaseConnections() {}
    export async function getDatabaseConnection() {
      return { request() { const inputs = {}; return { input(name, type, value) { inputs[name] = value; return this; }, async query(query) {
        if (query.includes('current-database')) return { recordset: [{ name: databaseNameForEnvironment(application.data.database, 'production') }] };
        if (query.includes('records-columns')) {
          if (inputs.schemaName !== application.data.schema || inputs.tableName !== application.data.table) throw new Error('参照先の設定が一致しません');
          return { recordset: [
          { name: 'record_id', type: 'bigint', position: 1, keyOrder: 1 },
          { name: 'item_name', type: 'nvarchar', position: 2, keyOrder: 0 }
          ] };
        }
        if (!query.includes('[' + application.data.schema + '].[' + application.data.table + ']')) throw new Error('参照先のSQLが設定と一致しません');
        if (query.includes('records-count')) return { recordset: [{ total: 1 }] };
        return { recordset: [{ record_id: '9007199254740993', item_name: '<script>表示用文字列</script>' }] };
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
  const htmlText = await html.text();
  assert.match(htmlText, /data-version="261104-001-TestUser"/);
  assert.ok(htmlText.includes(configuredApplication.title));
  const result = await (await fetch(base + configuredApplication.data.apiPath)).json();
  assert.equal(result.ok, true);
  assert.equal(result.total, 1);
  assert.equal(result.database, configuredApplication.data.database);
  assert.equal(result.rows[0].record_id, '9007199254740993');
  assert.equal((await fetch(base + configuredApplication.data.apiPath + '?pageSize=999')).status, 400);
  assert.equal((await fetch(base + configuredApplication.data.apiPath + '?sort=unknown')).status, 400);
  assert.equal((await fetch(base + '/api/unknown')).status, 404);
  assert.equal((await fetch(base + '/.env.production')).status, 404);
  assert.deepEqual(await (await fetch(base + '/api/deployment-policy')).json(), {
    status: 'ok', version: '261104-001-TestUser', updateMode: 'force',
  });
  assert.equal((await fetch(`http://127.0.0.1:${state.ports[1]}/server-log-viewer/index-log-viewer.html`)).status, 200);
  assert.match(fs.readFileSync(path.join(root, 'log/server-app.log'), 'utf8'), /アプリを起動しました: production/);
});
