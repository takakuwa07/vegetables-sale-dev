// ── 🥬 閲覧SQLと入力検証の確認 ───────────────────────────
// 実DBを使わず、列の保持・検索・件数とページ境界・異常時の伝播を確認する。
// SQLに利用者の入力を直接組み込まないことを確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSalesQuery, parseSalesOptions, readSalesColumns, getSales } from '../backend/bk-sales-data.js';

const rawColumns = [
  { name: 'sale_id', type: 'bigint', position: 1, keyOrder: 1 },
  { name: 'vegetable_name', type: 'nvarchar', position: 2, keyOrder: 0 },
  { name: 'amount', type: 'decimal', position: 3, keyOrder: 0 },
  { name: 'sold_at', type: 'datetime2', position: 4, keyOrder: 0 },
  { name: 'memo]', type: 'ntext', position: 5, keyOrder: 0 },
];

function mockPool(total = 2, rows = []) {
  const calls = [];
  const pool = { calls, request() {
    const inputs = {};
    return { input(name, type, value) { inputs[name] = value; return this; }, async query(query) {
      calls.push({ query, inputs });
      if (query.includes('DB_NAME()')) {
        return { recordset: [{ name: 'vegetables_maintenance_db' }] };
      }
      if (query.includes('sys.columns')) {
        return { recordset: rawColumns };
      }
      if (query.includes('COUNT_BIG')) {
        return { recordset: [{ total: String(total) }] };
      }
      return { recordset: rows };
    } };
  } };
  return pool;
}
const sql = { NVarChar: () => 'nvarchar', Int: 'int', BigInt: 'bigint' };

test('実列の順番・型・主キーを保持し、別DBへの誤接続を拒否する', async () => {
  const columns = await readSalesColumns(mockPool());
  assert.deepEqual(columns.map(column => column.name), rawColumns.map(column => column.name));
  assert.equal(columns[0].numeric, true);
  assert.equal(columns[3].numeric, false);
  await assert.rejects(readSalesColumns({ request: () => ({ query: async () => ({ recordset: [{ name: 'other_db' }] }) }) }), /vegetables_maintenance_db/);
});

test('0件の列定義は対象表なしとして報告する', async () => {
  let counter = 0;
  await assert.rejects(readSalesColumns({ request: () => ({ query: async () => ({ recordset: counter++ === 0 ? [{ name: 'vegetables_maintenance_db' }] : [] }) }) }), /見つからない/);
});

test('ページ数・検索長・配列入力・方向の不正を拒否する', () => {
  for (const query of [{ page: '0' }, { page: '-1' }, { pageSize: '201' }, { page: ['1', '2'] }, { search: 'a'.repeat(101) }, { sort: [] }, { direction: 'DROP TABLE' }]) {
    assert.throws(() => parseSalesOptions(query), error => error.status === 400);
  }
});

test('SQLインジェクションを防ぎ、LIKE記号は文字として検索する', async () => {
  const columns = await readSalesColumns(mockPool());
  const options = parseSalesOptions({ search: "x%' OR 1=1;--_[~", sort: 'memo]', direction: 'desc' });
  const query = buildSalesQuery(columns, options);
  assert.doesNotMatch(query.rows, /OR 1=1/);
  assert.match(query.rows, /CONVERT\(nvarchar\(max\), \[memo\]\]\]\) DESC, \[sale_id\] ASC/);
  assert.equal(query.pattern, "%x~%' OR 1=1;--~_~[~~%");
  assert.throws(() => buildSalesQuery(columns, { ...options, sort: 'sale_id; DROP TABLE x' }), error => error.status === 400);
});

test('数値の精度と日時を文字列で返し、主キーでページ順序を安定させる', async () => {
  const pool = mockPool(2, [{ sale_id: '9007199254740993', amount: '1234567890.1234', sold_at: '2026-11-04 20:00:00.0000000' }]);
  const result = await getSales(pool, sql, parseSalesOptions({ sort: 'amount' }));
  assert.equal(result.rows[0].sale_id, '9007199254740993');
  assert.equal(result.rows[0].amount, '1234567890.1234');
  assert.equal(result.columns.length, 5);
  assert.equal(result.stableOrder, true);
  assert.match(pool.calls.at(-1).query, /ORDER BY \[amount\] ASC, \[sale_id\] ASC/);
  assert.match(pool.calls.at(-1).query, /CONVERT\(nvarchar\(100\), \[sold_at\], 121\)/);
  assert.deepEqual(pool.calls.at(-1).inputs, { search: '%%', offset: 0, limit: 50 });
});

test('0件・範囲外ページを正しく補正する', async () => {
  const empty = await getSales(mockPool(0), sql, parseSalesOptions({ page: '9' }));
  assert.equal(empty.total, 0);
  assert.equal(empty.page, 1);
  assert.deepEqual(empty.rows, []);
  const pool = mockPool(101);
  const data = await getSales(pool, sql, parseSalesOptions({ page: '99' }));
  assert.equal(data.page, 3);
  assert.equal(pool.calls.at(-1).inputs.offset, 100);
});

test('接続・SQLエラーは成功に見せず呼び出し元へ返す', async () => {
  await assert.rejects(getSales({ request() { throw new Error('DB切断'); } }, sql, parseSalesOptions({})), /DB切断/);
});
