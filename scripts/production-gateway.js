// ── 🚦 本番の接続先を切り替える管理処理 ───────────────────
// 利用者が接続するポートを保ち、通信を現在公開中のアプリへ転送する。
// 新版を別に起動・確認してから切り替え、旧版への通信が終わるのを待つ。

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fork, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readPorts } from '../config/ports.js';

const defaultRoot = path.resolve(import.meta.dirname, '..');
const stateName = '.production-gateway.json';

// 一時ファイルへ全体を書いてから置き換え、読取側が書きかけのJSONを読むことを防ぐ。
export function atomicJson(file, data) {
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

// デプロイ・切り戻しコマンドから、同じPCの管理APIへ操作を依頼する。
// 管理ポートと認証トークンは起動時の状態ファイルから読み、毎回接続を閉じる。
export async function gatewayCommand(root, action, release) {
  const state = JSON.parse(fs.readFileSync(path.join(root, stateName), 'utf8'));
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${state.port}/`, {
      method: 'POST', headers: { Authorization: `Bearer ${state.token}`, Connection: 'close' },
      body: JSON.stringify({ action, release }), signal: AbortSignal.timeout(100000),
    });
  } catch (error) {
    const detail = error.cause?.code || error.cause?.message || error.name;
    error.message = `本番管理サーバーへの${action}要求に失敗しました（${detail}）: ${error.message}`;
    throw error;
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

// 管理プロセスの未起動と判断できる失敗だけを選ぶ。認証・操作内容のエラーは隠さない。
export function managerUnavailable(error) {
  return error.code === 'ENOENT' || error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED';
}

// ターミナルを閉じても動く管理プロセスを起動し、そのPIDの管理APIが応答するまで待つ。
// 管理プロセス自身の標準出力とエラーはgateway.logへ追記する。
export async function launchGateway(root) {
  fs.mkdirSync(path.join(root, 'log'), { recursive: true });
  const output = fs.openSync(path.join(root, 'log/gateway.log'), 'a');
  const child = spawn(process.execPath, [path.join(root, 'scripts/production-gateway.js'), 'manage'], {
    cwd: root, detached: true, windowsHide: true, stdio: ['ignore', output, output],
  });
  fs.closeSync(output);
  let spawnError;
  child.once('error', error => { spawnError = error; });
  child.unref();
  // PC再起動後は保存済みリリースの起動確認にも時間がかかる。
  for (let attempt = 0; attempt < 400; attempt++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null || child.signalCode !== null) break;
    try { if ((await gatewayCommand(root, 'status')).managerPid === child.pid) return; }
    catch { /* 起動中は待つ。 */ }
    await delay(200);
  }
  child.kill();
  throw new Error('公開サーバーを起動できません。log/gateway.logを確認してください');
}

// 1区間のHTTP接続だけで有効なヘッダーを除き、転送先へ接続設定を持ち越さない。
function stripHopHeaders(headers) {
  const result = { ...headers };
  const extra = String(headers.connection || '').toLowerCase().split(',').map(value => value.trim());
  for (const key of ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', ...extra]) delete result[key];
  return result;
}

// 公開ポートで通信を受け、起動確認済みのリリースへ転送する管理サーバーを作る。
// テストでは専用の一時フォルダと公開ポート0を指定でき、戻り値のcloseで終了できる。
export async function manageGateway(root, publicPorts, host = '0.0.0.0') {
  if (fs.existsSync(path.join(root, '.deployment-scope.json'))) {
    throw new Error('旧方式のアプリ専用公開先は使用できません');
  }
  const ports = publicPorts || readPorts(root, 'production');
  const configured = Array.isArray(ports) ? ports : [ports.APP_PORT, ports.LOG_PORT];
  const token = randomBytes(32).toString('hex');
  // 現在、新しいリクエストを受け付ける公開版。
  let active;
  // 内部ポートで起動確認を済ませ、公開切り替えを待つ版。
  let candidate;
  // prepare・publish・stopなど、状態を変更する管理操作の実行中フラグ。
  let busy = false;
  // 切り替え後、既存の通信が完了するまで残す旧版。
  const retiring = new Set();
  const listeners = [];
  const currentFile = path.join(root, '.active-release.json');

  // 管理要求のリリース名を、本番のreleases内にある実フォルダへ解決する。
  function releasePath(id) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('リリース名が不正です');
    const directory = path.join(root, 'releases', id);
    if (!fs.statSync(directory).isDirectory()) throw new Error('リリースフォルダがありません');
    // 管理APIから、releases外を向くリンクや別環境を起動しない。
    if (!fs.realpathSync(directory).startsWith(fs.realpathSync(path.join(root, 'releases')) + path.sep)) throw new Error('リリースフォルダの配置が不正です');
    return directory;
  }

  // 1リリースのアプリとログサーバーを停止する。同じ版への停止要求は1回にまとめる。
  async function stopRelease(release) {
    if (!release) return;
    if (release.stopping) return release.stopping;
    release.stopping = (async () => {
      for (const stream of release.streams) stream.destroy();
      await Promise.all(release.children.map(child => new Promise(resolve => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        // まず通常の終了処理を依頼し、応答しない子プロセスは10秒後に終了させる。
        const timeout = setTimeout(() => child.kill(), 10000);
        child.once('exit', () => { clearTimeout(timeout); resolve(); });
        if (child.connected) child.send('production:stop', error => { if (error) child.kill(); });
        else child.kill();
      })));
      retiring.delete(release);
    })();
    return release.stopping;
  }

  // 旧版の通常リクエストがすべて終わった時点で停止する。公開版は停止しない。
  function drain(release) {
    if (!release || release === active || release.inflight.size) return;
    void stopRelease(release).catch(error => console.error('旧版の停止失敗:', error.message));
  }

  // 新版を内部ポートで起動し、公開版の通信を継続したままヘルスチェックする。
  // 両サーバーが応答した場合だけcandidateに登録し、失敗時は起動した子を片付ける。
  async function prepare(id) {
    if (candidate) throw new Error('すでに準備中のリリースがあります');
    const directory = releasePath(id);
    const runtime = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json'), 'utf8'));
    if (runtime.environment !== 'production' || !runtime.version) throw new Error('本番リリースの設定が不正です');
    if (runtime.appName !== undefined) {
      throw new Error('旧方式のアプリ専用リリースは公開できません');
    }
    // 通常通信とSSEの接続を別々に追跡し、切り替え後の停止タイミングを判断する。
    const release = { id, version: runtime.version, children: [], ports: [], inflight: new Set(), streams: new Set() };
    // アプリとログサーバーを起動して応答を確認する。途中で失敗した子プロセスは停止する。
    try {
      const outputDirectory = path.join(root, 'log', 'releases', id);
      fs.mkdirSync(outputDirectory, { recursive: true });
      const scripts = ['server.js', 'log/server-log.js'];
      const readyTasks = scripts.map((script, index) => {
        // index=0はアプリ、index=1はログ閲覧。公開ポート・内部ポートも同じ順で対応する。
        const outputFile = path.join(outputDirectory, index === 0 ? 'server.log' : 'log-server.log');
        const output = fs.openSync(outputFile, 'a');
        const child = fork(path.join(directory, script), [], {
          cwd: root, windowsHide: true,
          env: { ...process.env, PRODUCTION_INTERNAL_PORT: '0' },
          stdio: ['ignore', output, output, 'ipc'],
        });
        fs.closeSync(output);
        release.children.push(child);
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('新版の起動を60秒以内に確認できませんでした')), 60000);
          const failed = error => { clearTimeout(timeout); reject(error); };
          child.once('error', failed);
          child.once('exit', () => failed(new Error('新版サーバーが終了しました。' + outputFile + 'を確認してください')));
          child.once('message', message => {
            clearTimeout(timeout);
            if (message?.type !== 'production:ready' || !Number.isInteger(message.port) || message.port < 1) return reject(new Error('新版の起動通知が不正です'));
            release.ports[index] = message.port;
            resolve();
          });
        });
      });
      await Promise.all(readyTasks);
      // 起動通知だけでは成功にせず、版番号とPIDも照合して別プロセスへの誤接続を防ぐ。
      for (const [index, port] of release.ports.entries()) {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000) });
        const data = await response.json();
        if (!response.ok || data.version !== release.version || data.pid !== release.children[index].pid) throw new Error('新版の正常応答を確認できませんでした');
      }
      candidate = release;
      return { version: release.version };
    } catch (error) { await stopRelease(release); throw error; }
  }

  // 公開ポートへのリクエストを、受付時点の公開版の内部ポートへ中継する。
  function proxy(index, req, res) {
    const release = active; // 通信開始時の接続先を保持し、途中で新版へ変更しない。
    if (!release) { res.writeHead(503); return res.end('本番サーバーは停止中です'); }
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/deployment') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ status: 'ok', version: release.version }));
    }
    const entry = {};
    release.inflight.add(entry);
    let upstream;
    let upstreamResponse;
    let completed = false;
    let downstreamClosed = false;
    // end・error・closeが重なっても、通信完了の後片付けと旧版の停止判定は1回だけ行う。
    function done() {
      if (completed) return;
      completed = true;
      release.inflight.delete(entry);
      release.streams.delete(res);
      drain(release);
    }
    const headers = stripHopHeaders(req.headers);
    // 利用者が送った転送元情報は採用せず、実際の接続元IPを業務サーバーへ渡す。
    headers['x-forwarded-for'] = req.socket.remoteAddress;
    headers['x-forwarded-proto'] = 'http';
    headers['x-forwarded-host'] = req.headers.host;
    upstream = http.request({ hostname: '127.0.0.1', port: release.ports[index], path: req.url, method: req.method, headers, agent: false }, response => {
      upstreamResponse = response;
      if (String(response.headers['content-type']).startsWith('text/event-stream')) {
        // SSEは再接続できる。旧版の停止を永久に妨げないよう、通常の通信と分ける。
        release.inflight.delete(entry);
        release.streams.add(res);
        if (release !== active) { response.destroy(); res.destroy(); done(); return; }
      }
      if (downstreamClosed) response.resume();
      else { res.writeHead(response.statusCode, stripHopHeaders(response.headers)); response.pipe(res); }
      response.once('end', done);
      response.once('error', () => { res.destroy(); done(); });
      response.once('close', done);
    });
    upstream.once('error', error => {
      console.error('本番への通信失敗:', error.message);
      if (!res.headersSent && !res.destroyed) { res.writeHead(502); res.end('サーバーとの通信に失敗しました'); }
      else res.destroy();
      done();
    });
    req.once('aborted', () => { upstream.destroy(); done(); });
    res.once('close', () => {
      downstreamClosed = true;
      // 完了したリクエストの業務処理は、ブラウザが切断しても応答完了まで待つ。
      if (release.streams.has(res)) { upstreamResponse?.destroy(); upstream.destroy(); done(); }
    });
    req.pipe(upstream);
  }

  // 起動確認済みの候補を公開版にする。公開ポートは維持し、旧版の通信は完了まで待つ。
  async function publish() {
    if (!candidate) throw new Error('起動確認済みの新版がありません');
    if (candidate.children.some(child => child.exitCode !== null || child.signalCode !== null)) throw new Error('新版が終了したため切り替えを中断しました');
    if (!listeners.length) {
      try {
        for (const [index, port] of configured.entries()) {
          const server = http.createServer((req, res) => proxy(index, req, res));
          server.requestTimeout = 0;
          await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
          listeners.push(server);
        }
      } catch (error) {
        await Promise.all(listeners.splice(0).map(server => new Promise(resolve => server.close(resolve))));
        throw error;
      }
    }
    // 再起動後も同じリリースを起動できるよう保存してから、接続先を一度に切り替える。
    try { atomicJson(currentFile, { id: candidate.id, version: candidate.version }); }
    catch (error) {
      if (!active) {
        await Promise.all(listeners.splice(0).map(server => {
          server.closeAllConnections();
          return new Promise(resolve => server.close(resolve));
        }));
      }
      throw error;
    }
    const previous = active;
    active = candidate;
    candidate = undefined;
    if (previous) {
      retiring.add(previous);
      for (const stream of previous.streams) stream.destroy();
      drain(previous);
    }
    return { version: active.version };
  }

  // 公開版・準備中・通信完了待ちの全プロセスと、公開ポートの待ち受けを終了する。
  async function stopAll() {
    const releases = [active, candidate, ...retiring];
    active = candidate = undefined;
    // 明示的なstopだけは、利用中の通信も含めて停止する。
    await Promise.all(releases.map(stopRelease));
    for (const listener of listeners.splice(0)) {
      listener.closeAllConnections();
      await new Promise(resolve => listener.close(resolve));
    }
  }

  // PM2やWindowsサービスから直接manageを起動した場合、保存済みの公開版を復元する。
  // 起動できなければ管理プロセスも失敗終了し、公開中と誤認させない。
  if (fs.existsSync(currentFile)) {
    try {
      await prepare(JSON.parse(fs.readFileSync(currentFile, 'utf8')).id);
      await publish();
    } catch (error) {
      await stopAll();
      throw error;
    }
  }

  // 管理APIはループバックだけで待ち受け、起動ごとに作ったトークンで操作元を確認する。
  const control = http.createServer(async (req, res) => {
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${token}`) return reply(403, { error: '管理要求が許可されていません' });
    try {
      let text = '';
      for await (const chunk of req) { text += chunk; if (text.length > 2048) throw new Error('管理要求が長すぎます'); }
      const { action, release } = JSON.parse(text);
      if (action === 'status') return reply(200, {
        protocol: 1, managerPid: process.pid, running: Boolean(active),
        version: active?.version, release: active?.id, prepared: candidate?.id,
        draining: retiring.size, ports: listeners.map(server => server.address().port),
      });
      // 状態照会以外は同時に実行しない。準備中に別の切り替えや停止が割り込むのを防ぐ。
      if (busy) return reply(409, { error: '公開サーバーを操作中です' });
      busy = true;
      try {
        let result = { ok: true };
        // prepareで確認 → publishで切り替え。discardは公開前の候補だけを取り消す。
        if (action === 'prepare') result = await prepare(release);
        else if (action === 'publish') result = await publish();
        else if (action === 'discard') { await stopRelease(candidate); candidate = undefined; }
        else if (action === 'start') {
          if (active) result = { version: active.version, alreadyRunning: true };
          else { await prepare(JSON.parse(fs.readFileSync(currentFile, 'utf8')).id); result = await publish(); }
        }
        // stopはアプリを停止して管理APIを残す。exitは応答後に管理プロセスも終了する。
        else if (action === 'stop' || action === 'exit') await stopAll();
        else throw new Error('不明な管理操作です');
        reply(200, result);
        if (action === 'exit') control.close(() => process.exit(0));
      } finally { busy = false; }
    } catch (error) { reply(500, { error: error.message }); }
  });
  await new Promise((resolve, reject) => { control.once('error', reject); control.listen(0, '127.0.0.1', resolve); });
  atomicJson(path.join(root, stateName), { port: control.address().port, token });
  return { close: async () => { await stopAll(); await new Promise(resolve => control.close(resolve)); } };
}

