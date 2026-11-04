// 業務ログを初回はHTTP取得し、その後はSSEで更新を受け取って表示する。
// 表示用の色付けと旧形式の変換はブラウザ内だけで行い、元のログは書き換えない。
// -----------------------------------------------------------
// ✅ 要素を変数化
// -----------------------------------------------------------
const connectionStatusEl = document.getElementById('connection-status');
const logFilePathEl = document.getElementById('log-file-path');
const lastUpdatedEl = document.getElementById('last-updated');
const logLineCountEl = document.getElementById('log-line-count');
const logFileSizeEl = document.getElementById('log-file-size');
const logOutputEl = document.getElementById('log-output');

// 初回は最新位置へ。過去のログを読んでいる間は、更新で位置を動かさない。
let hasRenderedLog = false;

// -----------------------------------------------------------
// ✅ 初期実行
// -----------------------------------------------------------
startLogViewer();

// -----------------------------------------------------------
// ✅ 関数
// ログビューアーを開始する
// -----------------------------------------------------------
async function startLogViewer() {
  // 最初に現在のログを1回読み込む
  await fetchCurrentLog();

  // server-app.log が更新されたら、サーバーから通知を受け取る
  connectLogStream();
}

// -----------------------------------------------------------
// ✅ 関数
// 現在のログをAPIから取得する
// -----------------------------------------------------------
async function fetchCurrentLog() {
  try {
    const res = await fetch('/api/server-log-viewer/log');
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.message || 'ログ取得に失敗しました');
    }

    renderLog(data);
    setConnectionStatus('live', '接続中');

  } catch (error) {
    console.log('現在のログの取得に失敗しました:', error);
    setConnectionStatus('error', '取得失敗');
    logOutputEl.innerText = `ログ取得に失敗しました\n${error.message}`;
    logOutputEl.style.visibility = 'visible';
  }
}

// -----------------------------------------------------------
// ✅ 関数
// SSEでログ更新通知を受け取る
// -----------------------------------------------------------
function connectLogStream() {
  // EventSource は、サーバーからの一方向通知を受け取る仕組み
  const eventSource = new EventSource('/api/server-log-viewer/stream');

  // 接続が開いたとき
  eventSource.onopen = () => {
    setConnectionStatus('live', '接続中');
  };

  // サーバーから message が届いたとき
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      renderLog(data);
      setConnectionStatus('live', '接続中');

    } catch (error) {
      console.log('ログ更新通知の処理に失敗しました:', error);
      setConnectionStatus('error', '受信エラー');
    }
  };

  // 接続エラー時
  // EventSource は自動再接続するため、ここでは画面表示だけ変更する
  eventSource.onerror = () => {
    setConnectionStatus('error', '再接続中');
  };
}


// -----------------------------------------------------------
// ✅ 関数
// ログ行をHTML化する
// ERRORを含む行だけ赤く表示する
// -----------------------------------------------------------
function createHighlightedLogHtml(lines) {
  // ログが空のとき
  if (!lines || lines.length === 0) {
    return '<span class="log-line">server-app.log は空です</span>';
  }

  return lines.map(line => {
    // HTMLとして危険な文字を無害化
    // 日時とIPだけ別の色を付ける。本文も含め、HTMLとして解釈される文字は無害化する。
    const prefix = line.match(/^(\[\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\])( )(\[[^\]]+\])(.*)$/);
    // IP不明欄と通常のconsoleログのIPは、日時と同じ水色にする。
    const ipClass = prefix && (/^\[-+\]$/.test(prefix[3]) || /^\s*\[(?:LOG|INFO|WARN|ERROR|DEBUG)\]/.test(prefix[4]))
      ? 'log-ip is-unknown'
      : 'log-ip';
    const safeLine = prefix
      ? `<span class="log-date">${escapeHtml(prefix[1])}</span>${prefix[2]}<span class="${ipClass}">${escapeHtml(prefix[3])}</span>${escapeHtml(prefix[4])}`
      : escapeHtml(line);

    // -------------------------------------------------------
    // ✅ ERROR判定
    // -------------------------------------------------------
    // 基本は ERROR という文字を含む行を赤くする。
    // 念のため Error: のようなJavaScriptエラー表記も対象にする。
    const isErrorLine = /\bERROR\b|Error:/i.test(line);

    if (isErrorLine) {
      return `<span class="log-line is-error">${safeLine}</span>`;
    }

    // nodemonが業務サーバーを起動する行は、ターミナルと同様に緑色で表示する。
    if (/\[nodemon\]\s+starting\b/.test(line)) {
      return `<span class="log-line is-starting">${safeLine}</span>`;
    }

    // バージョン・操作案内・監視設定など、nodemonの案内は黄色で表示する。
    if (/\[nodemon\]\s+(?:\d+\.\d+\.\d+\b|to restart\b|watching\b)/.test(line)) {
      return `<span class="log-line is-nodemon-info">${safeLine}</span>`;
    }

    return `<span class="log-line">${safeLine}</span>`;
  }).join('');
}

