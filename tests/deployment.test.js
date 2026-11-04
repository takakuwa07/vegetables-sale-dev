// ── 🔄 画面の更新通知を確認 ───────────────────────────────
// 本番のHTMLに更新確認の仕組みが入り、公開状態やキャッシュが正しく扱われるか試す。
// 通知の表示、利用者の操作中の保留、強制更新の動きも再現して確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import setupFrontend from '../middleware/frontend.js';
import { setupHealth } from '../middleware/deployment.js';

test('本番HTMLに更新検知を追加し、キャッシュと更新公開を制御する', async t => {
  const app = express();
  setupHealth(app);
  await setupFrontend(app, { isDevelopment: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const url of ['/', '/index.html']) {
    const response = await fetch(base + url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /deployment-update\.js.*data-version=/);
  }
  assert.equal((await fetch(base + '/api/health')).status, 200);
  assert.equal((await fetch(base + '/api/deployment')).status, 503);
  assert.equal((await fetch(base + '/api/deployment-policy')).status, 503);
  assert.equal((await fetch(base + '/deployment-update.js')).headers.get('cache-control'), 'no-cache');
});

// DOM・API・時計を置き換え、実際のブラウザを再読み込みせずに通知と10秒の期限を再現する。
function browser() {
  const events = new Map();
  const notices = [];
  let tick;
  let countdown;
  let now = 0;
  let current = 'old';
  let updateMode = 'manual';
  let unavailable = false;
  let reloads = 0;
  const node = () => ({ style: {}, setAttribute() {}, remove() {}, addEventListener(name, handler) { this[name] = handler; } });
  const document = {
    currentScript: { dataset: { version: 'old' } }, hidden: false,
    addEventListener(name, handler) { events.set(name, handler); },
    createElement: node, body: { append(element) { notices.push(element); } },
  };
  const window = {
    fetch: async () => { if (unavailable) throw new Error('停止中'); return { ok: true, json: async () => ({ status: 'ok', version: current, updateMode }) }; },
    location: { reload() { reloads++; } }, addEventListener() {}, confirm: () => false,
  };
  vm.runInNewContext(fs.readFileSync(new URL('../public/deployment-update.js', import.meta.url), 'utf8'), {
    window, document, Date: { now: () => now }, AbortSignal,
    setInterval(fn, duration) { if (duration === 3000) tick = fn; else countdown = fn; return duration; },
    clearInterval() {},
  });
  return {
    window, events, notices, tick: () => tick(),
    update: (mode = 'manual') => { current = 'new'; updateMode = mode; },
    advance: milliseconds => { now += milliseconds; countdown?.(); },
    offline: () => { unavailable = true; }, reloads: () => reloads,
  };
}

test('新版は通知だけ表示し、入力・同期処理・サーバー停止中も強制更新しない', async () => {
  const idle = browser();
  await delay(0); idle.update(); await idle.tick();
  assert.equal(idle.reloads(), 0);
  assert.equal(idle.notices.length, 1);
  const edited = browser();
  await delay(0); edited.events.get('input')(); edited.update(); await edited.tick();
  assert.equal(edited.reloads(), 0); assert.equal(edited.notices.length, 1);
  edited.window.deploymentUpdate.markSaved(); await edited.tick();
  assert.equal(edited.reloads(), 0);
  const busy = browser();
  await delay(0); busy.window.deploymentUpdate.setBusy(true); busy.update(); await busy.tick();
  assert.equal(busy.reloads(), 0);
  const offline = browser();
  await delay(0); offline.update(); offline.offline(); await offline.tick();
  assert.equal(offline.reloads(), 0);
});

test('通常モードは右上の更新通知をクリックして更新する', async () => {
  const page = browser();
  await delay(0); page.update(); await page.tick();
  assert.match(page.notices[0].style.cssText, /top:12px;right:12px/);
  assert.match(page.notices[0].style.cssText, /width:360px;max-width:calc\(100% - 24px\)/);
  page.notices[0].click();
  assert.equal(page.reloads(), 1);
});

test('通常モードは作業中や未保存の入力がある場合に更新を保留する', async () => {
  const page = browser();
  await delay(0); page.update(); await page.tick();
  page.window.deploymentUpdate.setBusy(true);
  page.notices[0].click();
  assert.equal(page.reloads(), 0);
  page.window.deploymentUpdate.setBusy(false);
  page.events.get('input')();
  page.notices[0].click();
  assert.equal(page.reloads(), 0);
  page.window.deploymentUpdate.markSaved();
  page.notices[0].click();
  assert.equal(page.reloads(), 1);
});

test('強制モードは10秒をカウントダウンし、処理中でも自動更新する', async () => {
  const page = browser();
  await delay(0);
  page.events.get('input')();
  page.window.deploymentUpdate.setBusy(true);
  page.update('force'); await page.tick();
  assert.match(page.notices[0].textContent, /10秒後/);
  page.advance(9000);
  assert.match(page.notices[0].textContent, /1秒後/);
  assert.equal(page.reloads(), 0);
  page.advance(1000);
  assert.equal(page.reloads(), 1);
});

test('強制モードは通知をクリックすると10秒を待たず更新する', async () => {
  const page = browser();
  await delay(0); page.update('force'); await page.tick();
  page.notices[0].click();
  assert.equal(page.reloads(), 1);
});

