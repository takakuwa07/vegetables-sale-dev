// ── 📋 レコードの閲覧 ───────────────────────────────────
// 全列を安全なテキストとして表示し、検索・並べ替え・ページ移動を行う。
// 通信失敗時は以前の値を残し、その値が最新ではないことを伝える。

(() => {
  // 表示名とAPIのURLはサーバーが検証した画面用設定を使う。
  const application = JSON.parse(document.getElementById('application-settings').textContent);
  const element = id => document.getElementById(id);
  // 検索・並べ替え・ページ移動で共有する表示条件。loadingは二重取得を防ぐために使う。
  const state = { page: 1, pageSize: 50, search: '', sort: '', direction: 'asc', pages: 1, loading: false };
  const numberFormat = new Intl.NumberFormat('ja-JP');
  let hasData = false;

  // 取得中は一覧の操作を無効化し、取得後は先頭・最終ページに合わせてボタンを戻す。
  function setLoading(loading) {
    state.loading = loading;
    element('table-region').setAttribute('aria-busy', String(loading));
    for (const node of document.querySelectorAll('button, select')) {
      // 更新通知のボタンはデータ読込の無効化対象に含めない。
      if (node.closest('.data-panel')) {
        node.disabled = loading;
      }
    }
    if (!loading) {
      element('first-page').disabled = state.page <= 1;
      element('previous-page').disabled = state.page <= 1;
      element('next-page').disabled = state.page >= state.pages;
      element('last-page').disabled = state.page >= state.pages;
    }
  }

  // APIの列定義から見出しと行を作り直す。DBの値はtextContentで表示し、HTMLとして実行しない。
  function renderTable(data) {
    const header = document.createElement('tr');
    for (const column of data.columns) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.classList.toggle('numeric', column.numeric);
      if (column.sortable) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = column.name;
        const indicator = document.createElement('span');
        indicator.setAttribute('aria-hidden', 'true');
        const active = state.sort === column.name;
        indicator.textContent = active ? state.direction === 'asc' ? '▲' : '▼' : '↕';
        th.setAttribute('aria-sort', active ? state.direction === 'asc' ? 'ascending' : 'descending' : 'none');
        button.append(indicator);
        button.addEventListener('click', () => {
          state.direction = state.sort === column.name && state.direction === 'asc' ? 'desc' : 'asc';
          state.sort = column.name;
          state.page = 1;
          load();
        });
        th.append(button);
      } else {
        th.textContent = column.name;
      }
      header.append(th);
    }
    element('table-head').replaceChildren(header);
    const fragment = document.createDocumentFragment();
    for (const row of data.rows) {
      const tr = document.createElement('tr');
      for (const column of data.columns) {
        const td = document.createElement('td');
        const value = row[column.name];
        td.classList.toggle('numeric', column.numeric);
        if (value === null || value === undefined) {
          td.textContent = 'NULL';
          td.classList.add('null-value');
        } else {
          td.textContent = typeof value === 'object' ? JSON.stringify(value) : String(value);
        }
        tr.append(td);
      }
      fragment.append(tr);
    }
    element('table-body').replaceChildren(fragment);
    element('empty-state').hidden = data.rows.length > 0;
    element('order-warning').hidden = data.stableOrder;
    element('table-region').scrollTop = 0;
  }

  // 🌐 通信には時間制限を設け、失敗時も再取得操作を使える状態に戻す。
  async function load() {
    if (state.loading) {
      return;
    }
    setLoading(true);
    const message = element('message');
    message.hidden = false;
    message.classList.remove('is-error');
    message.textContent = 'データを読み込んでいます…';
    element('connection-status').textContent = '読込中';
    element('connection-status').classList.remove('is-error');
    try {
      const query = new URLSearchParams({ page: state.page, pageSize: state.pageSize, search: state.search, sort: state.sort, direction: state.direction });
      const response = await fetch(application.apiPath + '?' + query, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'データを取得できませんでした。');
      }
      // サーバーが補正したページ番号や実際の並べ替え列を、次回の操作にも引き継ぐ。
      Object.assign(state, { page: data.page, pages: data.pages, sort: data.sort, direction: data.direction });
      renderTable(data);
      // 開発の-devも含め、実際に取得に使った接続先を表示する。
      element('database-name').textContent = data.database;
      element('total-count').textContent = numberFormat.format(data.total);
      element('column-count').textContent = data.columns.length;
      element('last-fetched').textContent = new Date(data.fetchedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
      element('last-fetched').dateTime = data.fetchedAt;
      element('range-label').textContent = data.total === 0 ? '0 件' : `${numberFormat.format((data.page - 1) * data.pageSize + 1)}–${numberFormat.format((data.page - 1) * data.pageSize + data.rows.length)} / ${numberFormat.format(data.total)} 件`;
      element('page-label').textContent = `${data.page} / ${numberFormat.format(data.pages)}`;
      element('result-context').textContent = state.search ? `「${state.search}」の検索結果 · 全列を表示` : '全列を表示';
      element('connection-status').textContent = '取得完了';
      message.hidden = true;
      hasData = true;
    } catch (error) {
      message.classList.add('is-error');
      message.textContent = (error.name === 'TimeoutError' ? '通信がタイムアウトしました。再取得してください。' : error.message)
        + (hasData ? ' 前回取得したデータを表示しています。' : ' 「再取得」からやり直してください。');
      element('connection-status').textContent = '取得失敗';
      element('connection-status').classList.add('is-error');
    } finally {
      setLoading(false);
    }
  }

  // ⌨️ 検索条件は送信時に確定し、各操作は先頭ページから適用する。
  element('search-form').addEventListener('submit', event => {
    event.preventDefault();
    if (state.loading) {
      return;
    }
    state.search = element('search-input').value.trim();
    state.page = 1;
    load();
  });
  element('page-size').addEventListener('change', () => {
    state.pageSize = Number(element('page-size').value);
    state.page = 1;
    load();
  });
  element('refresh-button').addEventListener('click', load);
  // 移動先はクリック時の最新状態から求め、存在するページの範囲内に収める。
  for (const [id, page] of [
    ['first-page', () => 1], ['previous-page', () => state.page - 1],
    ['next-page', () => state.page + 1], ['last-page', () => state.pages],
  ]) {
    element(id).addEventListener('click', () => {
      state.page = Math.max(1, Math.min(state.pages, page()));
      load();
    });
  }
  // 本番HTMLに埋め込まれた公開版番号を表示する。開発では版番号がないため環境名を表示する。
  const version = document.querySelector('script[data-version]')?.dataset.version;
  element('app-version').textContent = version ? `版 ${version}` : '開発環境';
  load();
})();
