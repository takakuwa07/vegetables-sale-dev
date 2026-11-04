// ── 📋 閲覧SQLと入力検証の確認 ───────────────────────────
// 実DBを使わず、列の保持・検索・件数とページ境界・異常時の伝播を確認する。
// SQLに利用者の入力を直接組み込まないことを確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecordQuery, parseRecordOptions, readColumns, getRecords } from '../backend/data.js';
import { readSqlSections } from '../db/sql.js';
import { databaseNameForEnvironment } from '../config/database-name.js';
import runtime from '../runtime.json' with { type: 'json' };
import application from '../config/application.js';

const cases = readSqlSections(new URL('./fixtures/record_cases.sql', import.meta.url));
const applicationDatabase = databaseNameForEnvironment(application.data.database, runtime.environment);

const rawColumns = [
  { name: 'record_id', type: 'bigint', position: 1, keyOrder: 1 },
  { name: 'item_name', type: 'nvarchar', position: 2, keyOrder: 0 },
  { name: 'amount', type: 'decimal', position: 3, keyOrder: 0 },
  { name: 'recorded_at', type: 'datetime2', position: 4, keyOrder: 0 },
  { name: 'memo]', type: 'ntext', position: 5, keyOrder: 0 },
];

function mockPool(total = 2, rows = []) {
  const calls = [];
  const pool = { calls, request() {
    const inputs = {};
    return { input(name, type, value) { inputs[name] = value; return this; }, async query(query) {
      calls.push({ query, inputs });
      if (query.includes('current-database')) {
        return { recordset: [{ name: applicationDatabase }] };
      }
      if (query.includes('records-columns')) {
        return { recordset: rawColumns };
      }
      if (query.includes('records-count')) {
        return { recordset: [{ total: String(total) }] };
      }
      return { recordset: rows };
    } };
  } };
  return pool;
}
const sql = { NVarChar: () => 'nvarchar', Int: 'int', BigInt: 'bigint' };

test('実列の順番・型・主キーを保持し、別DBへの誤接続を拒否する', async () => {
  const columns = await readColumns(mockPool());
  assert.deepEqual(columns.map(column => column.name), rawColumns.map(column => column.name));
  assert.equal(columns[0].numeric, true);
  assert.equal(columns[3].numeric, false);
  await assert.rejects(readColumns({ request: () => ({ query: async () => ({ recordset: [{ name: 'other_db' }] }) }) }), error => error.message.includes(applicationDatabase));
});

test('0件の列定義は対象表なしとして報告する', async () => {
  let counter = 0;
  await assert.rejects(readColumns({ request: () => ({ input() { return this; }, query: async () => ({ recordset: counter++ === 0 ? [{ name: applicationDatabase }] : [] }) }) }), /見つからない/);
});

test('別環境の業務DBへ接続していた場合は、一覧取得を止める', async () => {
  const otherEnvironment = runtime.environment === 'development' ? 'production' : 'development';
  const otherDatabase = databaseNameForEnvironment(application.data.database, otherEnvironment);
  const pool = { request: () => ({ query: async () => ({ recordset: [{ name: otherDatabase }] }) }) };

  await assert.rejects(readColumns(pool), error => error.message.includes(applicationDatabase));
});

test('ページ数・検索長・配列入力・方向の不正を拒否する', () => {
  for (const query of [{ page: '0' }, { page: '-1' }, { pageSize: '201' }, { page: ['1', '2'] }, { search: 'a'.repeat(101) }, { sort: [] }, { direction: cases.invalidDirection }]) {
    assert.throws(() => parseRecordOptions(query), error => error.status === 400);
  }
});

test('SQLインジェクションを防ぎ、LIKE記号は文字として検索する', async () => {
  const columns = await readColumns(mockPool());
  const options = parseRecordOptions({ search: cases.attackSearch, sort: 'memo]', direction: 'desc' });
  const query = buildRecordQuery(columns, options);
  assert.equal(query.rows.includes(cases.attackFragment), false);
  assert.ok(query.rows.includes(cases.orderText));
  assert.equal(query.pattern, cases.escapedPattern);
  assert.throws(() => buildRecordQuery(columns, { ...options, sort: cases.invalidSort }), error => error.status === 400);
});

test('数値の精度と日時を文字列で返し、主キーでページ順序を安定させる', async () => {
  const pool = mockPool(2, [{ record_id: '9007199254740993', amount: '1234567890.1234', recorded_at: '2026-11-04 20:00:00.0000000' }]);
  const result = await getRecords(pool, sql, parseRecordOptions({ sort: 'amount' }));
  assert.equal(result.rows[0].record_id, '9007199254740993');
  assert.equal(result.rows[0].amount, '1234567890.1234');
  assert.equal(result.columns.length, 5);
  assert.equal(result.stableOrder, true);
  assert.ok(pool.calls.at(-1).query.includes(cases.orderAmount));
  assert.ok(pool.calls.at(-1).query.includes(cases.formattedTimestamp));
  assert.deepEqual(pool.calls.at(-1).inputs, { search: '%%', offset: 0, limit: 50 });
});

test('0件・範囲外ページを正しく補正する', async () => {
  const empty = await getRecords(mockPool(0), sql, parseRecordOptions({ page: '9' }));
  assert.equal(empty.total, 0);
  assert.equal(empty.page, 1);
  assert.deepEqual(empty.rows, []);
  const pool = mockPool(101);
  const data = await getRecords(pool, sql, parseRecordOptions({ page: '99' }));
  assert.equal(data.page, 3);
  assert.equal(pool.calls.at(-1).inputs.offset, 100);
});

test('接続・SQLエラーは成功に見せず呼び出し元へ返す', async () => {
  await assert.rejects(getRecords({ request() { throw new Error('DB切断'); } }, sql, parseRecordOptions({})), /DB切断/);
});