// PM2はES moduleを内部ラッパーからimportするため、import.meta.mainだけでは判定できない。
const startedByPm2 = process.env.pm_exec_path
  && path.resolve(process.env.pm_exec_path).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (import.meta.main || startedByPm2) {
  try {
    const action = process.argv[2];
    if (action === 'manage') {
      const manager = await manageGateway(defaultRoot);
      let closing = false;
      // OSやPM2から終了を求められたら、子プロセスを含めて停止してから終了する。
      const shutdown = async () => {
        if (closing) return;
        closing = true;
        try { await manager.close(); process.exit(0); }
        catch (error) { console.error('公開サーバーの停止に失敗しました:', error); process.exit(1); }
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
      process.once('disconnect', shutdown);
      process.on('message', message => { if (message === 'shutdown') void shutdown(); });
      process.send?.('ready');
    }
    else if (['start', 'stop', 'status', 'exit'].includes(action)) {
      if (action === 'start') {
        try { await gatewayCommand(defaultRoot, 'status'); }
        catch (error) { if (!managerUnavailable(error)) throw error; await launchGateway(defaultRoot); }
      }
      console.info('公開サーバーの操作結果:', await gatewayCommand(defaultRoot, action));
    } else throw new Error('start・stop・status・exitのいずれかを指定してください');
  } catch (error) { console.error('公開サーバーの操作に失敗しました:', error.message); process.exitCode = 1; }
}
