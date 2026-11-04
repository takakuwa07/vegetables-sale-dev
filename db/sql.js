// SQLは.sqlファイルで管理する。ファイルの場所は呼び出し元のimport.meta.urlを基準に渡す。
// テンプレートへの差し込みは検証済みの列名などに限定し、検索語はDBパラメーターで渡す。

import fs from 'node:fs';

// 起動時にSQLを読み込む。ファイルがない場合は起動を止め、SQL未配布のまま公開しない。
export function readSql(fileUrl) {
  if (!fileUrl.pathname.endsWith('.sql')) {
    throw new Error('SQLの読み込み元には.sqlファイルを指定してください');
  }

  return fs.readFileSync(fileUrl, 'utf8').trim();
}

// 動的SQL用の短い断片を、-- @section 名前で区切った1つの.sqlファイルから取り出す。
export function readSqlSections(fileUrl) {
  const text = readSql(fileUrl);
  const markers = [...text.matchAll(/^-- @section ([A-Za-z][A-Za-z0-9]*)\s*$/gm)];
  const sections = Object.create(null);

  if (!markers.length) {
    throw new Error('SQLテンプレートの区切りがありません: ' + fileUrl.pathname);
  }

  for (const [index, marker] of markers.entries()) {
    const name = marker[1];
    const end = markers[index + 1]?.index ?? text.length;
    const value = text.slice(marker.index + marker[0].length, end).trim();

    if (Object.hasOwn(sections, name) || !value) {
      throw new Error('SQLテンプレートの名前が重複しているか、内容が空です: ' + name);
    }

    sections[name] = value;
  }

  return Object.freeze(sections);
}

// {{名前}}を検証済みのSQL断片で置き換える。未設定の差し込み箇所は実行前にエラーにする。
// これは値のエスケープ機能ではないため、利用者の検索語などを直接渡してはいけない。
export function renderSql(template, values) {
  if (typeof template !== 'string') {
    throw new Error('SQLテンプレートが見つかりません');
  }

  return template.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) {
      throw new Error('SQLテンプレートの値がありません: ' + name);
    }

    return String(values[name]);
  });
}
