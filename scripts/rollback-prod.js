// ── ↩️ 本番リリースを戻す ─────────────────────────────────
// 保存済みリリースを選び、業務サーバーとログサーバーの起動を確認する。
// 確認できた版だけを公開し、失敗した場合は現在の公開版を維持する。

import fs from 'node:fs';
import path from 'node:path';
import { gatewayCommand, atomicJson } from './production-gateway.js';
import { readDeployTarget } from './deploy-prod.js';

function savedReleases(root) {
  const directory = path.join(root, 'releases');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const runtimeFile = path.join(directory, entry.name, 'runtime.json');
      if (!fs.existsSync(runtimeFile)) return null;
      try {
        const runtime = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));
        if (runtime.environment !== 'production' || typeof runtime.version !== 'string') return null;
        return { id: entry.name, version: runtime.version, updateMode: runtime.updateMode };
      } catch { return null; }
    })
    .filter(Boolean)
    // 新旧のフォルダ名が混在しても、runtime.jsonの版番号で日付順に並べる。
    .sort((a, b) => a.version.localeCompare(b.version) || a.id.localeCompare(b.id));
}

function findRelease(root, name) {
  const matches = savedReleases(root).filter(release => release.id === name || release.version === name);
  if (matches.length !== 1) {
    throw new Error(matches.length ? '同じ版番号のリリースが複数あります。フォルダ名で指定してください' : `リリースが見つかりません: ${name}`);
  }
  return matches[0];
}

async function rollbackProduction(root, name) {
  const lockPath = path.join(root, '.deploy.lock');
  let lock;
  try { lock = fs.openSync(lockPath, 'wx'); }
  catch { throw new Error('デプロイロックがあります。別のデプロイや切り戻しが実行中でないか確認してください'); }
  try {
    const release = findRelease(root, name);
    const status = await gatewayCommand(root, 'status');
    if (status.protocol !== 1 || !status.running) throw new Error('公開管理プロセスが稼働していません');
    if (status.prepared) throw new Error('準備済みリリースがあります。管理状態を確認してください');
    if (status.release === release.id) {
      console.info(`すでに公開中です: ${release.version} (${release.id})`);
      return release;
    }
    let published = false;
    try {
      console.info(`切り戻し先を起動して確認します: ${release.version} (${release.id})`);
      await gatewayCommand(root, 'prepare', release.id);
      await gatewayCommand(root, 'publish');
      published = true;
      atomicJson(path.join(root, '.deployment-ready.json'), { version: release.version });
      console.info(`切り戻しました: ${release.version} (${release.id})`);
      console.info(release.updateMode === 'force'
        ? 'このリリースの画面更新は、通知から10秒後に自動実行されます'
        : 'このリリースの画面更新は、通知をクリックしたときに実行されます');
      return release;
    } catch (error) {
      if (!published) await gatewayCommand(root, 'discard').catch(() => {});
      throw error;
    }
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    const name = args[0];
    if (!name || args.length !== 1) {
      throw new Error('使い方: npm run releases / rollback -- <版>');
    }
    const source = path.join(import.meta.dirname, '..');
    const root = readDeployTarget(source);
    if (name === '--list') {
      const activeFile = path.join(root, '.active-release.json');
      const active = fs.existsSync(activeFile) ? JSON.parse(fs.readFileSync(activeFile, 'utf8')).id : null;
      const releases = savedReleases(root);
      if (!releases.length) console.info('保存済みリリースはありません');
      for (const release of releases) console.info(`${release.id === active ? '公開中' : '      '}  ${release.version}  ${release.id}`);
    } else await rollbackProduction(root, name);
  } catch (error) {
    console.error('本番の切り戻しに失敗しました:', error.message);
    process.exitCode = 1;
  }
}

export { savedReleases, findRelease, rollbackProduction };
