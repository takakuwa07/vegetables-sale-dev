// 本番HTMLに自動追加される更新検知。通常は利用者が更新し、強制モードは10秒後に更新する。
(() => {
  // 表示中のHTMLに埋め込まれた版番号。公開中の版と比較し、画面の更新が必要か判断する。
  const version = document.currentScript.dataset.version;
  const appName = document.currentScript.dataset.app || '';
  const originalFetch = window.fetch.bind(window);
  let pendingRequests = 0;
  let edited = false;
  let checking = false;
  let notification;
  let detectedVersion;
  let force = false;
  // 残り秒数を減算する代わりに期限時刻を持ち、タイマーの遅れがあっても10秒を基準にする。
  let deadline = 0;
  let countdownTimer;
  let reloading = false;

  // 通常モードではAPI通信と未保存の入力を確認する。アプリ独自の長い処理はsetBusyで知らせる。
  let busy = false;
  window.deploymentUpdate = {
    // fetch以外の長い処理を行う画面は、通常更新を保留する間だけtrueを渡す。
    setBusy(value) { busy = Boolean(value); },
    // 保存済み、または入力内容を破棄してよいと画面側が判断したときに呼ぶ。
    markSaved() { edited = false; },
  };
  // 通常更新の判断に使う通信数を追跡する。例外でもfinallyで必ずカウントを戻す。
  window.fetch = async (...args) => {
    pendingRequests++;
    try {
      const response = await originalFetch(...args);
      // ヘッダー受信後も、JSONやファイルの読み取りが終わるまで更新を待つ。
      for (const method of ['json', 'text', 'blob', 'arrayBuffer', 'formData', 'bytes']) {
        if (typeof response[method] !== 'function') continue;
        const read = response[method].bind(response);
        response[method] = async (...parameters) => {
          pendingRequests++;
          try { return await read(...parameters); }
          finally { pendingRequests--; }
        };
      }
      return response;
    }
    finally { pendingRequests--; }
  };
  // 検索条件などの変更を画面全体で検知し、通常更新時に破棄の確認を出せるようにする。
  document.addEventListener('input', () => { edited = true; }, true);
  document.addEventListener('change', () => { edited = true; }, true);
  document.addEventListener('submit', () => { edited = true; }, true);

  // クリックとタイマーが同時に発火しても、ページの再読み込みは一度だけ実行する。
  function reloadNow() {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  }

  // 通常モードの操作案内、または自動更新までの残り秒数を同じ通知ボタンに表示する。
  function render() {
    if (!notification) return;
    if (force) {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      notification.textContent = `アプリが更新されました。${remaining}秒後に自動更新（クリックで今すぐ更新）。表示条件はリセットされます。`;
    } else {
      notification.textContent = 'アプリが更新されました。クリックで更新できます。表示条件はリセットされます。';
    }
  }

  // 強制モードだけ期限を監視する。処理中や未保存入力があっても期限到達時に更新する。
  function countdown() {
    if (!force || reloading) return;
    if (Date.now() >= deadline) { clearInterval(countdownTimer); reloadNow(); return; }
    render();
  }

  // 通知を重複作成せず、クリック時の処理中確認・未保存入力の確認を登録する。
  function showNotification() {
    if (notification) return;
    // 右上に、太字と青い背景で目に留まる更新通知を重ねる。
    notification = document.createElement('button');
    notification.type = 'button';
    notification.setAttribute('aria-live', 'polite');
    notification.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;box-sizing:border-box;width:360px;max-width:calc(100% - 24px);padding:16px 20px;background:#1d4ed8;color:#fff;border:2px solid #93c5fd;border-radius:10px;box-shadow:0 4px 16px #1e3a8a40;cursor:pointer;text-align:left;font:700 15px/1.7 sans-serif;white-space:normal';
    notification.addEventListener('click', () => {
      if (force) { reloadNow(); return; }
      if (busy || pendingRequests > 0) {
        notification.textContent = '処理が完了してから画面を更新してください。';
        return;
      }
      if (!edited || window.confirm('検索などの表示条件がリセットされます。画面を更新しますか？')) reloadNow();
    });
    document.body.append(notification);
  }

  // 公開済みの版番号と更新方法を問い合わせる。非表示タブと問い合わせの重複は避ける。
  async function check() {
    if (checking || document.hidden) return;
    checking = true;
    try {
      // 更新確認自身の通信は、利用者の操作を保留するpendingRequestsには数えない。
      const response = await originalFetch('/api/deployment-policy?app=' + encodeURIComponent(appName), { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const current = await response.json();
      if (current.status !== 'ok' || typeof current.version !== 'string') return;
      // 切り戻しなどで表示中の版と一致したら、通知と自動更新予約を取り消す。
      if (current.version === version) {
        clearInterval(countdownTimer);
        notification?.remove();
        notification = undefined;
        detectedVersion = undefined;
        force = false;
        return;
      }
      const nextForce = current.updateMode === 'force';
      // 同じ版を再検知しただけではカウントダウンを延長せず、版か更新方法が変わった時だけ設定する。
      if (current.version !== detectedVersion || nextForce !== force) {
        detectedVersion = current.version;
        force = nextForce;
        clearInterval(countdownTimer);
        if (force) {
          deadline = Date.now() + 10000;
          countdownTimer = setInterval(countdown, 250);
        }
      }
      showNotification();
      render();
    } catch {
      // デプロイ中の停止やネットワーク切断では、新しい更新を検知するまで待つ。
    } finally { checking = false; }
  }
  // 定期確認に加え、タブへ戻った時・ネットワーク復帰時にも公開状態を確認する。
  setInterval(check, 3000);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('online', check);
  check();
})();
