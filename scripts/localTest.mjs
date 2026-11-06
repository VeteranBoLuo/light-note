import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, openSync, closeSync, readFileSync, writeFileSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { stopManagedChild } from './localProcessLifecycle.mjs';
import { localTestPorts } from '../apps/server/util/localTestPorts.js';
import { assertLocalTestEnvironment } from '../apps/server/util/localTestEnvironment.js';

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');
const stateDir = path.join(root, '.local-test');
const serverDir = path.join(root, 'apps/server');
const envFile = path.join(stateDir, 'server.env');
const stateFile = path.join(stateDir, 'processes.json');
const lockFile = path.join(stateDir, 'launcher.lock');
const requireServer = createRequire(path.join(serverDir, 'package.json'));
const dotenv = requireServer('dotenv');
const mysql = requireServer('mysql2/promise');
const command = process.argv[2] || 'status';
const savedPortConfig = existsSync(envFile) ? dotenv.parse(readFileSync(envFile)) : {};
if (process.env.LIGHTNOTE_LOCAL_PORT_OFFSET != null && savedPortConfig.LIGHTNOTE_LOCAL_PORT_OFFSET != null &&
    process.env.LIGHTNOTE_LOCAL_PORT_OFFSET !== savedPortConfig.LIGHTNOTE_LOCAL_PORT_OFFSET) throw new Error('LOCAL_TEST_PORT_PROFILE_CONFLICT');
