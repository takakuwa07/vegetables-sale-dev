// 開発画面に、業務サーバーとログサーバーで共通の目印を付ける。
export function addDevelopmentBadge(html) {
  const badge = '<button id="development-environment-badge" type="button" style="position:fixed;top:8px;left:8px;z-index:2147483647;padding:6px 10px;border:0;border-radius:6px;background:#b42318;color:#fff;font:700 13px/1.3 sans-serif;box-shadow:0 2px 8px #0005;cursor:pointer;transition:opacity .7s ease">開発環境（動作確認用）</button><script defer src="/development-badge.js"></script>';
  return html
    .replace(/<title\b([^>]*)>([\s\S]*?)<\/title>/i, '<title$1>[DEV] $2</title>')
    .replace(/<body\b[^>]*>/i, match => match + badge);
}
