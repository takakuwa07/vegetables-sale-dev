// 実DBに接続せず、接続設定専用DBの利用とアプリ・環境別の台帳参照を確認する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { databaseNameForEnvironment } from '../config/database-name.js';

// DBドライバーだけを差し替え、接続処理本体とSQLファイルは実コードを使う。
async function connectionFixture(t, rows, environment = 'production') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-connections-test-'));
  const source = path.resolve(import.meta.dirname, '..');

  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'app-connections-test-')));
    fs.rmSync(root, { recursive: true, force: true });
  });

  for (const file of ['db/connection.js', 'db/sql.js', 'db/queries/select_database_connections.sql', 'config/database-name.js']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(source, file), path.join(root, file));
  }

  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config/env.js'), `export default {
    environment: ${JSON.stringify(environment)}, configurationApplication: 'test-app',
    configurationDatabase: { database: ${JSON.stringify(databaseNameForEnvironment('application_config_db', environment))}, server: 'test', user: 'reader' }
  };`);

  const driver = path.join(root, 'node_modules/mssql');
  fs.mkdirSync(driver, { recursive: true });
  fs.writeFileSync(path.join(driver, 'package.json'), '{"type":"module","main":"index.js"}');
  fs.writeFileSync(path.join(driver, 'index.js'), `
    export const state = { connections: [], requests: [], rows: ${JSON.stringify(rows)} };
    class ConnectionPool {
      constructor(config) { this.config = config; }
      async connect() { state.connections.push(this.config); this.connected = true; return this; }
      request() {
        const inputs = {};
        return {
          input(name, type, value) { inputs[name] = value; return this; },
          async query(query) { state.requests.push({ inputs, query }); return { recordset: state.rows }; }
        };
      }
    }
    export default { ConnectionPool, NVarChar: size => size, VarChar: size => size };
  `);

  const module = await import(pathToFileURL(path.join(root, 'db/connection.js')));
  const { state } = await import(pathToFileURL(path.join(driver, 'index.js')));
  return { module, state };
}

test('専用DBからアプリ・環境に対応する接続を取得し、旧接続名は使わない', async t => {
  const { module, state } = await connectionFixture(t, [
    { connection_name: 'application', database_name: 'test_data_db' },
  ]);

  await module.initializeDatabaseConnections();

  assert.deepEqual(state.connections.map(config => config.database), [
    'application_config_db', 'test_data_db',
  ]);
  assert.deepEqual(state.requests[0].inputs, {
    applicationName: 'test-app', environmentName: 'production',
  });
  assert.throws(() => module.getDatabaseConnection('common'), /未設定/);

  // 接続済みの業務プールを再利用し、新しい接続を増やさない。
  await module.getDatabaseConnection('application');
  assert.equal(state.connections.length, 2);
});

test('必要な業務接続の欠落と、専用DBの接続名の上書きを拒否する', async t => {
  const missing = await connectionFixture(t, []);
  await assert.rejects(missing.module.initializeDatabaseConnections(), /有効なapplication接続がありません/);

  const reserved = await connectionFixture(t, [
    { connection_name: 'configuration', database_name: 'other_db' },
  ]);
  await assert.rejects(reserved.module.initializeDatabaseConnections(), /不正または重複/);
});

test('開発環境では設定DB・業務DBの両方に-devを付けて接続する', async t => {
  const { module, state } = await connectionFixture(t, [
    { connection_name: 'application', database_name: 'test_data_db' },
  ], 'development');

  await module.initializeDatabaseConnections();

  assert.deepEqual(state.connections.map(config => config.database), [
    'application_config_db-dev', 'test_data_db-dev',
  ]);
  assert.equal(state.requests[0].inputs.environmentName, 'development');
});
