// ── 🗄️ 複数データベースへの共通接続 ────────────────────────
// 接続設定専用DBを起点に、このアプリ・環境で有効な業務DBの接続を確認する。
// APIは接続先名で共有プールを取得し、失敗した接続は次回に再試行する。

import sql from 'mssql';

import env from '../config/env.js';
import { readSql } from './sql.js';
import { databaseNameForEnvironment } from '../config/database-name.js';

const connectionsQuery = readSql(new URL('./queries/select_database_connections.sql', import.meta.url));

// 接続済みプールと接続中のPromiseを分け、APIごとの接続作成や同時接続の重複を避ける。
const pools = new Map();
const connecting = new Map();
const configurations = new Map([['configuration', env.configurationDatabase]]);

// 専用DBの台帳から、このアプリ・環境で有効な接続だけを取得して起動時に確認する。
export async function initializeDatabaseConnections() {
  const configuration = await getDatabaseConnection('configuration');

  const result = await configuration.request()
    .input('applicationName', sql.NVarChar(100), env.configurationApplication)
    .input('environmentName', sql.VarChar(20), env.environment)
    .query(connectionsQuery);
  const rows = result.recordset;

  // 台帳から追加できるのは接続名とDB名だけ。認証・サーバー設定は専用DBとそろえる。
  const names = new Set(['configuration']);
  for (const row of rows) {
    const name = row.connection_name;
    const database = row.database_name;
    if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name) || names.has(name)) {
      throw new Error('DB接続台帳の接続名が不正または重複しています');
    }
    // 台帳も基底名で管理し、環境ごとの実DB名への変換は設定DBと共通の規則を使う。
    const resolvedDatabase = databaseNameForEnvironment(database, env.environment);

    names.add(name);
    configurations.set(name, { ...env.configurationDatabase, database: resolvedDatabase });
  }

  if (!names.has('application')) {
    throw new Error(`接続設定DBに${env.configurationApplication} / ${env.environment}の有効なapplication接続がありません。npm run db:setupと台帳の設定を確認してください`);
  }

  for (const row of rows) {
    await getDatabaseConnection(row.connection_name);
  }
}

// configurationやapplicationなどの接続名に対応するプールを、Promiseとして返す。
// 接続済みなら再利用し、接続失敗時はキャッシュを外して次回の再接続を可能にする。
export function getDatabaseConnection(name) {
  const config = configurations.get(name);
  if (!config) throw new Error(`未設定のデータベース接続先です: ${name}`);

  const pool = pools.get(name);
  if (pool?.connected) return Promise.resolve(pool);
  if (connecting.has(name)) return connecting.get(name);

  // 同じ接続先への同時呼び出しは、1つの接続完了を共有する。
  const pending = new sql.ConnectionPool(config).connect()
    .then(connected => {
      pools.set(name, connected);
      console.info(`✅ SQL Serverのデータベースに接続しました: ${config.database}`);
      return connected;
    })
    .catch(error => {
      pools.delete(name);
      throw error;
    })
    .finally(() => connecting.delete(name));

  connecting.set(name, pending);
  return pending;
}

export { sql };
