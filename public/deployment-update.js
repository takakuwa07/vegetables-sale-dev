// 本番HTMLに自動追加される更新検知。通常は利用者が更新し、強制モードは10秒後に更新する。
(() => {
  const version = document.currentScript.dataset.version;
  const appName = document.currentScript.dataset.app || '';
  const originalFetch = window.fetch.bind(window);
  let pendingRequests = 0;
  let edited = false;
  let checking = false;
  let notification;
  let detectedVersion;
  let force = false;
  let deadline = 0;
  let countdownTimer;
  let reloading = false;

  // 通常モードではAPI通信と未保存の入力を確認する。アプリ独自の長い処理はsetBusyで知らせる。
  let busy = false;
  window.deploymentUpdate = {
    setBusy(value) { busy = Boolean(value); },
    markSaved() { edited = false; },
  };
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
  document.addEventListener('input', () => { edited = true; }, true);
  document.addEventListener('change', () => { edited = true; }, true);
  document.addEventListener('submit', () => { edited = true; }, true);

  function reloadNow() {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  }

  function render() {
    if (!notification) return;
    if (force) {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      notification.textContent = `アプリが更新されました。${remaining}秒後に自動で画面を更新します。今すぐ更新するにはここをクリックしてください。表示条件はリセットされます。`;
    } else {
      notification.textContent = 'アプリが更新されました。ここをクリックして新しいバージョンへ更新してください。表示条件はリセットされます。';
    }
  }

  function countdown() {
    if (!force || reloading) return;
    if (Date.now() >= deadline) { clearInterval(countdownTimer); reloadNow(); return; }
    render();
  }

  function showNotification() {
    if (notification) return;
    // 画面ごとにヘッダー構造が違うため、共通の上部バナーとして重ねる。
    notification = document.createElement('button');
    notification.type = 'button';
    notification.setAttribute('aria-live', 'polite');
    notification.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;box-sizing:border-box;width:100%;min-height:64px;padding:14px 24px;background:#123e73;color:#fff;border:0;border-bottom:3px solid #86c5ff;box-shadow:0 3px 14px #0005;cursor:pointer;text-align:center;font:600 16px/1.5 sans-serif;white-space:normal';
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

  async function check() {
    if (checking || document.hidden) return;
    checking = true;
    try {
      const response = await originalFetch('/api/deployment-policy?app=' + encodeURIComponent(appName), { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const current = await response.json();
      if (current.status !== 'ok' || typeof current.version !== 'string') return;
      if (current.version === version) {
        clearInterval(countdownTimer);
        notification?.remove();
        notification = undefined;
        detectedVersion = undefined;
        force = false;
        return;
      }
      const nextForce = current.updateMode === 'force';
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
  setInterval(check, 3000);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('online', check);
  check();
})();
