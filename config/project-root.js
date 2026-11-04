// ── 📁 プロジェクトの基準フォルダ ─────────────────────────
// このファイルの場所と実行環境から、設定ファイルやログを置く基準を求める。
// 開発中はコードのルート、本番は releases フォルダの親を返す。

import path from 'node:path';
import runtime from '../runtime.json' with { type: 'json' };

// このファイルは開発時は<プロジェクト>/config、
// 本番では<本番ルート>/releases/<版>/configに置かれる。
const releaseDirectory = path.resolve(import.meta.dirname, '..');
let projectRoot = releaseDirectory;

if (runtime.environment === 'production') {
  // 本番の.envと業務ログは各リリースの外にあるため、配置を確認してから親へ戻る。
  // 想定外の場所で起動した場合は、別フォルダへの誤接続・誤記録を防ぐ。
  if (path.basename(path.dirname(releaseDirectory)) === 'releases') {
    projectRoot = path.resolve(releaseDirectory, '../..');
  } else {
    throw new Error('本番コードはreleases/<版>/に配置してください');
  }
}

// 開発ではコードのルート、本番ではリリースをまとめる本番ルートを返す。
export { projectRoot };
