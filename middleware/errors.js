// ── ❌ エラー応答の統一 ─────────────────────────────────
// 入力の不備は具体的に伝え、内部障害の詳細はログにだけ記録する。
// APIと画面の未定義URLは、それぞれ404として応答する。

// 他のルートをすべて登録した後に呼び、未定義URLと処理中の例外の応答を統一する。
export default function setupErrors(app) {
  app.use('/api', (req, res) => {
    res.status(404).json({ ok: false, message: 'APIが見つかりません' });
  });
  app.use((req, res) => {
    res.status(404).type('text').send('ページが見つかりません');
  });
  app.use((error, req, res, next) => {
    // 一度ヘッダーを送った応答にはJSONを重ねず、Expressの既定処理へ引き継ぐ。
    if (res.headersSent) {
      return next(error);
    }
    // 入力不備の4xxだけ内容を利用者へ返し、DB例外などの詳細は500としてログに残す。
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    if (status === 500) {
      console.error('リクエストの処理に失敗しました:', error);
    }
    res.status(status).json({ ok: false, message: status === 500
      ? 'データを読み込めませんでした。接続状況を確認して再試行してください。'
      : error.message });
  });
}
