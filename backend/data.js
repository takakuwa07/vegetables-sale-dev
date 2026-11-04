// ── 📋 設定されたテーブルのデータを読み取る ─────────────────
// 実際の列名・型・主キーから、安全な閲覧用SQLを組み立てる。
// DBへ書き込まず、日時・大きな数値の情報を落とさず文字列で返す。

import { readSql, readSqlSections, renderSql } from '../db/sql.js';
import { databaseNameForEnvironment } from '../config/database-name.js';
import runtime from '../runtime.json' with { type: 'json' };
import sqlTypes from 'mssql';
import application from '../config/application.js';

const applicationDatabaseName = databaseNameForEnvironment(application.data.database, runtime.environment);

// SQL本文と式はすべて外部ファイルから読み、ここでは検証と組み合わせだけを行う。
const metadataQuery = readSql(new URL('./queries/select_record_columns.sql', import.meta.url));
const databaseQuery = readSql(new URL('../db/queries/select_current_database.sql', import.meta.url));
const countTemplate = readSql(new URL('./queries/count_records.sql', import.meta.url));
const rowsTemplate = readSql(new URL('./queries/select_records.sql', import.meta.url));
const fragments = readSqlSections(new URL('./queries/record_fragments.sql', import.meta.url));
const accessTemplate = readSql(new URL('./queries/check_records_access.sql', import.meta.url));

const numericTypes = new Set(['bigint', 'decimal', 'numeric', 'money', 'smallmoney', 'float', 'real', 'int', 'smallint', 'tinyint']);
const textTypes = new Set(['char', 'varchar', 'text', 'nchar', 'nvarchar', 'ntext', 'uniqueidentifier']);
const dateTypes = new Set(['date', 'datetime', 'datetime2', 'smalldatetime', 'time', 'datetimeoffset']);
const binaryTypes = new Set(['binary', 'varbinary', 'image', 'timestamp']);

// 列名はDBで取得したものに限り、閉じ括弧もSQL Serverの規則でエスケープする。
function identifier(name) {
  return renderSql(fragments.identifier, { name: name.replaceAll(']', ']]') });
}

// 参照先は設定から選び、SQL識別子として引用する。検索値は引き続きDBパラメーターで渡す。
const tableReference = renderSql(fragments.qualifiedTable, {
  schema: identifier(application.data.schema),
  table: identifier(application.data.table),
});

// 表が見えるだけで起動成功とせず、データの読取権限を確認する。
export async function checkDataAccess(pool) {
  await pool.request().query(renderSql(accessTemplate, { table: tableReference }));
}

// 接続先DBを確認してから、実際の列定義に表示形式と検索・並べ替え可否を付けて返す。
// 画面側に列名を固定しないため、表の列構成が変わっても取得した定義に従う。
export async function readColumns(pool) {
  const database = await pool.request().query(databaseQuery);
  if (database.recordset[0]?.name !== applicationDatabaseName) {
    throw new Error(`データ取得先DBには${applicationDatabaseName}を指定してください`);
  }
  const result = await pool.request()
    .input('schemaName', sqlTypes.NVarChar(128), application.data.schema)
    .input('tableName', sqlTypes.NVarChar(128), application.data.table)
    .query(metadataQuery);
  if (!result.recordset.length) {
    throw new Error(`参照先テーブル${application.data.schema}.${application.data.table}が見つからないか、列定義の参照権限がありません`);
  }
  return result.recordset.map(column => ({
    ...column,
    numeric: numericTypes.has(column.type),
    sortable: numericTypes.has(column.type) || textTypes.has(column.type) || dateTypes.has(column.type) || column.type === 'bit',
    searchable: numericTypes.has(column.type) || textTypes.has(column.type) || dateTypes.has(column.type) || column.type === 'bit',
  }));
}

// 🌐 HTTPの値は構文と上限を確認し、SQLへの文字列連結を避ける。
export function parseRecordOptions(query) {
  // ページ番号と表示件数は正の整数に限定し、過大な取得要求も防ぐ。
  const integer = (name, fallback, max) => {
    const raw = query[name] ?? String(fallback);
    if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw) || Number(raw) > max) {
      throw Object.assign(new Error(`${name}の指定が不正です`), { status: 400 });
    }
    return Number(raw);
  };
  const search = query.search ?? '';
  const sort = query.sort ?? '';
  const direction = query.direction ?? 'asc';
  if (typeof search !== 'string' || search.length > 100 || typeof sort !== 'string' || sort.length > 128 || !['asc', 'desc'].includes(direction)) {
    throw Object.assign(new Error('検索・並べ替えの指定が不正です'), { status: 400 });
  }
  return { page: integer('page', 1, 10000000), pageSize: integer('pageSize', 50, 200), search: search.trim(), sort, direction };
}

