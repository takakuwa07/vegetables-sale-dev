// ── ⚙️ 環境設定の不足を確認 ───────────────────────────────
// 一時的な .env ファイルを作り、必須設定が空のときの起動処理を試す。
// 足りない項目名を知らせて、安全に起動を止めるか確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

test('必須の.env設定が空なら、項目名を示して起動を止める', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.resolve(import.meta.dirname, '..');
  fs.mkdirSync(path.join(root, 'config'));
  for (const file of ['env.js', 'project-root.js', 'ports.js']) {
    fs.copyFileSync(path.join(source, 'config', file), path.join(root, 'config', file));
  }
  fs.writeFileSync(path.join(root, 'runtime.json'), '{"environment":"development"}');
  fs.writeFileSync(path.join(root, '.env.development'), 'DB_USER=\n');

  const moduleUrl = pathToFileURL(path.join(root, 'config/env.js')).href;
  const script = `await import(${JSON.stringify(moduleUrl)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8'
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\.env\.developmentに必要な設定がありません/);
  assert.match(result.stderr, /DB_USER/);
  assert.doesNotMatch(result.stderr, /test-value/);

  // 旧方式のappNameは、DB設定を読み込む前に理由を示して拒否する。
  fs.writeFileSync(path.join(root, 'runtime.json'), '{"environment":"development","appName":"version-registry"}');
  const legacy = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8'
  });
  assert.notEqual(legacy.status, 0);
  assert.match(legacy.stderr, /appNameは旧方式の設定/);
});
