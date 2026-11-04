// ── 📁 本番の初回設定を用意する ──────────────────────────
// 開発envの接続項目だけを、指定された別フォルダの本番envへ引き継ぐ。
// 既存設定は保持し、サーバー起動・公開・DB更新は実行しない。

import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { readDeployTarget } from './deploy-prod.js';

// prod:setupの直接実行時だけ設定を作る。既存ファイルがある場合は接続情報を上書きしない。
if (import.meta.main) {
  try {
    const source = path.resolve(import.meta.dirname, '..');
    const target = readDeployTarget(source);
    // 自己コピーや開発フォルダ内への本番配置を防ぐため、親子関係も禁止する。
    const relative = path.relative(source, target);
    const reverse = path.relative(target, source);
    const inside = value => !value || (!value.startsWith('..' + path.sep) && value !== '..' && !path.isAbsolute(value));
    if (inside(relative) || inside(reverse)) {
      throw new Error('本番フォルダは開発フォルダと同一・親子関係にしないでください');
    }
    const values = parseEnv(fs.readFileSync(path.join(source, '.env.development'), 'utf8'));
    let template = fs.readFileSync(path.join(source, '.env.production.example'), 'utf8');
    // 開発から引き継ぐのはDB接続項目だけ。本番ポートはテンプレートの値を使う。
    template = template.replace(/^(DB_[A-Z_]+)=.*$/gm, (line, name) => {
      // Node.jsのenv構文では単引用符内は展開されない。値を表示しない。
      const value = values[name];
      if (value === undefined) {
        return line;
      }
      if (value.includes("'")) {
        throw new Error(`${name}は本番envへ手動で記入してください（設定を保存していません）`);
      }
      return `${name}='${value}'`;
    });
    fs.mkdirSync(target, { recursive: true });
    const file = path.join(target, '.env.production');
    if (fs.existsSync(file)) {
      console.info('本番設定は既に存在するため、そのまま保持します');
    } else {
      fs.writeFileSync(file, template, { flag: 'wx', mode: 0o600 });
      console.info('本番設定を用意しました。APP_PORT=3001 / LOG_PORT=3601（公開はしていません）');
    }
  } catch (error) {
    console.error('本番設定の準備に失敗しました:', error.message);
    process.exitCode = 1;
  }
}
