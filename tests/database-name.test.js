// 同じ基底DB名でも、開発と本番の接続先が必ず分かれることを確認する。
import test from 'node:test';
import assert from 'node:assert/strict';

import { databaseNameForEnvironment } from '../config/database-name.js';

test('開発は-devを1回だけ付け、本番は基底DB名にそろえる', () => {
  for (const base of ['application_config_db', 'test_data_db']) {
    assert.equal(databaseNameForEnvironment(base, 'development'), base + '-dev');
    assert.equal(databaseNameForEnvironment(base + '-dev', 'development'), base + '-dev');
    assert.equal(databaseNameForEnvironment(base, 'production'), base);
    assert.equal(databaseNameForEnvironment(base + '-dev', 'production'), base);
  }
});

test('不正なDB名・環境・長すぎる接尾語付き名を接続前に拒否する', () => {
  for (const name of ['', null, 'other-db', 'name]x', 'name-dev-dev', 'common_db', 'common_db-dev']) {
    assert.throws(() => databaseNameForEnvironment(name, 'development'));
  }

  assert.throws(() => databaseNameForEnvironment('application_config_db', 'unknown'), /環境/);
  assert.equal(databaseNameForEnvironment('a'.repeat(124), 'development').length, 128);
  assert.throws(() => databaseNameForEnvironment('a'.repeat(125), 'development'), /128/);
});
