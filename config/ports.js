// ── 🔌 公開ポートの設定 ─────────────────────────────────
// 環境別の .env ファイルから、業務・ログなどが使うポート番号を取り出す。
// 番号の範囲と重複を確認し、サーバーとデプロイ処理へ同じ設定を渡す。

import fs from 'node:fs';
import path from 'node:path';

// サーバーとデプロイ処理が同じ公開ポートを使えるよう、envから読み取る。
export function readPorts(root, environment) {
  const envFile = path.join(root, `.env.${environment}`);
  if (!fs.existsSync(envFile)) throw new Error(`環境設定ファイルがありません: ${envFile}`);

  // 「名前=値」の行だけを集める。DBの秘密値は返さず、下でポート項目だけ選ぶ。
  const values = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
    .filter(line => /^\s*[A-Z_][A-Z_0-9]*=/.test(line))
    .map(line => line.trim().split(/=(.*)/s).slice(0, 2).map(value => value.trim())));
  // LiveReloadは開発専用。本番には業務とログの公開ポートだけ必要。
  const names = environment === 'development'
    ? ['APP_PORT', 'LOG_PORT', 'LIVE_RELOAD_PORT']
    : ['APP_PORT', 'LOG_PORT'];
  const ports = {};

  // 未設定や範囲外の番号を既定値で埋めず、設定した項目名を示して停止する。
  for (const name of names) {
    const raw = values[name];
    if (!raw) throw new Error(`${path.basename(envFile)}に必要な設定がありません: ${name}`);
    const port = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`${name}には1～65535の整数を指定してください`);
    }
    ports[name] = port;
  }
  // 同じPCで待ち受けるポートが重なると片方が起動できない。
  if (new Set(Object.values(ports)).size !== names.length) {
    throw new Error(`${path.basename(envFile)}のポート番号が重複しています`);
  }
  return ports;
}
