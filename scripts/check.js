// ── 🔍 コードと参照先の確認 ───────────────────────────────
// JavaScriptの構文、ローカルimport、ルート設定のfileを確認する。
// HTMLが参照する画像・CSS・JSなども確認する。
// 対象のJavaScriptは実行せず、外部サービスへの接続もしない。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sharedRessStylesheetPath } from '../config/shared-assets.js';

// scriptsフォルダの1つ上を、検査の開始位置にする。
const root = path.resolve(import.meta.dirname, '..');

// 構文チェックに成功したJavaScriptファイルの数。
let count = 0;

// -----------------------------------------------------------
// 📄 JavaScriptから参照するローカルファイルの確認
// -----------------------------------------------------------
function checkLocalFile(sourceFile, ref, label) {
  // 参照元のJavaScriptがあるフォルダを基準に探す。
  const target = path.resolve(path.dirname(sourceFile), ref);

  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new Error(
      `${label}が見つかりません: ${sourceFile} -> ${ref}`
    );
  }
}

// -----------------------------------------------------------
// ✅ JavaScriptの構文と参照先の確認
// -----------------------------------------------------------
function inspectJavaScript(file) {
  // --checkは構文だけを確認する。対象ファイルは実行しない。
  const result = spawnSync(
    process.execPath,
    ['--check', file],
    { encoding: 'utf8' }
  );

  // Node.jsの起動自体に失敗した場合。
  if (result.error) {
    throw new Error(
      `構文チェックを起動できません: ${file}\n${result.error.message}`
    );
  }

  // 文法の間違いなどで構文チェックに失敗した場合。
  if (result.status !== 0) {
    throw new Error(
      `JavaScriptの構文チェックに失敗しました: ${file}\n` +
      (result.stderr || result.stdout || '詳細を取得できませんでした。')
    );
  }

  count++;

  // ファイルを読み、検査用の文字列からコメントを除く。
  // 元のファイルは変更しない。
  const text = fs.readFileSync(file, 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // 相対パスを直接指定しているimportなどを確認する。
  //
  // 対象例：
  // import { env } from './config/env.js';
  // import './setup.js';
  // await import('./module.js');
  // export { example } from './example.js';
  const importPattern =
    /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"](\.{1,2}\/[^'"]+)['"]/g;

  for (const match of text.matchAll(importPattern)) {
    checkLocalFile(file, match[1], 'ローカルimportの参照先');
  }

  // 先ほどのルート設定にあるfileプロパティも確認する。
  //
  // 対象例：
  // {
  //   url: '/api/jump-folder',
  //   file: './jump-folder/bk-jump.js',
  // }
  //
  // import(route.file)自体を解析するのではなく、
  // fileに直接書かれた相対パスの存在を確認する。
  const routeFilePattern =
    /\bfile\s*:\s*['"](\.{1,2}\/[^'"]+)['"]/g;

  for (const match of text.matchAll(routeFilePattern)) {
    checkLocalFile(file, match[1], 'file設定の参照先');
  }
}

// -----------------------------------------------------------
// 🖼️ HTMLの参照先の確認
// -----------------------------------------------------------
function inspectHtml(file) {
  // HTMLコメントを除き、srcとhrefを探す。
  const html = fs.readFileSync(file, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');

  const assetPattern = /\b(?:src|href)\s*=\s*["']([^"']*)["']/gi;

  for (const match of html.matchAll(assetPattern)) {
    const ref = match[1];

    // 空文字、外部URL、ページ内リンクなどは対象外。
    // https:、data:、mailto:、//example.com、#sectionなど。
    if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) {
      continue;
    }

    // ?以降のクエリと、#以降のページ内位置を除く。
    // 例：/app.js?v=2 → /app.js
    const refPath = ref.split(/[?#]/)[0];

    // ?だけのリンクなど、ファイル指定がないものは対象外。
    if (!refPath) continue;

    let target;

    if (refPath === '/shared/ress.min.css') {
      // 共通CSSは隣接するcast-managementプロジェクトを編集元にする。
      target = sharedRessStylesheetPath;
    } else if (refPath.startsWith('/server-log-viewer/')) {
      // ログ画面のファイルはlog/publicを基準にする。
      target = path.join(
        root,
        'log',
        'public',
        refPath.slice('/server-log-viewer/'.length)
      );
    } else if (refPath.startsWith('/')) {
      // /で始まるパスはpublicを基準にする。
      target = path.join(root, 'public', refPath.slice(1));
    } else {
      // 相対パスは、このHTMLがあるフォルダを基準にする。
      target = path.resolve(path.dirname(file), refPath);
    }

    if (!fs.existsSync(target)) {
      throw new Error(
        `HTMLから参照するファイルが見つかりません: ${file} -> ${ref}`
      );
    }
  }
}

// -----------------------------------------------------------
// 📂 フォルダを再帰的に確認
// -----------------------------------------------------------
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    // 依存パッケージとGit管理情報は検査しない。
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }

    const file = path.join(directory, entry.name);

    // フォルダなら、その中も調べる。
    if (entry.isDirectory()) {
      inspect(file);
      continue;
    }

    if (!entry.isFile()) continue;

    if (file.endsWith('.js')) {
      inspectJavaScript(file);
    } else if (file.endsWith('.html')) {
      inspectHtml(file);
    }
  }
}

// -----------------------------------------------------------
// 🔍 検査の実行
// -----------------------------------------------------------
try {
  inspect(root);

  console.info(
    `JavaScriptの構文（${count}ファイル）、ローカルimport、` +
    'ルート設定のfile、HTMLアセットを確認しました。'
  );
} catch (error) {
  console.error(error.message);

  // npmや呼び出し元へ検査失敗を伝える。
  process.exitCode = 1;
}