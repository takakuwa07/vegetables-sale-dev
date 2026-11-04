// ── 📦 本番へのデプロイ ───────────────────────────────────
// コードを検査して本番の別フォルダへコピーし、必要なパッケージを準備する。
// 新版の起動を確認してから接続先を切り替える。npm run dep などで実行する。

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { gatewayCommand, launchGateway, managerUnavailable, atomicJson } from './production-gateway.js';
import { cleanupReleaseLogs } from './production-log-retention.js';
import { readPorts } from '../config/ports.js';

// ✅ 許可した実行ファイルのみ、新しいリリースへコピーする。
function deploy(source, destination, { validateOnly = false, updateMode = 'manual', version } = {}) {
  source = fs.realpathSync(source);
  destination = path.resolve(destination);
  // 既存の親のジャンクションも解決し、自己コピーを防ぐ。
  let ancestor = destination;
  const remaining = [];
  while (!fs.existsSync(ancestor)) {
    remaining.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  destination = path.join(fs.realpathSync(ancestor), ...remaining);
  const relative = path.relative(source, destination);
  const reverse = path.relative(destination, source);
  const inside = value => value === '' || (!value.startsWith('..' + path.sep) && value !== '..' && !path.isAbsolute(value));
  if (inside(relative) || inside(reverse)) {
    throw new Error('コピー元とコピー先は同一・親子関係のない別フォルダを指定してください');
  }
  const entries = ['server.js', 'public', 'backend', 'middleware', 'config', 'db/connection.js',
    'package.json', 'package-lock.json', 'log/server-log.js', 'log/backend', 'log/public',
    'log/package.json', 'log/package-lock.json'];
  for (const entry of [...entries, 'scripts/check.js', 'scripts/production-gateway.js', 'pm2.production.json']) {
    if (!fs.existsSync(path.join(source, entry))) {
      throw new Error('コピー元に必要なファイルがありません: ' + entry);
    }
  }
  for (const name of ['package.json', 'package-lock.json', 'log/package.json', 'log/package-lock.json']) {
    JSON.parse(fs.readFileSync(path.join(source, name), 'utf8'));
  }
  if (validateOnly) {
    return;
  }
  if (!/^\d{6}-\d{3}-[A-Za-z0-9]+$/.test(version || '') || !['manual', 'force'].includes(updateMode)) {
    throw new Error('公開バージョンまたは更新方法が不正です');
  }
  if (fs.existsSync(destination)) {
    throw new Error('リリース先は未使用のフォルダを指定してください');
  }
  for (const entry of entries) {
    const target = path.join(destination, entry);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(source, entry), target, { recursive: true });
  }
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8', windowsHide: true });
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: source, encoding: 'utf8', windowsHide: true });
  atomicJson(path.join(destination, 'runtime.json'), {
    environment: 'production', version, updateMode, deployedAt: new Date().toISOString(),
    sourceCommit: git.status === 0 ? git.stdout.trim() : null,
    sourceDirty: status.status === 0 ? Boolean(status.stdout.trim()) : null,
  });
}

function runNode(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('検査またはインストールが失敗しました。終了コード: ' + code)));
  });
}

// デプロイ後に、公開した新版の起動ログだけを端末へ表示する。
// 大きなログでも全体を読み込まないよう、ファイルの末尾から必要な分を読む。
function printRecentAppLogs(destination, releaseId, count = 50) {
  const logFile = path.join(destination, 'log/releases', releaseId, 'server.log');
  let file;
  try {
    file = fs.openSync(logFile, 'r');
    let position = fs.fstatSync(file).size;
    const chunks = [];
    let lineBreaks = 0;
    while (position > 0 && lineBreaks <= count) {
      const length = Math.min(64 * 1024, position);
      position -= length;
      const chunk = Buffer.allocUnsafe(length);
      fs.readSync(file, chunk, 0, length, position);
      chunks.unshift(chunk);
      for (const byte of chunk) if (byte === 10) lineBreaks++;
    }
    const lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    console.info(`公開した新版の起動ログ（最新${count}行）: ${logFile}`);
    console.info(lines.slice(-count).join('\n') || 'ログはまだありません');
  } catch (error) {
    // 公開後のログ表示だけが失敗しても、デプロイ成功を失敗として扱わない。
    console.warn(`公開した新版の起動ログを表示できません: ${logFile} (${error.message})`);
  } finally {
    if (file !== undefined) fs.closeSync(file);
  }
}

