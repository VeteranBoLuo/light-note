#!/usr/bin/node
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';

const PM2_BIN = '/usr/bin/pm2';
const NSENTER_BIN = '/usr/bin/nsenter';
const SYSTEMCTL_BIN = '/usr/bin/systemctl';
const JOURNALCTL_BIN = '/usr/bin/journalctl';
const NGINX_BIN = '/usr/sbin/nginx';
const PM2_HOME = '/root/.pm2';
const PM2_SERVICES = Object.freeze({
  'lightnote-api': 'app',
  'lightnote-document-worker': 'light-note-document-worker',
  'lightnote-bookmark-icon-worker': 'light-note-bookmark-icon-worker',
  'lightnote-resource-governance-worker': 'light-note-resource-governance-worker',
});
const RESTARTABLE_SERVICES = new Set([
  'lightnote-document-worker',
  'lightnote-bookmark-icon-worker',
  'lightnote-resource-governance-worker',
]);
const SYSTEMD_SERVICES = Object.freeze({
  nginx: 'nginx.service',
  mysql: 'mysql.service',
  redis: 'redis-server.service',
});

const environment = {
  PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
};
const pm2Environment = { ...environment, PM2_HOME };
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
const SECRET_ASSIGNMENT =
  /\b([a-z0-9_-]*(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|session)[a-z0-9_-]*)\s*[:=]\s*([^\s,;]+)/giu;
const BEARER_TOKEN = /\bBearer\s+[a-z0-9._~+\/-]+=*/giu;
const SENSITIVE_QUERY = /([?&](?:token|key|secret|signature|auth|session)=)[^&#\s]+/giu;
const URI_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+@/giu;
const JWT_TOKEN = /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/giu;
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu;

function executable(file) {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function run(file, args, options = {}) {
  return spawnSync(file, args, {
    shell: false,
    encoding: 'utf8',
    timeout: options.timeout || 15_000,
    maxBuffer: options.maxBuffer || 4 * 1024 * 1024,
    env: options.env || environment,
  });
}

function runPm2(args, options = {}) {
  // Host Agent unit 使用 ProtectHome=tmpfs；只有 root-owned helper 以固定命令进入宿主挂载命名空间，
  // Agent 账户本身始终看不到 /root/.pm2。
  return run(NSENTER_BIN, ['--mount=/proc/1/ns/mnt', '--', PM2_BIN, ...args], {
    ...options,
    env: pm2Environment,
  });
}

function failed(result, message) {
  if (result.status === 0) return false;
  process.stderr.write(`${message}\n`);
  process.exit(Number.isInteger(result.status) ? result.status : 1);
}

function redact(value) {
  return String(value || '')
    .replace(CONTROL_CHARACTERS, '')
    .replace(SECRET_ASSIGNMENT, '$1=[REDACTED]')
    .replace(BEARER_TOKEN, 'Bearer [REDACTED]')
    .replace(SENSITIVE_QUERY, '$1[REDACTED]')
    .replace(URI_CREDENTIALS, '$1[REDACTED]@')
    .replace(JWT_TOKEN, '[REDACTED_JWT]')
    .replace(PRIVATE_KEY_BLOCK, '[REDACTED_PRIVATE_KEY]')
    .slice(-128 * 1024);
}

const [action, targetId, extra] = process.argv.slice(2);
if (!action || extra !== undefined) {
  process.stderr.write('action denied\n');
  process.exit(64);
}

if (action === 'capabilities' && targetId === undefined) {
  process.stdout.write(
    JSON.stringify({
      nginxReload: executable(NGINX_BIN) && executable(SYSTEMCTL_BIN),
      pm2Status: executable(PM2_BIN) && executable(NSENTER_BIN),
      workerRestart: executable(PM2_BIN) && executable(NSENTER_BIN),
      serviceLogs: executable(PM2_BIN) && executable(NSENTER_BIN) && executable(JOURNALCTL_BIN),
    }),
  );
  process.exit(0);
}

if (action === 'nginx-reload' && targetId === undefined) {
  const test = run(NGINX_BIN, ['-t']);
  failed(test, 'nginx configuration test failed');
  const reload = run(SYSTEMCTL_BIN, ['reload', 'nginx.service']);
  failed(reload, 'nginx reload failed');
  process.stdout.write('nginx configuration checked and reloaded\n');
  process.exit(0);
}

if (action === 'pm2-status' && targetId === undefined) {
  const result = runPm2(['jlist']);
  failed(result, 'pm2 status failed');
  try {
    const items = JSON.parse(result.stdout || '[]');
    const allowedNames = new Set(Object.values(PM2_SERVICES));
    const safeItems = (Array.isArray(items) ? items : [])
      .filter((item) => allowedNames.has(String(item?.name || '')))
      .map((item) => ({
        name: String(item.name),
        pid: Number(item.pid || 0) || null,
        pm2_env: {
          status: String(item?.pm2_env?.status || 'unknown'),
          pm_uptime: Number(item?.pm2_env?.pm_uptime || 0) || null,
        },
      }));
    process.stdout.write(JSON.stringify(safeItems));
    process.exit(0);
  } catch {
    process.stderr.write('pm2 status invalid\n');
    process.exit(1);
  }
}

if (action === 'pm2-restart' && RESTARTABLE_SERVICES.has(targetId)) {
  const result = runPm2(['restart', PM2_SERVICES[targetId]], {
    timeout: 20_000,
  });
  failed(result, 'pm2 restart failed');
  process.stdout.write('allowlisted worker restarted\n');
  process.exit(0);
}

if (action === 'pm2-logs' && Object.hasOwn(PM2_SERVICES, targetId)) {
  const result = runPm2(['logs', PM2_SERVICES[targetId], '--lines', '300', '--nostream', '--raw']);
  failed(result, 'pm2 logs failed');
  process.stdout.write(redact([result.stdout, result.stderr].filter(Boolean).join('\n')));
  process.exit(0);
}

if (action === 'journal-logs' && Object.hasOwn(SYSTEMD_SERVICES, targetId)) {
  const result = run(JOURNALCTL_BIN, [
    '--unit',
    SYSTEMD_SERVICES[targetId],
    '--lines',
    '300',
    '--no-pager',
    '--output=short-iso',
  ]);
  failed(result, 'service logs failed');
  process.stdout.write(redact([result.stdout, result.stderr].filter(Boolean).join('\n')));
  process.exit(0);
}

process.stderr.write('action denied\n');
process.exit(64);
