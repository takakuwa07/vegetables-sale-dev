// SQLファイルの不備を実行前に検出し、差し込み値を勝手に再解釈しないことを確認する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readSql, readSqlSections, renderSql } from '../db/sql.js';

test('SQLテンプレートの不足・重複・空欄は実行前にエラーにする', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-sql-test-'));
  const file = pathToFileURL(path.join(root, 'fragments.sql'));

  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'app-sql-test-')));
    fs.rmSync(root, { recursive: true, force: true });
  });

  assert.throws(() => readSql(file), { code: 'ENOENT' });
  assert.throws(() => readSql(pathToFileURL(path.join(root, 'fragments.txt'))), /\.sql/);

  fs.writeFileSync(file, 'fragment without a section');
  assert.throws(() => readSqlSections(file), /区切り/);

  fs.writeFileSync(file, '-- @section item\nfirst\n-- @section item\nsecond');
  assert.throws(() => readSqlSections(file), /重複/);

  fs.writeFileSync(file, '-- @section item\n');
  assert.throws(() => readSqlSections(file), /空/);
});

test('差し込みは1回だけ行い、検索語や列名中の記号をテンプレートとして再処理しない', () => {
  const fragments = readSqlSections(new URL('../backend/queries/record_fragments.sql', import.meta.url));
  const name = 'column{{conditions}}$&';

  assert.equal(renderSql(fragments.identifier, { name }), '[' + name + ']');
  assert.throws(() => renderSql(fragments.searchWhere, {}), /conditions/);
  assert.throws(() => renderSql(fragments.missing, {}), /見つかりません/);
});
