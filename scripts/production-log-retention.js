// ── 🧹 本番の古い起動ログを整理 ──────────────────────────
// リリースごとの起動ログから、保存期間を過ぎたファイルだけを削除する。
// 使用中の版や切り替え中のログを避け、業務ログは削除しない。

import fs from 'node:fs';
import path from 'node:path';

export const retentionDays = 30;
const releaseIdName = /^(?:\d{8}-\d{6}-|\d{4}-\d{3}-[A-Za-z0-9]+-\d{6}-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const releaseFileNames = new Set(['server.log', 'log-server.log', 'server-before-migration.log', 'log-server-before-migration.log']);

// 管理状態を確認し、既知のフォルダ名・ログ名に一致する30日超の起動ログだけを削除する。
// 戻り値は削除件数removedと、安全のため処理を見送ったかを表すskipped。
export function cleanupReleaseLogs(root, status, now = new Date()) {
  // 通信完了待ちのリリースがあれば、使用中のログを誤って消さないため今回は見送る。
  if (status?.protocol !== 1 || !status.running || status.draining > 0) {
    return { removed: 0, skipped: true };
  }
  const logDirectory = path.join(root, 'log');
  if (!fs.existsSync(logDirectory)) return { removed: 0, skipped: false };
  const threshold = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const protectedIds = [status.release, status.prepared].filter(Boolean);
  let removed = 0;
  // ファイルの最終更新時刻で保存期限を判定し、削除できないものがあっても他の整理を続ける。
  function removeExpired(file, name) {
    if (fs.statSync(file).mtimeMs >= threshold) return;
    try { fs.unlinkSync(file); removed++; }
    catch (error) { console.warn('古い起動ログを削除できませんでした:', name, error.message); }
  }
  const releasesDirectory = path.join(logDirectory, 'releases');
  if (!fs.existsSync(releasesDirectory)) return { removed, skipped: false };
  for (const release of fs.readdirSync(releasesDirectory, { withFileTypes: true })) {
    if (!release.isDirectory() || !releaseIdName.test(release.name) || protectedIds.includes(release.name)) continue;
    const directory = path.join(releasesDirectory, release.name);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !releaseFileNames.has(entry.name)) continue;
      removeExpired(path.join(directory, entry.name), path.join(release.name, entry.name));
    }
    if (!fs.readdirSync(directory).length) fs.rmdirSync(directory);
  }
  return { removed, skipped: false };
}
