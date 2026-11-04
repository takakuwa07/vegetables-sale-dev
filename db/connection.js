// ── 🗄️ 複数データベースへの共通接続 ────────────────────────
// common_dbを起点に利用DBの一覧を読み、起動時に有効な接続を確認する。
// APIは接続先名で共有プールを取得し、失敗した接続は次回に再試行する。

import sql from 'mssql';
import env from '../config/env.js';

const pools = new Map();
const connecting = new Map();
const configurations = new Map([['common', env.commonDatabase]]);

// 共通DBの接続先台帳を読み、登録されたDBを全て接続する。
export async function initializeDatabaseConnections() {
  const common = await getDatabaseConnection('common');

  const result = await common.request().query(`
    SELECT connection.connection_name, connection.database_name
    FROM dbo.cfg_database_connection AS connection
    ORDER BY connection.connection_name
  `);

  const rows = result.recordset;

  const names = new Set(['common']);
  for (const row of rows) {
    const name = row.connection_name;
    const database = row.database_name;
    if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name) || names.has(name)) {
      throw new Error('DB接続台帳の接続名が不正または重複しています');
    }
    if (typeof database !== 'string' || !/^[a-z][a-z0-9_]*$/.test(database)) {
      throw new Error(`DB接続台帳のデータベース名が不正です: ${name}`);
    }
    names.add(name);
    configurations.set(name, { ...env.commonDatabase, database });
  }

  for (const row of rows) {
    await getDatabaseConnection(row.connection_name);
  }
}

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
