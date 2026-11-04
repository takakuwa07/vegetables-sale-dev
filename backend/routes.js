// ── 🧩 単一アプリのAPI登録 ──────────────────────────────
// backend直下の売上APIだけを登録する。
// アプリ一覧や複数アプリ用の動的読み込みは使用しない。

import salesRouter from './bk-vegetable-sales.js';

export default function registerRoutes(app) {
  app.use('/api', salesRouter);
}
