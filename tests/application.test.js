// 別アプリへのコピーを想定し、設定の検証・安全な画面生成・SQLの再生成を確認する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import application, { validateApplication } from '../config/application.js';
import { renderApplicationHtml } from '../middleware/frontend.js';
import { generateDatabaseSetup } from '../scripts/generate-database-setup.js';

test('コピー先の設定に合わせて初期構築SQLを生成し、元の識別子を残さない', t => {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'app-sql-generation-test-'));
  t.after(() => {
    assert.ok(destination.startsWith(path.join(os.tmpdir(), 'app-sql-generation-test-')));
    fs.rmSync(destination, { recursive: true, force: true });
  });

  const settings = {
    ...application, id: 'test-inventory', configurationDatabase: 'test_config_db',
    data: { database: 'inventory_db', schema: 'inventory', table: 't_records', apiPath: '/api/items' },
  };
  const files = generateDatabaseSetup(settings, { destination });
  assert.equal(files.length, 7);

  const databases = fs.readFileSync(files[0], 'utf8');
  assert.ok(databases.includes('inventory_db-dev'));
  assert.ok(databases.includes('test_config_db-dev'));

  const tables = fs.readFileSync(files[2], 'utf8');
  assert.ok(tables.includes('inventory.t_records'));
  assert.equal(tables.includes(application.data.table), false);

  const registry = fs.readFileSync(files[3], 'utf8');
  assert.ok(registry.includes(settings.id));
  assert.equal(registry.includes(application.id), false);

  for (const file of files) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\{\{[A-Za-z][A-Za-z0-9]*\}\}/);
  }
});

test('表示名や画面用JSONへHTMLを渡してもスクリプトとして解釈させない', () => {
  const settings = validateApplication({
    ...application, title: '<script>alert(1)</script>', label: '</script><script>alert(1)</script>',
  });
  const template = '<title>{{applicationTitle}}</title><script type="application/json">{{applicationSettings}}</script>';
  const html = renderApplicationHtml(template, settings);

  assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  const json = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(json).label, settings.label);
});

test('SQLやURLの構造を変えるアプリ設定は受け付けない', () => {
  for (const data of [
    { ...application.data, schema: 'name]x' },
    { ...application.data, table: 'name;other' },
    { ...application.data, apiPath: 'https://example.invalid/records' },
  ]) {
    assert.throws(() => validateApplication({ ...application, data }));
  }

  assert.throws(() => validateApplication({ ...application, id: "name'other" }));
});
