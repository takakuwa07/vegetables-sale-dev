// ── ⚙️ 業務サーバーの環境設定 ─────────────────────────────
// 起動する環境に合った .env ファイルを読み、DBや公開ポートの設定をまとめる。
// 必須項目や値の形式を確認し、設定が足りなければ起動を止める。

import path from 'node:path';
import fs from 'node:fs';
import { loadEnvFile } from 'node:process';
import { parseEnv } from 'node:util';
import runtime from '../runtime.json' with { type: 'json' };
import { projectRoot } from './project-root.js';
import { readPorts } from './ports.js';

// runtime.jsonが指定する環境に応じて、読み込むenvファイルを決める。
const isDevelopment = runtime.environment === 'development';
if (!['development', 'production'].includes(runtime.environment)) {
  throw new Error('runtime.jsonのenvironmentが不正です');
}
if (runtime.appName !== undefined) {
  throw new Error('runtime.jsonのappNameは旧方式の設定です。共通サーバーでは指定しないでください');
}
const envPath = path.join(projectRoot, `.env.${runtime.environment}`);

// 本番の公開管理プロセスは、空きポートを子プロセスへ渡す。
// 値がない通常起動とは区別し、渡された値の形式だけここで確認する。
const internalPort = process.env.PRODUCTION_INTERNAL_PORT;
if (internalPort !== undefined && (!/^\d+$/.test(internalPort) || Number(internalPort) > 65535)) {
  throw new Error('内部サーバーのポート番号が不正です');
}

// 作業中のフォルダに左右されないよう、読み込むenvファイルを明示する。
// 必須ファイルがなければ、別環境の設定を使わずに起動を止める。
if (!fs.existsSync(envPath)) {
  throw new Error(`環境設定ファイルがありません: ${envPath}`);
}
const fileValues = parseEnv(fs.readFileSync(envPath, 'utf8'));
loadEnvFile(envPath);

// DBの必須項目は、envファイル内と読み込み後の両方で確認する。
// OS側に同名の環境変数があっても、envファイルの空欄を見逃さない。
const requiredNames = [
  'DB_USER', 'DB_PASSWORD', 'DB_SERVER', 'DB_PORT',
  'DB_ENCRYPT', 'DB_TRUST_SERVER_CERTIFICATE'
];
const missing = requiredNames.filter(name => !fileValues[name]?.trim() || !process.env[name]?.trim());
if (missing.length) {
  throw new Error(`${path.basename(envPath)}に必要な設定がありません: ${missing.join(', ')}`);
}

// envの値は文字列なので、DBポートと真偽値は使用前に検証する。
const dbPort = Number(process.env.DB_PORT);
if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) {
  throw new Error('DB_PORTには1～65535の整数を指定してください');
}
for (const name of ['DB_ENCRYPT', 'DB_TRUST_SERVER_CERTIFICATE']) {
  if (!/^(true|false)$/i.test(process.env[name])) {
    throw new Error(`${name}にはtrueまたはfalseを指定してください`);
  }
}
// 公開ポートは両サーバーとデプロイ処理で共通の設定を読む。
const ports = readPorts(projectRoot, runtime.environment);
const commonDbName = process.env.DB_COMMON_NAME?.trim() || 'common_db';

// common_dbへ最初に接続するための設定。追加DB名はcommon_dbの設定表から読む。
const commonDatabase = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: commonDbName,
  port: dbPort,
  options: {
    encrypt: String(process.env.DB_ENCRYPT).toLowerCase() === 'true',
    trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERTIFICATE).toLowerCase() === 'true'
  }
};

// 業務サーバーからは、このオブジェクトをimportして設定を参照する。
export default {
  // 本番の子プロセスは内部ポートで待ち受け、案内URLには公開ポートを使う。
  port: internalPort !== undefined ? Number(internalPort) : ports.APP_PORT,
  publicPort: ports.APP_PORT,
  host: internalPort !== undefined ? '127.0.0.1' : '0.0.0.0',
  isDevelopment,
  environment: runtime.environment,
  // ログ閲覧は別プロセス。LiveReloadは開発時だけ使う。
  logPort: isDevelopment ? ports.APP_PORT : ports.LOG_PORT,
  liveReloadPort: ports.LIVE_RELOAD_PORT,

  commonDatabase
};
