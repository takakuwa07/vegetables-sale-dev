// ── 📁 本番ルートの決め方を確認 ───────────────────────────
// 仮のリリース用フォルダを作り、設定やログの基準となる場所を調べる。
// 決められた配置から外れた本番コードは起動を止めることも確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

test('本番ルートはリリースの配置から決まり、配置が違えば停止する', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-root-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(import.meta.dirname, '../config/project-root.js');

  function run(releaseDirectory) {
    const configDirectory = path.join(releaseDirectory, 'config');
    fs.mkdirSync(configDirectory, { recursive: true });
    fs.copyFileSync(source, path.join(configDirectory, 'project-root.js'));
    fs.writeFileSync(path.join(releaseDirectory, 'runtime.json'), '{"environment":"production"}');
    const moduleUrl = pathToFileURL(path.join(configDirectory, 'project-root.js')).href;
    const script = `import { projectRoot } from ${JSON.stringify(moduleUrl)}; console.log(projectRoot);`;
    return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8'
    });
  }

  const valid = run(path.join(root, 'releases', 'actual'));
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout.trim(), path.resolve(root));

  const invalid = run(path.join(root, 'wrong-place'));
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /releases\/<版>\//);
});