// -----------------------------------------------------------
// ✅ 関数
// HTMLとして危険な文字を無害化する
// -----------------------------------------------------------
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -----------------------------------------------------------
// ✅ 関数
// 接続状態の表示を切り替える
// -----------------------------------------------------------
function setConnectionStatus(type, text) {
  connectionStatusEl.classList.remove('is-waiting', 'is-live', 'is-error');

  if (type === 'live') {
    connectionStatusEl.classList.add('is-live');
  } else if (type === 'error') {
    connectionStatusEl.classList.add('is-error');
  } else {
    connectionStatusEl.classList.add('is-waiting');
  }

  connectionStatusEl.innerText = text;
}


// -----------------------------------------------------------
// ✅ 関数
// ログ情報を画面に表示する
// -----------------------------------------------------------
function renderLog(data) {
  const logText = data.logText || '';

  logFilePathEl.innerText = data.logFilePath || '---';
  lastUpdatedEl.innerText = data.lastUpdated || '---';
  logLineCountEl.innerText = `${data.displayedLineCount || 0} 行`;
  logFileSizeEl.innerText = data.fileSizeText || '---';

  // 更新前に最下部を見ていたか確認する。上へスクロールしていれば、その位置を保つ。
  const previousScrollTop = logOutputEl.scrollTop;
  const followLatest = !hasRenderedLog ||
    logOutputEl.scrollHeight - logOutputEl.clientHeight - previousScrollTop <= 40;

  // ファイルの追記順（古い → 新しい）を維持する。例外のスタックも行順を崩さない。
  const lines = logText.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();

  // 以前のUTC形式のログも、日本時間の表示へ変換する。ファイル自体は書き換えない。
  const displayLines = lines.map(line => line
    // 旧起動スクリプトが付けた日時と、新しい[日時]が重なっている場合は後者だけ残す。
    .replace(/^\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} .*?(?=\[\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\])/, '')
    // 以前のIP不明欄も、15個のハイフンへそろえる。
    .replace(/(\[\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\] )\[(?:\s*-\s*-\s*|-+)\]\s+/,
      (_, date) => date + `[${'-'.repeat(15)}] `)
    // 既存のAPI応答ログも、新しい表示形式へそろえる。
    .replace(/(\[\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\] \[[^\]]+\]\s+\S+ )\[INFO\] (?=\/\S* status=\d{3} time=\d+ms$)/, '$1')
    // 通常のconsole出力に付いていたHTTPメソッドは取り除く。接続元IPは残す。
    .replace(/(\[\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\] \[[^\]]+\]\s+)(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE|-) (?=\[(?:LOG|INFO|WARN|ERROR|DEBUG)\])/, '$1')
    .replace(
    /^\[(\d{4}-\d{2}-\d{2}T[^\]]+Z)\]/,
    (match, timestamp) => {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return match;
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Tokyo', year: '2-digit', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).formatToParts(date);
      const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
      return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}:${values.second}`;
    }
  ));

  // HTML文字を無害化し、エラーの強調表示は継続する。
  logOutputEl.innerHTML = createHighlightedLogHtml(displayLines);
  logOutputEl.scrollTop = followLatest ? logOutputEl.scrollHeight : previousScrollTop;
  // ページ全体は固定し、最下部への移動もログ本文のscrollTopだけで行う。
  logOutputEl.style.visibility = 'visible';
  hasRenderedLog = true;
}
