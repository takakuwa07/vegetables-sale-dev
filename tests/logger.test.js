// ── 📝 ログの表示形式を確認 ───────────────────────────────
// ログに接続元IPがない場合の表示を作り、決められた形式か調べる。
// IPの代わりに15文字のハイフンが入ることを確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLogMessage } from '../middleware/logger.js';

test('IPが不明なログは15文字のハイフンで表示する', () => {
  const message = formatLogMessage('info', '確認');
  assert.match(message, /\[---------------\] \[INFO\] 確認$/);
});
