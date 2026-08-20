#!/usr/bin/node
import { spawnSync } from 'node:child_process';
import { accessSync, constants, readFileSync, realpathSync } from 'node:fs';

const PM2_BIN = '/usr/bin/pm2';
const NSENTER_BIN = '/usr/bin/nsenter';
const SYSTEMCTL_BIN = '/usr/bin/systemctl';
const JOURNALCTL_BIN = '/usr/bin/journalctl';
const NGINX_BIN = '/usr/sbin/nginx';
const PANEL_NGINX_BIN = '/www/server/nginx/sbin/nginx';
const PANEL_NGINX_CONFIG = '/www/server/nginx/conf/nginx.conf';
const PANEL_NGINX_PID = '/www/server/nginx/logs/nginx.pid';
const PANEL_REDIS_BIN = '/www/server/redis/src/redis-server';
const PANEL_REDIS_PID = '/www/server/redis/redis.pid';
const PM2_HOME = '/root/.pm2';
const MAX_SOCKET_REQUEST_BYTES = 1024;
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
const SENSITIVE_QUERY =
  /([?&](?:token|key|secret|signature|auth|session)=)[^&#\s]+/giu;
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

function readable(file) {
  try {
    accessSync(file, constants.R_OK);
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
  // helper 是 systemd 按请求启动的 root 进程；固定进入宿主挂载命名空间访问 root PM2，
  // 非 root Agent 只持有 helper Socket 的连接权限，始终看不到 /root/.pm2。
  return run(NSENTER_BIN, ['--mount=/proc/1/ns/mnt', '--', PM2_BIN, ...args], {
    ...options,
    env: pm2Environment,
  });
}

function commandFailure(result, message) {
  if (result.status === 0) return null;
  return {
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    stdout: '',
    stderr: `${message}\n`,
  };
}

function success(stdout = '') {
  return { exitCode: 0, stdout, stderr: '' };
}

function denied() {
  return { exitCode: 64, stdout: '', stderr: 'action denied\n' };
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

function serviceIsActive(unit) {
  return run(SYSTEMCTL_BIN, ['is-active', '--quiet', unit]).status === 0;
}

function verifiedProcessPid(pidFile, executablePath) {
  try {
    const source = readFileSync(pidFile, 'utf8').trim();
    if (!/^[1-9]\d{0,9}$/u.test(source)) return null;
    const pid = Number(source);
    return realpathSync(`/proc/${pid}/exe`) === executablePath ? pid : null;
  } catch {
    return null;
  }
}

function panelServiceStatus(serviceId) {
  const definition =
    serviceId === 'nginx'
      ? { binary: PANEL_NGINX_BIN, pidFile: PANEL_NGINX_PID }
      : serviceId === 'redis'
        ? { binary: PANEL_REDIS_BIN, pidFile: PANEL_REDIS_PID }
        : null;
  if (!definition) return null;
  const pid = executable(definition.binary)
    ? verifiedProcessPid(definition.pidFile, definition.binary)
    : null;
  return {
    state: pid ? 'running' : 'stopped',
    detail: pid ? 'active / panel-managed' : 'inactive / panel-managed',
    pid,
    uptimeSeconds: null,
  };
}

function systemdServiceStatus(serviceId) {
  const unit = SYSTEMD_SERVICES[serviceId];
  if (!unit) return null;
  const result = run(SYSTEMCTL_BIN, [
    'show',
    unit,
    '--property=ActiveState,SubState,MainPID',
    '--no-pager',
  ]);
  if (result.status !== 0) return null;
  const fields = Object.fromEntries(
    String(result.stdout || '')
      .split('\n')
      .map((line) => line.split('='))
      .filter(([key]) => key)
      .map(([key, ...rest]) => [key, rest.join('=')]),
  );
  const state =
    fields.ActiveState === 'active'
      ? 'running'
      : fields.ActiveState === 'failed'
        ? 'degraded'
        : fields.ActiveState === 'inactive'
          ? 'stopped'
          : 'unknown';
  const pid = Number(fields.MainPID || 0);
  return {
    state,
    detail:
      [fields.ActiveState, fields.SubState].filter(Boolean).join(' / ') ||
      'unknown',
    pid: pid > 0 ? pid : null,
    uptimeSeconds: null,
  };
}

function managedServiceStatus(serviceId) {
  const panelStatus = panelServiceStatus(serviceId);
  return panelStatus?.state === 'running'
    ? panelStatus
    : systemdServiceStatus(serviceId) || panelStatus;
}

function nginxTopology() {
  const panelStatus = panelServiceStatus('nginx');
  if (panelStatus?.state === 'running' && readable(PANEL_NGINX_CONFIG)) {
    return 'panel';
  }
  return serviceIsActive('nginx.service') ? 'systemd' : null;
}

function executeAction(action, targetId) {
  if (action === 'capabilities' && targetId === undefined) {
    const topology = nginxTopology();
    return success(
      JSON.stringify({
        nginxReload:
          (topology === 'panel' && executable(PANEL_NGINX_BIN)) ||
          (topology === 'systemd' &&
            executable(SYSTEMCTL_BIN) &&
            executable(NGINX_BIN)),
        pm2Status: executable(PM2_BIN) && executable(NSENTER_BIN),
        workerRestart: executable(PM2_BIN) && executable(NSENTER_BIN),
        serviceLogs:
          executable(PM2_BIN) &&
          executable(NSENTER_BIN) &&
          executable(JOURNALCTL_BIN),
      }),
    );
  }

  if (
    action === 'service-status' &&
    (targetId === 'nginx' || targetId === 'redis')
  ) {
    return success(JSON.stringify(managedServiceStatus(targetId)));
  }

  if (action === 'nginx-reload' && targetId === undefined) {
    const topology = nginxTopology();
    if (!topology) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'nginx service is not active\n',
      };
    }
    const binary = topology === 'panel' ? PANEL_NGINX_BIN : NGINX_BIN;
    const test = run(
      binary,
      topology === 'panel' ? ['-t', '-c', PANEL_NGINX_CONFIG] : ['-t'],
    );
    const testFailure = commandFailure(test, 'nginx configuration test failed');
    if (testFailure) return testFailure;
    const reload =
      topology === 'panel'
        ? run(binary, ['-s', 'reload', '-c', PANEL_NGINX_CONFIG])
        : run(SYSTEMCTL_BIN, ['reload', 'nginx.service']);
    return (
      commandFailure(reload, 'nginx reload failed') ||
      success('nginx configuration checked and reloaded\n')
    );
  }

  if (action === 'pm2-status' && targetId === undefined) {
    const result = runPm2(['jlist']);
    const failure = commandFailure(result, 'pm2 status failed');
    if (failure) return failure;
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
      return success(JSON.stringify(safeItems));
    } catch {
      return { exitCode: 1, stdout: '', stderr: 'pm2 status invalid\n' };
    }
  }

  if (action === 'pm2-restart' && RESTARTABLE_SERVICES.has(targetId)) {
    const result = runPm2(['restart', PM2_SERVICES[targetId]], {
      timeout: 20_000,
    });
    return (
      commandFailure(result, 'pm2 restart failed') ||
      success('allowlisted worker restarted\n')
    );
  }

  if (action === 'pm2-logs' && Object.hasOwn(PM2_SERVICES, targetId)) {
    const result = runPm2([
      'logs',
      PM2_SERVICES[targetId],
      '--lines',
      '300',
      '--nostream',
      '--raw',
    ]);
    const failure = commandFailure(result, 'pm2 logs failed');
    if (failure) return failure;
    return success(
      redact([result.stdout, result.stderr].filter(Boolean).join('\n')),
    );
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
    const failure = commandFailure(result, 'service logs failed');
    if (failure) return failure;
    return success(
      redact([result.stdout, result.stderr].filter(Boolean).join('\n')),
    );
  }

  return denied();
}

function validSocketRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const keys = Object.keys(payload);
  if (keys.some((key) => key !== 'action' && key !== 'targetId')) return false;
  if (typeof payload.action !== 'string' || payload.action.length > 64) {
    return false;
  }
  return (
    payload.targetId === undefined ||
    (typeof payload.targetId === 'string' && payload.targetId.length <= 64)
  );
}

async function readSocketRequest() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_SOCKET_REQUEST_BYTES) return null;
    chunks.push(chunk);
  }
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8').trim());
    return validSocketRequest(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function main() {
  const [action, targetId, extra] = process.argv.slice(2);
  if (action === 'socket' && targetId === undefined) {
    const request = await readSocketRequest();
    process.stdout.write(
      JSON.stringify(
        request ? executeAction(request.action, request.targetId) : denied(),
      ),
    );
    return;
  }

  const result =
    !action || extra !== undefined
      ? denied()
      : executeAction(action, targetId);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

await main();
