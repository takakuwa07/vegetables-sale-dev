// ── 🚦 本番の接続先切り替えを確認 ─────────────────────────
// 仮の新旧サーバーを起動し、配信を続けながら新版へ切り替えられるか試す。
// 通信完了待ちや失敗時の現行維持、管理処理の再起動後の復元も確かめる。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { manageGateway, gatewayCommand } from '../scripts/production-gateway.js';
import { rollbackProduction } from '../scripts/rollback-prod.js';

test('管理要求は接続を再利用せず、長い同期コピー後も送信できる', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-connection-test-'));
  const connections = [];
  const server = http.createServer(async (req, res) => {
    connections.push(req.headers.connection);
    for await (const _chunk of req) { /* 要求本文を読み終えてから応答する。 */ }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  });
  server.keepAliveTimeout = 50;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  fs.writeFileSync(path.join(root, '.production-gateway.json'), JSON.stringify({ port: server.address().port, token: 'test' }));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  await gatewayCommand(root, 'status');
  await delay(100);
  await gatewayCommand(root, 'prepare', 'next');
  assert.deepEqual(connections, ['close', 'close']);
});

function fixture(root, id, fail = false) {
  const release = path.join(root, 'releases', id);
  fs.mkdirSync(path.join(release, 'log'), { recursive: true });
  fs.writeFileSync(path.join(release, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(release, 'runtime.json'), JSON.stringify({ environment: 'production', version: id }));
  const script = fail ? 'process.exit(1);' : `
import http from 'node:http';
const version = '${id}';
const server = http.createServer(async (req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: ' + version + '\\n\\n');
    return;
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  if (req.url.startsWith('/slow')) await new Promise(resolve => setTimeout(resolve, 1000));
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ status: 'ok', version, pid: process.pid, body, host: req.headers.host, ip: req.headers['x-forwarded-for'], url: req.url }));
}).listen(Number(process.env.PRODUCTION_INTERNAL_PORT), '127.0.0.1', () => {
  process.send({ type: 'production:ready', port: server.address().port });
});
process.on('message', value => { if (value === 'production:stop') { server.closeAllConnections(); server.close(() => process.exit(0)); } });
process.on('disconnect', () => process.exit(0));
`;
  fs.writeFileSync(path.join(release, 'server.js'), script);
  fs.writeFileSync(path.join(release, 'log/server-log.js'), script);
}

test('新版準備中の配信継続、切り替え、旧通信完了、失敗時の現行維持', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-test-'));
  fs.mkdirSync(path.join(root, 'log'));
  fixture(root, 'old'); fixture(root, 'new'); fixture(root, 'broken', true);
  const manager = await manageGateway(root, [0, 0], '127.0.0.1');
  t.after(async () => {
    await manager.close();
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'gateway-test-')));
    fs.rmSync(root, { recursive: true, force: true });
  });
  await gatewayCommand(root, 'prepare', 'old');
  await gatewayCommand(root, 'publish');
  const status = await gatewayCommand(root, 'status');
  const base = `http://127.0.0.1:${status.ports[0]}`;
  const get = async url => {
    const response = await fetch(base + url);
    assert.equal(response.status, 200);
    return response.json();
  };
  const slow = get('/slow?original=1');
  const slowPost = fetch(base + '/slow-post', { method: 'POST' });
  const stream = await fetch(base + '/events');
  const reader = stream.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /old/);
  await delay(30);

  const versions = [];
  let sampling = true;
  const traffic = (async () => {
    while (sampling) {
      versions.push((await get('/')).version);
      await delay(5);
    }
  })();
  try {
    await gatewayCommand(root, 'prepare', 'new');
    assert.equal((await get('/')).version, 'old');
    assert.equal((await get('/api/deployment')).version, 'old');
    await gatewayCommand(root, 'publish');
    assert.equal((await get('/')).version, 'new');
    assert.equal((await get('/api/deployment')).version, 'new');
    assert.equal((await slow).version, 'old');
    assert.equal((await (await slowPost).json()).version, 'old');
    assert.equal((await get('/')).version, 'new');
  } finally { sampling = false; await traffic; }
  assert.ok(versions.includes('old')); assert.ok(versions.includes('new'));
  try { assert.equal((await reader.read()).done, true); } catch { /* SSE切断はEventSourceで再接続される。 */ }

  const echo = await fetch(base + '/echo?keep=1', {
    method: 'POST', headers: { 'x-forwarded-for': 'forged-address' }, body: 'upload-body',
  });
  const echoed = await echo.json();
  assert.equal(echoed.body, 'upload-body'); assert.equal(echoed.url, '/echo?keep=1');
  assert.equal(echoed.ip, '127.0.0.1');
  assert.equal(echoed.host, new URL(base).host);
  await assert.rejects(gatewayCommand(root, 'prepare', 'broken'), /終了しました/);
  assert.equal((await get('/')).version, 'new');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.active-release.json'), 'utf8')).id, 'new');
  await assert.rejects(rollbackProduction(root, 'broken'), /終了しました/);
  assert.equal((await get('/')).version, 'new');
  assert.equal(fs.existsSync(path.join(root, '.deploy.lock')), false);
  await rollbackProduction(root, 'old');
  assert.equal((await get('/')).version, 'old');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.active-release.json'), 'utf8')).id, 'old');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.deployment-ready.json'), 'utf8')).version, 'old');
  await gatewayCommand(root, 'stop');
  await gatewayCommand(root, 'start');
  const restarted = await gatewayCommand(root, 'status');
  assert.equal(restarted.version, 'old');
  assert.equal((await fetch(`http://127.0.0.1:${restarted.ports[0]}/api/health`)).status, 200);
});

test('管理プロセスの再起動時に保存済みの公開リリースを自動復元する', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-restore-test-'));
  fs.mkdirSync(path.join(root, 'log'));
  fixture(root, 'saved');
  let manager = await manageGateway(root, [0, 0], '127.0.0.1');
  t.after(async () => {
    await manager.close();
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'gateway-restore-test-')));
    fs.rmSync(root, { recursive: true, force: true });
  });
  await gatewayCommand(root, 'prepare', 'saved');
  await gatewayCommand(root, 'publish');
  await manager.close();
  manager = await manageGateway(root, [0, 0], '127.0.0.1');
  const state = await gatewayCommand(root, 'status');
  assert.equal(state.release, 'saved');
  assert.equal(state.running, true);
  assert.equal((await fetch(`http://127.0.0.1:${state.ports[0]}/api/health`)).status, 200);
  assert.equal((await gatewayCommand(root, 'start')).alreadyRunning, true);
});
