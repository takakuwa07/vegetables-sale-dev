// 初期構築SQLを順番に実行し、本番・開発のDB、テーブル、ダミーデータを準備する。
// database-setupは初期構築専用で、本番へのデプロイには含めない。

import sql from 'mssql';

import env from '../config/env.js';
import { databaseNameForEnvironment } from '../config/database-name.js';
import { readSql } from '../db/sql.js';
import application from '../config/application.js';
import { generateDatabaseSetup } from './generate-database-setup.js';

const setupFiles = [
  new URL('../database-setup/01_create_databases.sql', import.meta.url),
  new URL('../database-setup/02_create_configuration_tables.sql', import.meta.url),
  new URL('../database-setup/03_create_application_tables.sql', import.meta.url),
  new URL('../database-setup/04_insert_connection_settings.sql', import.meta.url),
  new URL('../database-setup/05_insert_dummy_data.sql', import.meta.url),
  new URL('../database-setup/06_verify.sql', import.meta.url),
];

// 各SQLは自身でUSE先を指定する。接続プールの既定DBは、まだ対象DBがなくても使えるmasterにする。
export async function setupDatabase() {
  // コピー先の識別子・DB名・参照先に合わせてSQLを更新してから準備する。
  generateDatabaseSetup(application, {
    configurationDatabase: databaseNameForEnvironment(env.configurationDatabase.database, 'production'),
  });

  const pool = new sql.ConnectionPool({ ...env.configurationDatabase, database: 'master' });

  try {
    await pool.connect();

    for (const file of setupFiles) {
      console.info('初期構築SQLを実行します: ' + file.pathname.split('/').at(-1));
      const result = await pool.request().batch(readSql(file));

      if (file.pathname.endsWith('/06_verify.sql')) {
        console.info(JSON.stringify(result.recordsets, null, 2));
      }
    }

    console.info('本番・開発のDBとテーブルを準備しました。既存のデータは保持しています。');
  } finally {
    await pool.close();
  }
}

if (import.meta.main) {
  try {
    await setupDatabase();
  } catch (error) {
    console.error('DBの初期構築に失敗しました:', error.message);
    process.exitCode = 1;
  }
}