// 公開管理プロセスがまだ待ち受けていない初回起動だけ、公開ポートを確認する。
async function ensurePortsFree(ports) {
  for (const port of Object.values(ports)) {
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', () => reject(new Error(`ポート${port}は使用中です。既存のプロセスを確認してください`)));
      probe.listen(port, '0.0.0.0', () => probe.close(resolve));
    });
  }
}

// 版番号の年を除いた部分を先頭に付け、切り戻し時にフォルダを見分けやすくする。
// 作成時刻とUUIDを続け、同じ秒に作ってもフォルダ名が重ならないようにする。
function createReleaseId(version, now = new Date()) {
  if (!/^\d{6}-\d{3}-[A-Za-z0-9]+$/.test(version || '')) throw new Error('リリースの版番号が不正です');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const time = `${parts.hour}${parts.minute}${parts.second}`;
  return `${version.slice(2)}-${time}-${randomUUID()}`;
}

// 識別子は開発者ごとの設定。未設定を共通の名前で埋めない。
function isValidDeployIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9]{3,}$/.test(value)
    && /[A-Z]/.test(value) && /[a-z]/.test(value);
}

function readDeployInitials(source) {
  const envFile = path.join(source, '.env.development');
  if (!fs.existsSync(envFile)) throw new Error('開発環境の.env.developmentがありません');
  const initials = parseEnv(fs.readFileSync(envFile, 'utf8')).DEPLOY_INITIALS;
  if (!isValidDeployIdentifier(initials)) {
    throw new Error('.env.developmentのDEPLOY_INITIALSに英数字3文字以上で、大文字と小文字をそれぞれ含む識別子を設定してください');
  }
  return initials;
}

// デプロイ先は開発者のenvから取得する。誤った相対パスへのコピーを防ぐ。
function readDeployTarget(source) {
  const envFile = path.join(source, '.env.development');
  if (!fs.existsSync(envFile)) throw new Error('開発環境の.env.developmentがありません');
  const target = parseEnv(fs.readFileSync(envFile, 'utf8')).DEPLOY_TARGET_DIR?.trim();
  if (!target || !path.isAbsolute(target)) {
    throw new Error('.env.developmentのDEPLOY_TARGET_DIRに本番フォルダの絶対パスを設定してください');
  }
  const directory = path.resolve(target);
  if (directory === path.parse(directory).root) {
    throw new Error('DEPLOY_TARGET_DIRにドライブのルートは指定できません');
  }
  return directory;
}

// 同じPCで動く開発・本番の公開ポートが重なる設定は、コピーや公開を始める前に拒否する。
function ensureEnvironmentPortsDistinct(source, destination) {
  const developmentPorts = readPorts(source, 'development');
  const productionPorts = readPorts(destination, 'production');
  const conflicts = Object.entries(productionPorts).flatMap(([productionName, port]) =>
    Object.entries(developmentPorts)
      .filter(([, developmentPort]) => developmentPort === port)
      .map(([developmentName]) => `${port}（開発 ${developmentName} / 本番 ${productionName}）`));
  if (conflicts.length) {
    throw new Error(`開発環境と本番環境のポート番号が重複しています: ${conflicts.join('、')}。それぞれの.envファイルを確認してください`);
  }
  return productionPorts;
}

