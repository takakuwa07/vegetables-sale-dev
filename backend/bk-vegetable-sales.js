// ── 🌐 売上一覧API ──────────────────────────────────────
// 全列をページ単位で返す、閲覧専用のAPIを登録する。
// 接続は既存の共有プールを利用し、SQLやDBの詳細は利用者へ公開しない。

import express from 'express';
import { sql, getDatabaseConnection } from '../db/connection.js';
import { getSales, parseSalesOptions } from './bk-sales-data.js';

const router = express.Router();

router.get('/sales', async (req, res, next) => {
  try {
    const options = parseSalesOptions(req.query);
    const pool = await getDatabaseConnection('application');
    res.set('Cache-Control', 'no-store');
    res.json(await getSales(pool, sql, options));
  } catch (error) {
    next(error);
  }
});

export default router;
