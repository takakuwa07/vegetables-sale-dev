// ── 🚀 公開版の確認と更新通知 ─────────────────────────────
// 起動中の版と現在公開されている版を読み、切り替え状態を確認する。
// 起動確認用と、ブラウザが画面更新を判断するためのAPIを登録する。

import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../config/project-root.js';

// 起動時に、このリリース自身のruntime.jsonを読む。
// 公開切り替え中に本番ルート側のファイルが変わっても、このプロセスの値は固定される。
const runtimeFile = path.join(import.meta.dirname, '..', 'runtime.json');
const runtime = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));

// 開発用runtime.jsonにはversionがないため、画面更新の識別子にはdevelopmentを使う。
export const deploymentVersion = runtime.version || 'development';

// forceは10秒後に自動更新、それ以外は利用者が通知を押したときに更新する。
const updateMode = runtime.updateMode === 'force' ? 'force' : 'manual';
const browserVersions = runtime.browserVersions || {};
const browserUpdateModes = runtime.browserUpdateModes || {};

// 公開管理プロセスが切り替え後に書くファイル。各リリースの中には置かない。
// 起動確認前の候補が利用者へ更新通知を出さないよう、公開完了の印として使う。
const readyFile = path.join(projectRoot, '.deployment-ready.json');

// このプロセスの版が、現在公開されている版かを確認する。
function isPublished() {
  // 公開ファイルが未作成・読込失敗・JSON不正なら、公開中とは扱わない。
  try {
    const published = JSON.parse(fs.readFileSync(readyFile, 'utf8'));

    return published.version === deploymentVersion;
  } catch {
    return false;
  }
}

// 起動確認とブラウザの更新検知に使うAPIを登録する。
// healthは未公開でも応答し、deployment系は公開完了を確認できるときだけ版番号を返す。
export function setupHealth(app) {
  // 新版を公開する前の起動確認に使う。公開状態に関係なく応答する。
  app.get('/api/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok', version: deploymentVersion, pid: process.pid });
  });

  // 旧画面向け。公開版のときだけ版番号を返す。
  app.get('/api/deployment', (req, res) => {
    res.set('Cache-Control', 'no-store');

    if (isPublished()) return res.json({ status: 'ok', version: deploymentVersion });

    // 切り替え前の新版から、未公開の版番号をブラウザへ渡さない。
    res.status(503).json({ status: 'updating' });
  });

  // 現行画面向け。版番号と更新方法を一緒に返す。
  app.get('/api/deployment-policy', (req, res) => {
    res.set('Cache-Control', 'no-store');

    if (isPublished()) {
      const name = String(req.query.app || '');
      return res.json({
        status: 'ok',
        version: browserVersions[name] || deploymentVersion,
        updateMode: browserUpdateModes[name] || updateMode
      });
    }

    res.status(503).json({ status: 'updating' });
  });
}
