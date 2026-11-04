// ── 🌐 レコード一覧API ──────────────────────────────────
// 全列をページ単位で返す、閲覧専用のAPIを登録する。
// 接続は既存の共有プールを利用し、SQLやDBの詳細は利用者へ公開しない。

import express from 'express';
import { sql, getDatabaseConnection } from '../db/connection.js';
import { getRecords, parseRecordOptions } from './data.js';
import application from '../config/application.js';

const router = express.Router();

// 設定された一覧APIで条件を検証し、application接続からレコードを取得する。
// 失敗は共通のエラー処理へ渡し、DBの詳細をそのまま応答に含めない。
router.get(application.data.apiPath.slice('/api'.length), async (req, res, next) => {
  try {
    const options = parseRecordOptions(req.query);
    const pool = await getDatabaseConnection('application');
    res.set('Cache-Control', 'no-store');
    res.json(await getRecords(pool, sql, options));
  } catch (error) {
    next(error);
  }
});

export default router;
