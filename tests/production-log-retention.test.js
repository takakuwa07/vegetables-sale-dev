// ── 🧹 古い本番ログの整理を確認 ──────────────────────────
// 日付の異なる仮の起動ログを用意し、保存期間を過ぎたものだけ消えるか試す。
// 公開中の版、通信完了待ちの版、業務ログは残ることを確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupReleaseLogs } from '../scripts/production-log-retention.js';

test('30日超のリリース別起動ログだけ整理し、現行版・業務ログ・通信完了待ちは残す', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'log-retention-test-'));
  const directory = path.join(root, 'log');
  fs.mkdirSync(directory);
  const active = '11111111-1111-4111-8111-111111111111';
  const expired = '20260928-225120-22222222-2222-4222-8222-222222222222';
  const expiredNew = '0928-002-ab-225120-44444444-4444-4444-8444-444444444444';
  const expiredNamed = '0928-003-AdminUser3-225120-55555555-5555-4555-8555-555555555555';
  const other = '1114-001-yt-120000-33333333-3333-4333-8333-333333333333';
  const names = ['server-app.log', 'gateway.log', 'notes.log'];
  const now = new Date('2026-11-15T00:00:00Z');
  for (const name of names) {
    const file = path.join(directory, name);
    fs.writeFileSync(file, 'log');
    fs.utimesSync(file, new Date('2026-09-28T00:00:00Z'), new Date('2026-09-28T00:00:00Z'));
  }
  const releases = path.join(directory, 'releases');
  for (const id of [active, expired, expiredNew, expiredNamed, other]) {
    const folder = path.join(releases, id);
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, 'server.log');
    fs.writeFileSync(file, 'log');
    fs.utimesSync(file, new Date('2026-09-28T00:00:00Z'), new Date('2026-09-28T00:00:00Z'));
  }
  fs.writeFileSync(path.join(releases, expired, 'log-server-before-migration.log'), 'log');
  fs.utimesSync(path.join(releases, expired, 'log-server-before-migration.log'), new Date('2026-09-28T00:00:00Z'), new Date('2026-09-28T00:00:00Z'));
  fs.utimesSync(path.join(releases, other, 'server.log'), new Date('2026-11-14T00:00:00Z'), new Date('2026-11-14T00:00:00Z'));
  const status = { protocol: 1, running: true, release: active, draining: 1 };
  try {
    assert.equal(cleanupReleaseLogs(root, status, now).skipped, true);
    assert.equal(fs.readdirSync(directory).length, names.length + 1);
    status.draining = 0;
    assert.equal(cleanupReleaseLogs(root, status, now).removed, 4);
    assert.deepEqual(fs.readdirSync(directory).sort(), [...names, 'releases'].sort());
    assert.deepEqual(fs.readdirSync(releases).sort(), [active, other].sort());
  } finally {
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'log-retention-test-')));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