// 同じ日の最大連番を既存リリースと採番記録から調べる。採番記録は過去版を削除しても残す。
function createDeploymentVersion(root, initials, now = new Date()) {
  if (!isValidDeployIdentifier(initials)) throw new Error('開発者識別子が不正です');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: '2-digit', month: '2-digit', day: '2-digit'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const date = `${parts.year}${parts.month}${parts.day}`;
  const sequenceFile = path.join(root, '.version-sequence.json');
  const sequence = fs.existsSync(sequenceFile)
    ? JSON.parse(fs.readFileSync(sequenceFile, 'utf8'))
    : {};
  const recorded = sequence[date] ?? 0;
  if (!Number.isInteger(recorded) || recorded < 0 || recorded > 999) {
    throw new Error('リリース連番の記録が不正です: ' + sequenceFile);
  }
  let latest = recorded;
  const releases = path.join(root, 'releases');
  if (fs.existsSync(releases)) {
    for (const entry of fs.readdirSync(releases, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const runtimeFile = path.join(releases, entry.name, 'runtime.json');
      if (!fs.existsSync(runtimeFile)) continue;
      const version = JSON.parse(fs.readFileSync(runtimeFile, 'utf8')).version;
      const match = new RegExp(`^${date}-(\\d{3})-[A-Za-z0-9]+$`).exec(version);
      if (match) latest = Math.max(latest, Number(match[1]));
    }
  }
  if (latest >= 999) throw new Error(`${date}のリリース連番が上限に達しました`);
  const next = latest + 1;
  atomicJson(sequenceFile, { ...sequence, [date]: next });
  return `${date}-${String(next).padStart(3, '0')}-${initials}`;
}

async function deployProduction(source, destination, updateMode = 'manual') {
  deploy(source, destination, { validateOnly: true });
  const initials = readDeployInitials(source);
  // 初回デプロイでも、本番のDB設定とポートは開発者が明示してから使う。
  // 新しいフォルダの作成と.env.productionの準備方法を示し、設定漏れのまま進めない。
  if (!fs.existsSync(path.join(destination, '.env.production'))) {
    throw new Error(`本番の.env.productionがありません。npm run prod:setupで ${destination} に設定を準備してください`);
  }
  const publicPorts = ensureEnvironmentPortsDistinct(source, destination);
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (!fs.existsSync(npmCli)) throw new Error('npmが見つかりません。npm run depで実行してください');
  await runNode([path.join(source, 'scripts/check.js')], source);
  fs.mkdirSync(destination, { recursive: true });
  // 二重デプロイを防ぐ。異常終了で残った場合は、実行中でないことを確認して削除する。
  const lockPath = path.join(destination, '.deploy.lock');
  let lock;
  // 排他ロックを新規作成し、同時実行中ならここで中断する。
  try { lock = fs.openSync(lockPath, 'wx'); }
  catch { throw new Error('デプロイロックがあります。別のデプロイが実行中でないか確認してください'); }
  try {
    if (fs.existsSync(path.join(destination, '.deployment-scope.json'))) throw new Error('全体公開先に単体専用の設定が残っています');
    // 現行の公開サーバーは止めず、新しいリリースを別フォルダで準備する。
    let gateway;
    // 管理サーバーが未起動なら後続で起動するため、状態取得の失敗を判別する。
    try { gateway = await gatewayCommand(destination, 'status'); }
    catch (error) {
      if (!managerUnavailable(error)) throw error;
    }
    if (gateway && gateway.protocol !== 1) throw new Error('公開サーバーの管理方式に互換性がありません');
    if (gateway?.prepared) throw new Error('準備済みリリースが残っています。管理状態を確認してください');
    if (!gateway?.running) await ensurePortsFree(publicPorts);
    if (gateway) {
      const cleanup = cleanupReleaseLogs(destination, gateway);
      if (cleanup.skipped) console.info('古い起動ログの整理は、旧版の通信完了後のデプロイで行います');
      else if (cleanup.removed) console.info(`30日を超えた起動ログを${cleanup.removed}件整理しました`);
    }


    const now = new Date();
    const version = createDeploymentVersion(destination, initials, now);
    const releaseId = createReleaseId(version, now);
    const releaseDirectory = path.join(destination, 'releases', releaseId);
    deploy(source, releaseDirectory, { updateMode, version });
    console.info('新版のバージョン: ' + version);
    fs.mkdirSync(path.join(destination, 'log'), { recursive: true });
    fs.closeSync(fs.openSync(path.join(destination, 'log/server-app.log'), 'a'));
    for (const directory of [releaseDirectory, path.join(releaseDirectory, 'log')]) {
      console.info('新版の依存パッケージをインストールします（現行版は稼働を継続）: ' + directory);
      await runNode([npmCli, 'ci', '--omit=dev'], directory);
    }

    // 管理用の標準モジュールだけを本番直下に置く。稼働中アプリは上書きしない。
    fs.mkdirSync(path.join(destination, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(source, 'scripts/production-gateway.js'), path.join(destination, 'scripts/production-gateway.js'));
    fs.mkdirSync(path.join(destination, 'config'), { recursive: true });
    fs.copyFileSync(path.join(source, 'config/ports.js'), path.join(destination, 'config/ports.js'));
    fs.copyFileSync(path.join(source, 'pm2.production.json'), path.join(destination, 'pm2.production.json'));
    if (!gateway) {
      await launchGateway(destination);
      gateway = await gatewayCommand(destination, 'status');
    }
    let published = false;
    // 新版の起動確認から公開切り替えまで実施し、失敗時は準備分を破棄する。
    try {
      console.info('新版サーバーを内部ポートで起動し、正常応答を確認します');
      await gatewayCommand(destination, 'prepare', releaseId);
      if (!gateway?.running) {
        // 管理外のプロセスが公開ポートを使っていれば切り替えを中断する。
        await ensurePortsFree(publicPorts);
      }
      await gatewayCommand(destination, 'publish');
      published = true;
      const pkg = fs.existsSync(path.join(destination, 'package.json'))
        ? JSON.parse(fs.readFileSync(path.join(destination, 'package.json'), 'utf8'))
        : { name: 'production-gateway', type: 'module' };
      pkg.scripts = {
        start: 'node scripts/production-gateway.js start',
        stop: 'node scripts/production-gateway.js stop',
        status: 'node scripts/production-gateway.js status',
      };
      atomicJson(path.join(destination, 'package.json'), pkg);
      // 公開成功後にだけブラウザの更新通知を許可する。
      atomicJson(path.join(destination, '.deployment-ready.json'), { version });
      console.info(updateMode === 'force'
        ? '新版へ切り替えました。画面には10秒後の自動更新を通知します'
        : '新版へ切り替えました。画面にはクリック式の更新通知を表示します');
      printRecentAppLogs(destination, releaseId);
    } catch (error) {
      if (!published) {
        await gatewayCommand(destination, 'discard').catch(() => {});
      } else {
        if (gateway?.release) await gatewayCommand(destination, 'prepare', gateway.release)
          .then(() => gatewayCommand(destination, 'publish'))
          .catch(rollbackError => console.error('公開状態の保存失敗後に旧版へ戻せませんでした:', rollbackError.message));
        else await gatewayCommand(destination, 'stop').catch(() => {});
      }
      throw error;
    }
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--force')) {
      throw new Error('使い方: npm run dep / npm run depfo');
    }
    const source = path.resolve(import.meta.dirname, '..');
    await deployProduction(source, readDeployTarget(source), args.includes('--force') ? 'force' : 'manual');
  } catch (error) {
    console.error('本番デプロイに失敗しました:', error.message);
    process.exitCode = 1;
  }
}

export { deploy, deployProduction, createReleaseId, createDeploymentVersion, readDeployInitials, readDeployTarget, ensureEnvironmentPortsDistinct };