const { offset: portOffset, storagePorts, ...ports } = localTestPorts({ ...savedPortConfig, ...process.env });
const workspaceHash = createHash('sha256').update(root).digest('hex').slice(0, 10);
const containerName = `lightnote-local-mysql-${workspaceHash}`;
// macOS Unix socket 最多 104 字节，工作树路径不能作为 Lima 的 socket 前缀。
const vmDir = path.join(os.homedir(), '.codex', 'local-vms', workspaceHash);
const children = [];
let stopping = false;
let ownsLock = false;

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function readState() {
  try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; }
}
function isManager(state) {
  if (!state || !alive(state.pid)) return false;
  try {
    const args = execFileSync('ps', ['-p', String(state.pid), '-o', 'command='], { encoding: 'utf8' });
    return args.includes(script) && args.includes('_serve');
  } catch { return false; }
}
function saveState(status, detail = '') {
  writeFileSync(stateFile, JSON.stringify({ pid: process.pid, status, detail, children: children.map(c => ({ label: c.label, pid: c.pid })), updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}
function privateWrite(file, body) {
  writeFileSync(file, body, { mode: 0o600 });
  chmodSync(file, 0o600);
}
function executable(name) {
  try { return execFileSync('/bin/sh', ['-c', 'command -v "$1"', 'local-test', name], { encoding: 'utf8' }).trim(); }
  catch { throw new Error(`缺少 ${name}。macOS 可先运行 brew install colima docker redis seaweedfs mailpit。`); }
}
function canConnect(port) {
  return new Promise(resolve => {
    const client = net.createConnection({ host: '127.0.0.1', port });
    let done = false;
    const finish = value => { if (done) return; done = true; client.destroy(); resolve(value); };
    client.setTimeout(300);
    client.once('connect', () => finish(true));
    client.once('error', () => finish(false));
    client.once('timeout', () => finish(false));
  });
}
async function waitPort(port, child, timeout = 60000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (stopping || child?.exitCode != null || child?.signalCode) throw new Error(`服务未能启动，检查 .local-test/logs/ 下对应日志（端口 ${port}）。`);
    if (await canConnect(port)) return;
    await sleep(250);
  }
  throw new Error(`等待端口 ${port} 超时。`);
}
function defaultFaviconEntry() {
  const sibling = path.join(root, '../toolkit/favimg/src/index.js');
  if (existsSync(sibling)) return sibling;
  const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
  return path.resolve(root, commonDir, '../../toolkit/favimg/src/index.js');
}
function prepareConfig() {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  chmodSync(stateDir, 0o700);
  mkdirSync(vmDir, { recursive: true, mode: 0o700 });
  for (const dir of ['mysql57', 'redis', 'objects', 'uploads', 'thumbnails', 'drawing', 'files', 'exports', 'tmp', 'logs', 'colima', 'docker-config']) mkdirSync(path.join(stateDir, dir), { recursive: true, mode: 0o700 });
  if (!existsSync(envFile)) {
    const secret = () => randomBytes(32).toString('hex');
    const env = {
      NODE_ENV: 'development', LIGHTNOTE_RUNTIME_ENV: 'local', LIGHTNOTE_LOCAL_TEST: '1',
      LIGHTNOTE_LOCAL_TEST_DIR: stateDir, LIGHTNOTE_LOCAL_PORT_OFFSET: String(portOffset), DOTENV_CONFIG_PATH: envFile,
      LIGHTNOTE_DATABASE_SCOPE: 'local', ALLOW_REMOTE_DATABASE_READS: 'false', ALLOW_REMOTE_DATABASE_WRITES: 'false',
      DB_HOST: '127.0.0.1', DB_PORT: String(ports.mysql), DB_NAME: 'lightnote_local', DB_USER: 'lightnote_local', DB_PASSWORD: secret(),
      REDIS_URL: `redis://:${secret()}@127.0.0.1:${ports.redis}`,
      OBS_ENDPOINT: `http://127.0.0.1:${ports.storage}`, OBS_BUCKET_NAME: 'lightnote-local', OBS_AK: secret().slice(0, 20), OBS_SK: secret(),
      SMTP_HOST: '127.0.0.1', SMTP_PORT: String(ports.smtp), SMTP_USER: 'noreply@lightnote.test', SMTP_PASS: '', SECURE_COOKIE: '0',
      SITE_URL: `http://localhost:${ports.web}`, VITE_ENV: 'local',
      FAVICON_API_BASE_URL: `http://127.0.0.1:${ports.favicon}/`, LIGHTNOTE_LOCAL_FAVICON_ENTRY: defaultFaviconEntry(),
      SESSION_SECRET: secret(), RESOURCE_GOVERNANCE_TOKEN_SECRET: secret(), COLLECTION_FORMS_IDENTITY_SECRET: secret(),
      LIGHT_NOTE_IMAGE_DIR: path.join(stateDir, 'uploads'), BOOKMARK_ICON_UPLOAD_DIR: path.join(stateDir, 'uploads'),
      NOTE_IMAGE_THUMBNAIL_DIR: path.join(stateDir, 'thumbnails'), DATA_EXPORT_STORAGE_DIR: path.join(stateDir, 'exports'),
      DRAWING_THUMBNAIL_DIR: path.join(stateDir, 'drawing'),
      TMPDIR: path.join(stateDir, 'tmp'), TZ: 'Asia/Shanghai',
      BROWSER_PUSH_ENABLED: 'false', HUAWEI_PUSH_ENABLED: 'false', SEO_PUSH_ENABLED: 'false',
      SUPPORT_PACKAGES_CHECKOUT_ENABLED: 'false', SUPPORT_PACKAGES_GRANT_ENABLED: 'false', SUPPORT_CAMPAIGNS_ENABLED: 'false',
      POINTS_ECONOMY_C4_ENABLED: 'true', POINTS_ECONOMY_REQUIRE_WRITE_VERSION: 'true',
      IMAGE_PREVIEW_GENERATION_ENABLED: 'true', IMAGE_PREVIEW_NOTES_ENABLED: 'true', IMAGE_PREVIEW_CLOUD_ENABLED: 'true', IMAGE_PREVIEW_CLEANUP_ENABLED: 'false',
      KNOWLEDGE_MANOR_ENABLED: 'true', KNOWLEDGE_MANOR_AUDIENCE: 'all',
      COMMUNITY_CHAT_ACCESS_MODE: 'public', COMMUNITY_CHAT_MESSAGING_ENABLED: 'true', COMMUNITY_CHAT_FILES_ENABLED: 'true',
      COMMUNITY_CHAT_POLLS_ENABLED: 'true', COMMUNITY_CHAT_READ_RECEIPTS_ENABLED: 'true', COMMUNITY_CHAT_REALTIME_ENABLED: 'true',
      COMMUNITY_FEED_ENABLED: 'true', COMMUNITY_FEED_WRITES_ENABLED: 'true', COMMUNITY_FEED_WORKER_ENABLED: 'true', COMMUNITY_AI_REVIEW_ENABLED: 'false',
      PUBLIC_RESOURCES_ENABLED: 'true', PUBLIC_RESOURCES_SUBMISSIONS_ENABLED: 'true', PUBLIC_RESOURCES_AI_ENABLED: 'false',
      WEB_PAGE_RENDERER_ENABLED: 'true',
    };
    privateWrite(envFile, Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n');
    privateWrite(path.join(stateDir, 'mysql-admin.json'), JSON.stringify({ password: secret() }));
  }
  let source = readFileSync(envFile, 'utf8');
  const env = dotenv.parse(source);
  const defaults = { LIGHTNOTE_LOCAL_PORT_OFFSET: String(portOffset), AI_LEVEL_GIFT_MODE: 'off', AI_DAILY_QUOTA_MODE: 'level',
    AI_DAILY_BRIEF_PLATFORM_BILLING: 'off', AI_RESERVATION_CALIBRATION_MODE: 'legacy', AI_DAILY_BRIEF_DAILY_QUOTA: '66000', POINTS_ECONOMY_C11_ENABLED: 'false',
    AI_GIFT_NETWORK_REGISTRATION_LIMIT: '3', AI_GIFT_GLOBAL_REGISTRATION_LIMIT: '20', AI_GIFT_NEW_ACCOUNT_TOKEN_LIMIT: '500000',
    // 积分获取 C5–C8 与积分经济 C10 对齐线上开关和生效边界，本机看到的每日/每周奖励、商店和抽奖与线上一致。
    // C8 成就快照由 localTestBootstrap 在缺失时补齐；已有值（含用户自行改过的）一律保留。
    POINTS_EARNING_C5_ENABLED: 'true', POINTS_EARNING_C5_EFFECTIVE_DAY: '20260815', POINTS_EARNING_C5_EFFECTIVE_WEEK: '202634',
    POINTS_EARNING_C6_ENABLED: 'true', POINTS_EARNING_C6_EFFECTIVE_DAY: '20260820',
    POINTS_EARNING_C7_ENABLED: 'true', POINTS_EARNING_C7_EFFECTIVE_WEEK: '202639',
    POINTS_EARNING_C8_ENABLED: 'true', POINTS_EARNING_C8_EFFECTIVE_DAY: '20261024', POINTS_EARNING_C8_EFFECTIVE_WEEK: '202644',
    POINTS_ECONOMY_C5_ENABLED: 'true', POINTS_ECONOMY_C6_ENABLED: 'true', POINTS_ECONOMY_C7_ENABLED: 'true',
    POINTS_ECONOMY_C8_ENABLED: 'true', POINTS_ECONOMY_C9_ENABLED: 'true', POINTS_ECONOMY_C10_ENABLED: 'true',
    POINTS_POINTS_CENTER_ENABLED: 'true', POINTS_ADMIN_GOVERNANCE_V2_ENABLED: 'true', POINTS_CAMPAIGN_ENABLED: 'true',
    POINTS_CAMPAIGN_MAX_RECIPIENTS: '500', POINTS_CAMPAIGN_MAX_POINTS_PER_USER: '1000', POINTS_CAMPAIGN_MAX_TOTAL_POINTS: '500000' };
  for (const [key, value] of Object.entries(defaults)) {
    if (env[key] !== undefined) continue;
    source += `${source.endsWith('\n') ? '' : '\n'}${key}=${JSON.stringify(value)}\n`;
    env[key] = value;
  }
  privateWrite(envFile, source);
  assertLocalTestEnvironment(env);
  return env;
}
function childEnv(config) {
  // 使用白名单继承系统运行环境；不继承任何线上服务凭据或数据库豁免。
  const env = {};
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'SYSTEMROOT', 'WINDIR']) if (process.env[key]) env[key] = process.env[key];
  return { ...env, ...config };
}
function run(label, executablePath, args, env, { persistent = true, cwd = root } = {}) {
  if (stopping) throw new Error('本机测试环境正在停止，已取消启动。');
  const fd = openSync(path.join(stateDir, 'logs', `${label}.log`), 'w', 0o600);
  const child = spawn(executablePath, args, { cwd, env, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  child.label = label;
  children.push(child);
  if (ownsLock) saveState('starting');
  child.on('error', () => { if (!stopping) void shutdown(1, `${label}无法启动`); });
  child.on('exit', (code) => {
    if (!persistent) { children.splice(children.indexOf(child), 1); if (ownsLock && !stopping) saveState('starting'); }
    if (!stopping && persistent) void shutdown(code || 1, `${label}意外退出`);
  });
  return child;
}
async function oneShot(label, executablePath, args, env, cwd = serverDir) {
  const child = run(label, executablePath, args, env, { persistent: false, cwd });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${label}失败；检查 .local-test/logs/${label}.log。`)));
  });
}
async function shutdown(code = 0, detail = '') {
  if (stopping) return;
  stopping = true;
  if (ownsLock) saveState('stopping', detail);
  let failed = false;
  const applications = children.filter(child => child.label.endsWith('-worker') || ['api', 'web'].includes(child.label));
  const stopped = await Promise.allSettled(applications.map(child => stopManagedChild(child, { graceMs: 5000, killMs: 5000 })));
  if (stopped.some(result => result.status === 'rejected')) failed = true;
  for (const child of [...children].reverse().filter(child => !applications.includes(child))) {
    if (child.label === 'mysql') {
      try { execFileSync(executable('docker'), ['stop', '--time', '20', containerName], { env: dockerEnv(), stdio: 'ignore', timeout: 30000 }); }
      catch { failed = true; }
    }
    try { await stopManagedChild(child, { graceMs: 10000, killMs: 5000 }); }
    catch { failed = true; }
  }
  if (ownsLock) {
    saveState(failed || code ? 'failed' : 'stopped', detail);
    rmSync(lockFile, { force: true });
  }
  if (!code && !failed) {
    try { execFileSync(executable('colima'), ['stop'], { env: dockerEnv(), stdio: 'ignore', timeout: 60000 }); }
    catch { console.error('[本机测试] Colima 未能正常停止，请检查专属虚拟机状态。'); }
  }
  process.exit(failed || code ? 1 : 0);
}
async function initializeDatabase(env) {
  const adminConfig = JSON.parse(readFileSync(path.join(stateDir, 'mysql-admin.json'), 'utf8'));
  let db;
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    try { db = await mysql.createConnection({ host: '127.0.0.1', port: ports.mysql, user: 'root', password: adminConfig.password, connectTimeout: 2000 }); break; }
    catch { await sleep(500); }
  }
  if (!db) throw new Error('MySQL 5.7 未就绪；检查 .local-test/logs/mysql.log。');
  try {
    const [[version]] = await db.query('SELECT VERSION() AS version');
    if (!version.version.startsWith('5.7.')) throw new Error('本机测试要求独立 MySQL 5.7，拒绝连接其他实例。');
    await db.query('CREATE DATABASE IF NOT EXISTS lightnote_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await db.query("CREATE USER IF NOT EXISTS 'lightnote_local'@'%' IDENTIFIED BY ?", [env.DB_PASSWORD]);
    await db.query("GRANT ALL PRIVILEGES ON lightnote_local.* TO 'lightnote_local'@'%'");
  } finally { await db.end(); }
}
function dockerEnv() {
  const proxies = {};
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy']) if (process.env[name]) proxies[name] = process.env[name];
  return { ...childEnv({}), ...proxies, COLIMA_HOME: vmDir, DOCKER_CONFIG: path.join(stateDir, 'docker-config'), DOCKER_HOST: `unix://${vmDir}/default/docker.sock` };
}
async function serve(migrateOnly = false) {
  const config = prepareConfig();
  if (existsSync(lockFile)) {
    const oldPid = Number(readFileSync(lockFile, 'utf8'));
    if (alive(oldPid)) throw new Error('本地测试环境已经在启动或运行。');
    rmSync(lockFile);
  }
  writeFileSync(lockFile, String(process.pid), { flag: 'wx', mode: 0o600 });
  ownsLock = true;
  saveState('starting');
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
  try {
    for (const port of [...Object.values(ports), ...storagePorts]) if (await canConnect(port)) throw new Error(`本地端口 ${port} 已占用；未结束原有进程。`);
    const env = childEnv(config);
    for (const binary of ['docker', 'colima', 'redis-server', 'weed', 'mailpit', 'pnpm']) executable(binary);
    if (!existsSync(config.LIGHTNOTE_LOCAL_FAVICON_ENTRY || '')) throw new Error('缺少本机工具箱 favimg 源码；请在同级准备 toolkit，或在 .local-test/server.env 设置 LIGHTNOTE_LOCAL_FAVICON_ENTRY。');
    let dockerReady = false;
    try { execFileSync(executable('docker'), ['info', '--format', '{{.ServerVersion}}'], { env: dockerEnv(), stdio: 'ignore', timeout: 3000 }); dockerReady = true; }
    catch { /* 冷启动才启动专属虚拟机；不重复执行已在线虚拟机的初始化。 */ }
    if (!dockerReady) await oneShot('docker-vm', executable('colima'), ['start', '--cpu', '2', '--memory', '4', '--disk', '20', '--vm-type=vz', '--vz-rosetta', '--activate=false'], dockerEnv(), root);
    const admin = JSON.parse(readFileSync(path.join(stateDir, 'mysql-admin.json'), 'utf8'));
    privateWrite(path.join(stateDir, 'mysql-root-password'), admin.password);
    const database = run('mysql', executable('docker'), ['run', '--rm', '--name', containerName, '--platform', 'linux/amd64', '--publish', `127.0.0.1:${ports.mysql}:3306`, '--mount', `type=bind,source=${stateDir}/mysql57,target=/var/lib/mysql`, '--mount', `type=bind,source=${stateDir}/mysql-root-password,target=/run/secrets/mysql-root-password,readonly`, '--env', 'MYSQL_ROOT_PASSWORD_FILE=/run/secrets/mysql-root-password', '--env', 'MYSQL_ROOT_HOST=%', 'mysql:5.7.44', '--skip-log-bin', '--skip-name-resolve', '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci', '--default-time-zone=+08:00', '--innodb-buffer-pool-size=134217728', '--max-connections=120'], dockerEnv());
    await waitPort(ports.mysql, database);
    await initializeDatabase(config);
    const redisPassword = decodeURIComponent(new URL(config.REDIS_URL).password);
    const redisConfig = path.join(stateDir, 'redis.conf');
    privateWrite(redisConfig, `bind 127.0.0.1\nport ${ports.redis}\nprotected-mode yes\nrequirepass ${redisPassword}\ndir "${stateDir}/redis"\nsave 60 1\nappendonly no\n`);
    await waitPort(ports.redis, run('redis', executable('redis-server'), [redisConfig], env));
    privateWrite(path.join(stateDir, 's3.json'), JSON.stringify({ identities: [{ name: 'lightnote-local', credentials: [{ accessKey: config.OBS_AK, secretKey: config.OBS_SK }], actions: ['Admin', 'Read', 'Write', 'List', 'Tagging'] }] }));
    const storage = run('storage', executable('weed'), ['mini', '-ip=127.0.0.1', '-ip.bind=127.0.0.1', `-dir=${stateDir}/objects`, `-s3.port=${ports.storage}`, `-s3.config=${stateDir}/s3.json`, '-bucket=lightnote-local', `-master.port=${storagePorts[0]}`, `-master.port.grpc=${storagePorts[1]}`, `-volume.port=${storagePorts[2]}`, `-volume.port.grpc=${storagePorts[3]}`, `-filer.port=${storagePorts[4]}`, `-filer.port.grpc=${storagePorts[5]}`, `-s3.port.grpc=${storagePorts[6]}`, '-admin.ui=false', '-admin.port.legacy=0', '-s3.port.iceberg=0', '-s3.port.lance=0', '-webdav.port=0'], env);
    await waitPort(ports.storage, storage);
    await waitPort(ports.smtp, run('mail', executable('mailpit'), ['--listen', `127.0.0.1:${ports.mail}`, '--smtp', `127.0.0.1:${ports.smtp}`, '--database', path.join(stateDir, 'mail.db'), '--disable-version-check', '--quiet'], env));
    await waitPort(ports.favicon, run('favicon', process.execPath, [path.join(serverDir, 'scripts/localTestFavicon.js')], env, { cwd: serverDir }));
    await oneShot('bootstrap', process.execPath, [path.join(serverDir, 'scripts/localTestBootstrap.js')], env);
    await oneShot('schema', process.execPath, [path.join(serverDir, 'scripts/checkSchemaAssertions.js')], env);
    if (migrateOnly) { await shutdown(); return; }
    const api = run('api', process.execPath, [path.join(serverDir, 'app.js')], env, { cwd: serverDir });
    await waitPort(ports.api, api);
    for (const name of ['document', 'bookmarkIcon', 'resourceGovernance', 'browserPush', 'noteImport', 'dataExport']) run(`${name}-worker`, process.execPath, [path.join(serverDir, `${name}Worker.js`)], env, { cwd: serverDir });
    const web = run('web', executable('pnpm'), ['--filter', 'web', 'exec', 'vite', '--host', '127.0.0.1', '--port', String(ports.web), '--strictPort'], env);
    await waitPort(ports.web, web);
    await sleep(1500);
    if (stopping) return;
    saveState('ready');
    console.log(`本机测试环境已就绪：http://localhost:${ports.web}；邮件：http://localhost:${ports.mail}。`);
  } catch (error) { await shutdown(1, error.message); }
}
async function status() {
  const state = readState();
  const running = isManager(state);
  console.log(`本机测试环境：${running ? state.status : 'stopped'}${state?.detail ? `（${state.detail}）` : ''}`);
  for (const [name, port] of Object.entries(ports)) console.log(`${name.padEnd(8)} 127.0.0.1:${port} ${await canConnect(port) ? 'listening' : 'stopped'}`);
  console.log(`网页：http://localhost:${ports.web}\n邮件：http://localhost:${ports.mail}\n账号：.local-test/accounts.json（仅本机）`);
}
async function main() {
  if (command === '_serve' || command === 'migrate') {
    if (command === 'migrate' && isManager(readState())) throw new Error('请先 pnpm local:stop，再执行 local:migrate 和 local:start。');
    await serve(command === 'migrate'); return;
  }
  if (command === 'status') { await status(); return; }
  if (command === 'stop') {
    const state = readState();
    if (!isManager(state)) { console.log('本机测试环境未运行。'); return; }
    process.kill(state.pid, 'SIGTERM');
    const until = Date.now() + 180000;
    while (alive(state.pid) && Date.now() < until) await sleep(200);
    if (alive(state.pid)) throw new Error('停止超时；请检查 .local-test/logs/launcher.log。');
    if (readState()?.status === 'failed') throw new Error('存在未正常停止的服务，请检查状态；没有删除本地数据。');
    console.log('本机测试服务已停止，数据库、文件和邮件保留。'); return;
  }
  if (command === 'check') {
    if (!isManager(readState()) || readState().status !== 'ready') throw new Error('请先 pnpm local:start。');
    const config = prepareConfig();
    const result = spawn(process.execPath, [path.join(serverDir, 'scripts/localTestCheck.js')], { cwd: serverDir, env: childEnv(config), stdio: 'inherit' });
    process.exitCode = await new Promise(resolve => { result.once('exit', code => resolve(code || 0)); result.once('error', () => resolve(1)); });
    return;
  }
  if (command !== 'start') throw new Error('使用 local:start / local:stop / local:status / local:check / local:migrate。');
  if (isManager(readState())) { await status(); return; }
  prepareConfig();
  const fd = openSync(path.join(stateDir, 'logs/launcher.log'), 'a', 0o600);
  const launcher = spawn(process.execPath, [script, '_serve'], { cwd: root, env: dockerEnv(), detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd); launcher.unref();
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    const state = readState();
    if (state?.pid === launcher.pid && state.status === 'ready') { await status(); return; }
    if (!alive(launcher.pid) || (state?.pid === launcher.pid && state.status === 'failed')) throw new Error(state?.detail || '启动失败，请检查 .local-test/logs/launcher.log。');
    await sleep(300);
  }
  throw new Error('启动仍在进行，请运行 pnpm local:status 或查看 .local-test/logs/launcher.log。');
}
main().catch(error => { console.error(`[本机测试] ${error.message}`); process.exitCode = 1; });