// 検証済みの列定義と検索条件から、件数確認用・ページ取得用のSQLを組み立てる。
// 検索語や取得範囲はSQLへ直接埋め込まず、getRecordsでパラメーターとして渡す。
export function buildRecordQuery(columns, options) {
  const keys = columns.filter(column => column.keyOrder > 0).sort((a, b) => a.keyOrder - b.keyOrder);
  const sortColumn = options.sort
    ? columns.find(column => column.name === options.sort && column.sortable)
    : keys[0] || columns.find(column => column.sortable);
  if (!sortColumn) {
    throw Object.assign(new Error('並べ替え可能な列がありません'), { status: options.sort ? 400 : 500 });
  }

  // 主キーを補助順序に使い、値が同じ行のページ境界を安定させる。
  const order = [sortColumn, ...keys.filter(column => column.name !== sortColumn.name)]
    .map(column => {
      // 表示用の文字列エイリアスではなく、元テーブルの型で並べ替える。
      const name = renderSql(fragments.qualifiedColumn, { column: identifier(column.name) });
      const expression = ['text', 'ntext'].includes(column.type)
        ? renderSql(fragments.orderText, { column: name })
        : name;
      const template = column === sortColumn && options.direction === 'desc'
        ? fragments.orderDescending
        : fragments.orderAscending;

      return renderSql(template, { column: expression });
    });

  // 大きな数値の桁落ちや日時の自動変換を避け、表示用の値はSQL側で文字列にする。
  const select = columns.map(column => {
    const name = identifier(column.name);
    let expression = name;

    if (column.numeric || dateTypes.has(column.type)) {
      // 書式番号は列の型から固定値を選ぶ。利用者がSQLの式や書式を指定することはできない。
      const style = column.type === 'date' ? 23
        : column.type === 'datetimeoffset' ? 127
        : column.type === 'float' || column.type === 'real' ? 3
        : column.type === 'money' || column.type === 'smallmoney' ? 2
        : 121;

      expression = renderSql(fragments.formattedValue, { column: name, style });
    } else if (binaryTypes.has(column.type)) {
      expression = renderSql(fragments.binaryValue, { column: name });
    } else if (['xml', 'geography', 'geometry', 'hierarchyid'].includes(column.type)) {
      expression = renderSql(column.type === 'xml' ? fragments.xmlValue : fragments.objectValue, { column: name });
    } else if (column.type === 'sql_variant') {
      expression = renderSql(fragments.variantValue, { column: name });
    }

    return renderSql(fragments.selectedColumn, { expression, column: name });
  });

  const searchable = columns.filter(column => column.searchable);

  // LIKE記号は文字そのものとして検索する。
  const pattern = '%' + options.search.replace(/[~%_\[]/g, value => '~' + value) + '%';
  const conditions = searchable.map(column => renderSql(fragments.searchCondition, { column: identifier(column.name) }));
  const where = options.search
    ? renderSql(fragments.searchWhere, { conditions: conditions.join(` ${fragments.searchJoin} `) || fragments.emptySearch })
    : '';

  return {
    count: renderSql(countTemplate, { table: tableReference, where }),
    rows: renderSql(rowsTemplate, {
      table: tableReference,
      columns: select.join(fragments.listJoin + ' '),
      where,
      order: order.join(fragments.listJoin + ' '),
    }),
    pattern,
    sort: sortColumn.name,
    stableOrder: keys.length > 0,
  };
}

// 総件数と指定ページを読み、列定義・ページ情報・取得日時を一覧画面へ返す。
// 閲覧専用の処理で、テーブルへの追加・更新・削除は行わない。
export async function getRecords(pool, sql, options) {
  const columns = await readColumns(pool);
  const query = buildRecordQuery(columns, options);
  const count = await pool.request().input('search', sql.NVarChar(300), query.pattern).query(query.count);
  const total = Number(count.recordset[0].total);
  if (!Number.isSafeInteger(total)) {
    throw new Error('テーブル件数が表示可能な範囲を超えています');
  }
  // 検索で件数が減った場合は最終ページへ補正し、0件でもページ番号を1に保つ。
  const pages = Math.max(1, Math.ceil(total / options.pageSize));
  const page = Math.min(options.page, pages);
  const result = await pool.request()
    .input('search', sql.NVarChar(300), query.pattern)
    .input('offset', sql.BigInt, (page - 1) * options.pageSize)
    .input('limit', sql.Int, options.pageSize)
    .query(query.rows);
  return { ok: true, database: applicationDatabaseName, columns, rows: result.recordset, total, page, pageSize: options.pageSize, pages,
    sort: query.sort, direction: options.direction, stableOrder: query.stableOrder, fetchedAt: new Date().toISOString() };
}
