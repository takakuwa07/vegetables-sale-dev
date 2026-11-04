// 🏷️ 画面を開く前から対象が分かるよう、公開してよい情報だけをHTMLへ差し込む。
export function renderLogPage(html, { application, environment, applicationUrl }) {
  const values = {
    logApplicationTitle: application.title,
    logApplicationId: application.id,
    logEnvironment: environment === 'development' ? '開発' : '本番',
    logApplicationUrl: applicationUrl,
  };

  // 設定値は文字として表示し、タグや属性を追加できないようエスケープする。
  return html.replace(/\{\{(logApplicationTitle|logApplicationId|logEnvironment|logApplicationUrl)\}\}/g, (_, key) =>
    String(values[key]).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]));
}
