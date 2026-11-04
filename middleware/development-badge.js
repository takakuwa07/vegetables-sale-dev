// 開発画面に、業務サーバーとログサーバーで共通の目印を付ける。
export function addDevelopmentBadge(html) {
  // タブ名と画面内の両方に目印を付ける。バッジの一時非表示は専用のJSに任せる。
  // 📍 ページ上部中央の最前面へ重ねる。表示用の余白を作らず、本番と同じ配置を保つ。
  const badge = '<button id="development-environment-badge" type="button" style="position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:6px 10px;border:0;border-radius:6px;background:#b42318;color:#fff;font:700 13px/1.3 sans-serif;white-space:nowrap;box-shadow:0 2px 8px #0005;cursor:pointer;transition:opacity .7s ease">開発環境（動作確認用）</button><script defer src="/development-badge.js"></script>';
  html = html.replace(/<title\b([^>]*)>([\s\S]*?)<\/title>/i, '<title$1>[DEV] $2</title>');

  // 🧭 ヘッダーの外に配置し、背景のぼかし等によって固定表示の基準が変わることも防ぐ。
  return html.replace(/<body\b[^>]*>/i, match => match + badge);
}
