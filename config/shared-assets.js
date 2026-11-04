// ── 🎨 リセットCSSの配置 ──────────────────────────────
// 隣接プロジェクトに依存せず、同梱したCSSを検査・配布に使用する。
// 開発と本番で同じファイルを使用する。
import path from 'node:path';

export const sharedRessStylesheetPath = path.resolve(import.meta.dirname, '../public/shared/ress.min.css');
