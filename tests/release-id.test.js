// ── 🏷️ リリース名と公開版番号を確認 ───────────────────────
// 日本時間と開発者識別子を使った名前・版番号の作成を試す。
// 同じ秒でも名前が重ならず、デプロイ先などの設定が不正なら止まるか確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createReleaseId, createDeploymentVersion, readDeployInitials, readDeployTarget } from '../scripts/deploy-prod.js';
import { savedReleases, findRelease } from '../scripts/rollback-prod.js';

test('リリース名の先頭は年を含む版番号で、同じ秒でも重複しない', () => {
  const now = new Date('2026-09-28T13:51:20Z');
  const first = createReleaseId('260928-001-yt', now);
  const second = createReleaseId('260928-001-yt', now);
  assert.match(first, /^260928-001-yt-225120-[0-9a-f-]{36}$/);
  assert.notEqual(first, second);
  assert.match(createReleaseId('270101-001-ab', new Date('2026-12-31T15:00:00Z')), /^270101-001-ab-000000-/);
  assert.match(createReleaseId('270101-001-AdminUser3', new Date('2026-12-31T15:00:00Z')), /^270101-001-AdminUser3-000000-/);
  assert.throws(() => createReleaseId('bad', now), /版番号/);
});

test('公開バージョンは日本時間の日付・共通連番・開発者識別子で採番する', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-version-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const now = new Date('2026-09-28T15:00:00Z');

  assert.equal(createDeploymentVersion(root, 'Yt3', now), '260929-001-Yt3');
  assert.equal(createDeploymentVersion(root, 'AdminUser', now), '260929-002-AdminUser');
  assert.equal(createDeploymentVersion(root, 'Yt3', new Date('2026-09-29T15:00:00Z')), '260930-001-Yt3');

  // 採番記録がない既存環境でも、残っているリリースの最大番号から続ける。
  fs.rmSync(path.join(root, '.version-sequence.json'));
  const release = path.join(root, 'releases', 'old');
  fs.mkdirSync(release, { recursive: true });
  fs.writeFileSync(path.join(release, 'runtime.json'), '{"version":"260929-006-yt"}');
  assert.equal(createDeploymentVersion(root, 'AdminUser', now), '260929-007-AdminUser');
  assert.throws(() => createDeploymentVersion(root, 'abc', now), /識別子/);
});

test('新旧のフォルダ名を版番号順に一覧表示し、どちらも版番号で探せる', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-list-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const releases = [
    { id: '20260929-120000-11111111-1111-4111-8111-111111111111', version: '260929-001-yt' },
    { id: '0930-001-yt-155038-22222222-2222-4222-8222-222222222222', version: '260930-001-yt' },
    { id: '270101-001-DeveloperOne-000000-33333333-3333-4333-8333-333333333333', version: '270101-001-DeveloperOne' },
  ];
  for (const release of releases) {
    const directory = path.join(root, 'releases', release.id);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'runtime.json'), JSON.stringify({ environment: 'production', version: release.version }));
  }
  assert.deepEqual(savedReleases(root).map(release => release.version), releases.map(release => release.version));
  for (const release of releases) assert.equal(findRelease(root, release.version).id, release.id);
});

test('開発者識別子は3文字以上の英数字で英大文字と英小文字を含む', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-initials-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '.env.development'), 'DEPLOY_INITIALS=\n');
  assert.throws(() => readDeployInitials(root), /DEPLOY_INITIALS/);

  for (const invalid of ['yt', 'abc', 'ABC', 'Ab', 'Ab-3']) {
    fs.writeFileSync(path.join(root, '.env.development'), `DEPLOY_INITIALS=${invalid}\n`);
    assert.throws(() => readDeployInitials(root), /DEPLOY_INITIALS/);
  }

  fs.writeFileSync(path.join(root, '.env.development'), 'DEPLOY_INITIALS=AdminUser3\n');
  assert.equal(readDeployInitials(root), 'AdminUser3');
});

test('デプロイ先は開発envの絶対パスから読み取る', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-target-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const envFile = path.join(root, '.env.development');
  fs.writeFileSync(envFile, 'DEPLOY_TARGET_DIR=\n');
  assert.throws(() => readDeployTarget(root), /DEPLOY_TARGET_DIR/);

  fs.writeFileSync(envFile, 'DEPLOY_TARGET_DIR=../production\n');
  assert.throws(() => readDeployTarget(root), /DEPLOY_TARGET_DIR/);

  fs.writeFileSync(envFile, `DEPLOY_TARGET_DIR=${path.parse(root).root}\n`);
  assert.throws(() => readDeployTarget(root), /DEPLOY_TARGET_DIR/);

  const target = path.join(root, 'production');
  fs.writeFileSync(envFile, `DEPLOY_TARGET_DIR=${target}\n`);
  assert.equal(readDeployTarget(root), target);
});
