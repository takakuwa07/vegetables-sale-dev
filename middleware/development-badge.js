// 開発画面に、業務サーバーとログサーバーで共通の目印を付ける。
export function addDevelopmentBadge(html) {
  // タブ名と画面内の両方に目印を付ける。バッジの一時非表示は専用のJSに任せる。
  const badge = '<button id="development-environment-badge" type="button" style="position:fixed;top:8px;left:8px;z-index:2147483647;padding:6px 10px;border:0;border-radius:6px;background:#b42318;color:#fff;font:700 13px/1.3 sans-serif;box-shadow:0 2px 8px #0005;cursor:pointer;transition:opacity .7s ease">開発環境（動作確認用）</button><script defer src="/development-badge.js"></script>';
  html = html.replace(/<title\b([^>]*)>([\s\S]*?)<\/title>/i, '<title$1>[DEV] $2</title>');

  // 🧭 画面側に置き場所があればそこへ挿入し、コンパクトなヘッダーの文字を覆わない。
  // 指定のないログ画面等は、従来どおり左上へ固定表示する。
  return html.includes('<!-- development-badge -->')
    ? html.replace('<!-- development-badge -->', badge)
    : html.replace(/<body\b[^>]*>/i, match => match + badge);
}
