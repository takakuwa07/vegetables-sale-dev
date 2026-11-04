// ── 🧩 全APIに共通する準備 ───────────────────────────────
// APIへのアクセスを記録し、送られたJSONやフォームの内容を読み取れるようにする。
// 各APIの処理が始まる前に、Expressへこれらの共通機能を登録する。

import express from 'express';
import { apiLogger } from './logger.js';

// 全APIで使うリクエスト解析とアクセスログを登録する。
export default function setupCommon(app) {
  // 本文解析前に記録を準備し、不正なJSONによるエラーにも接続元情報を付ける。
  app.use('/api', apiLogger);

  // JSON形式の送信内容を、req.bodyで扱えるようにする。
  app.use(express.json());

  // フォーム形式の送信内容も読み込む。extended: trueは入れ子の値にも対応する。
  app.use(express.urlencoded({ extended: true }));

}
