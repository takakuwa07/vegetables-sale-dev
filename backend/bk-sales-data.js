// ── 🥬 売上テーブルをそのまま読み取る ─────────────────────
// 実際の列名・型・主キーから、安全な閲覧用SQLを組み立てる。
// DBへ書き込まず、日時・大きな数値の情報を落とさず文字列で返す。

import fs from 'node:fs';

const metadataQuery = fs.readFileSync(new URL('./queries/select_sales_columns.sql', import.meta.url), 'utf8');
const numericTypes = new Set(['bigint', 'decimal', 'numeric', 'money', 'smallmoney', 'float', 'real', 'int', 'smallint', 'tinyint']);
const textTypes = new Set(['char', 'varchar', 'text', 'nchar', 'nvarchar', 'ntext', 'uniqueidentifier']);
const dateTypes = new Set(['date', 'datetime', 'datetime2', 'smalldatetime', 'time', 'datetimeoffset']);
const binaryTypes = new Set(['binary', 'varbinary', 'image', 'timestamp']);

// 列名はDBで取得したものに限り、閉じ括弧もSQL Serverの規則でエスケープする。
function identifier(name) {
  return '[' + name.replaceAll(']', ']]') + ']';
}

export async function readSalesColumns(pool) {
  const database = await pool.request().query('SELECT DB_NAME() AS name;');
  if (database.recordset[0]?.name !== 'vegetables_maintenance_db') {
    throw new Error('application接続先はvegetables_maintenance_dbを指定してください');
  }
  const result = await pool.request().query(metadataQuery);
  if (!result.recordset.length) {
    throw new Error('dbo.t_vegetable_salesが見つからないか、列定義の参照権限がありません');
  }
  return result.recordset.map(column => ({
    ...column,
    numeric: numericTypes.has(column.type),
    sortable: numericTypes.has(column.type) || textTypes.has(column.type) || dateTypes.has(column.type) || column.type === 'bit',
    searchable: numericTypes.has(column.type) || textTypes.has(column.type) || dateTypes.has(column.type) || column.type === 'bit',
  }));
}

// 🌐 HTTPの値は構文と上限を確認し、SQLへの文字列連結を避ける。
export function parseSalesOptions(query) {
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

export function buildSalesQuery(columns, options) {
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
      const name = identifier(column.name);
      const expression = ['text', 'ntext'].includes(column.type) ? `CONVERT(nvarchar(max), ${name})` : name;
      return `${expression} ${column === sortColumn && options.direction === 'desc' ? 'DESC' : 'ASC'}`;
    });
  const select = columns.map(column => {
    const name = identifier(column.name);
    let expression = name;
    if (column.numeric || dateTypes.has(column.type)) {
      expression = `CONVERT(nvarchar(100), ${name}, ${column.type === 'date' ? 23 : column.type === 'datetimeoffset' ? 127 : column.type === 'float' || column.type === 'real' ? 3 : column.type === 'money' || column.type === 'smallmoney' ? 2 : 121})`;
    } else if (binaryTypes.has(column.type)) {
      expression = `CONVERT(varchar(max), CONVERT(varbinary(max), ${name}), 1)`;
    } else if (['xml', 'geography', 'geometry', 'hierarchyid'].includes(column.type)) {
      expression = column.type === 'xml' ? `CONVERT(nvarchar(max), ${name})` : `${name}.ToString()`;
    } else if (column.type === 'sql_variant') {
      expression = `CONVERT(nvarchar(max), ${name})`;
    }
    return `${expression} AS ${name}`;
  });
  const searchable = columns.filter(column => column.searchable);
  // LIKE記号は文字そのものとして検索する。
  const pattern = '%' + options.search.replace(/[~%_\[]/g, value => '~' + value) + '%';
  const where = options.search
    ? 'WHERE (' + (searchable.map(column => `CONVERT(nvarchar(max), ${identifier(column.name)}, 121) LIKE @search ESCAPE N'~'`).join(' OR ') || '1 = 0') + ')'
    : '';
  return {
    count: `SELECT COUNT_BIG(*) AS total FROM dbo.t_vegetable_sales ${where};`,
    rows: `SELECT ${select.join(', ')} FROM dbo.t_vegetable_sales ${where} ORDER BY ${order.join(', ')} OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`,
    pattern,
    sort: sortColumn.name,
    stableOrder: keys.length > 0,
  };
}

export async function getSales(pool, sql, options) {
  const columns = await readSalesColumns(pool);
  const query = buildSalesQuery(columns, options);
  const count = await pool.request().input('search', sql.NVarChar(300), query.pattern).query(query.count);
  const total = Number(count.recordset[0].total);
  if (!Number.isSafeInteger(total)) {
    throw new Error('テーブル件数が表示可能な範囲を超えています');
  }
  const pages = Math.max(1, Math.ceil(total / options.pageSize));
  const page = Math.min(options.page, pages);
  const result = await pool.request()
    .input('search', sql.NVarChar(300), query.pattern)
    .input('offset', sql.BigInt, (page - 1) * options.pageSize)
    .input('limit', sql.Int, options.pageSize)
    .query(query.rows);
  return { ok: true, columns, rows: result.recordset, total, page, pageSize: options.pageSize, pages,
    sort: query.sort, direction: options.direction, stableOrder: query.stableOrder, fetchedAt: new Date().toISOString() };
}
