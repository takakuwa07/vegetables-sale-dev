// アプリ設定から初期構築SQLを再生成する。DBへ接続したりSQLを実行する処理は含まない。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import application, { validateApplication } from '../config/application.js';
import { databaseNameForEnvironment } from '../config/database-name.js';
import { readSql, renderSql } from '../db/sql.js';

const templates = [
  ['01_create_databases.sql', new URL('../database-setup/templates/01_create_databases.sql', import.meta.url)],
  ['02_create_configuration_tables.sql', new URL('../database-setup/templates/02_create_configuration_tables.sql', import.meta.url)],
  ['03_create_application_tables.sql', new URL('../database-setup/templates/03_create_application_tables.sql', import.meta.url)],
  ['04_insert_connection_settings.sql', new URL('../database-setup/templates/04_insert_connection_settings.sql', import.meta.url)],
  ['05_insert_dummy_data.sql', new URL('../database-setup/templates/05_insert_dummy_data.sql', import.meta.url)],
  ['06_verify.sql', new URL('../database-setup/templates/06_verify.sql', import.meta.url)],
  ['internal/inspect_schema.sql', new URL('../database-setup/templates/internal/inspect_schema.sql', import.meta.url)],
];

// 識別子として使える文字を検証済みの設定だけを差し込む。SQLの構文はテンプレートで管理する。
export function generateDatabaseSetup(settings = application, {
  configurationDatabase = settings.configurationDatabase,
  destination = fileURLToPath(new URL('../database-setup/', import.meta.url)),
} = {}) {
  settings = validateApplication(settings);
  const values = {
    applicationId: settings.id,
    configurationDatabase: databaseNameForEnvironment(configurationDatabase, 'production'),
    configurationDevelopmentDatabase: databaseNameForEnvironment(configurationDatabase, 'development'),
    applicationDatabase: databaseNameForEnvironment(settings.data.database, 'production'),
    applicationDevelopmentDatabase: databaseNameForEnvironment(settings.data.database, 'development'),
    schema: settings.data.schema,
    table: settings.data.table,
  };

  for (const [name, template] of templates) {
    const file = path.join(destination, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderSql(readSql(template), values) + '\n', 'utf8');
  }

  return templates.map(([name]) => path.join(destination, name));
}

if (import.meta.main) {
  try {
    const envFile = new URL('../.env.development', import.meta.url);
    const values = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};
    const files = generateDatabaseSetup(application, {
      configurationDatabase: values.DB_CONFIG_NAME?.trim() || application.configurationDatabase,
    });
    console.info(`初期構築用SQLを${files.length}ファイル生成しました（DBへの実行はしていません）`);
  } catch (error) {
    console.error('初期構築用SQLの生成に失敗しました:', error.message);
    process.exitCode = 1;
  }
}
