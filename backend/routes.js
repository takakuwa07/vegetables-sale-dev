// ── 🧩 単一アプリのAPI登録 ──────────────────────────────
// backend直下の一覧APIを登録する。
// アプリ一覧や複数アプリ用の動的読み込みは使用しない。

import recordsRouter from './records.js';

// 一覧ルーターを/api配下へ登録する。URLはapplication.jsonで管理する。
export default function registerRoutes(app) {
  app.use('/api', recordsRouter);
}
