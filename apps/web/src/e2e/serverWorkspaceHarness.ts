// Synthetic acceptance data. Every request is intercepted; unhandled endpoints fail closed.
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import ServerManagementShell from '@/view/serverManagement/ServerManagementShell.vue';
import ServerManagement from '@/view/serverManagement/ServerManagement.vue';
import ServerDiagnostics from '@/view/serverManagement/ServerDiagnostics.vue';
import ServerServices from '@/view/serverManagement/ServerServices.vue';
import ServerSecurity from '@/view/serverManagement/ServerSecurity.vue';
import ServerStorage from '@/view/serverManagement/ServerStorage.vue';
import ServerEvents from '@/view/serverManagement/ServerEvents.vue';
import { bookmarkStore, useUserStore } from '@/store';
import { isMobileViewport, usesMobileDeviceLayout } from '@/config/responsive';
import { applyUiDensity } from '@/composables/useUiDensity';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search);
const state = params.get('state') || 'populated';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const pinia = createPinia();
useUserStore(pinia).setUserInfo({
  id: 'infra-fixture',
  role: 'root',
  alias: 'Fixture',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = innerWidth;
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle(
  'light-note-mobile-rendering',
  usesMobileDeviceLayout(innerWidth) || params.get('renderProfile') === 'mobile',
);
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  usesMobileDeviceLayout(innerWidth),
);
const now = Date.now();
const capturedAt = new Date(now).toISOString();
const gb = 1024 ** 3;
const pm2ServiceCount = 7;
const services = [
  'lightnote-api',
  'lightnote-document-worker',
  'lightnote-bookmark-icon-worker',
  'lightnote-resource-governance-worker',
  'lightnote-browser-push-worker',
  'lightnote-note-import-worker',
  'lightnote-data-export-worker',
  'nginx',
  'mysql',
  'redis',
].map((id, i) => ({
  id,
  state: id === 'mysql' ? 'degraded' : 'running',
  detail: 'Synthetic sample',
  pid: i + 100,
  uptimeSeconds: 86400 * 3 + 600,
  cpuPercent: i < pm2ServiceCount ? 0.2 + i * 0.1 : null,
  memoryBytes: [162, 129, 49, 92, 61, 74, 70, 75, 932, 7][i] * 1024 ** 2,
  restartCount: i < pm2ServiceCount ? i * 16 : 0,
  startedAt: capturedAt,
  actions: i > 0 && i < 4 ? ['service.restart'] : id === 'nginx' ? ['nginx.reload'] : [],
}));
const history = Array.from({ length: 360 }, (_, i) => ({
  sampledAt: new Date(now - (359 - i) * 10_000).toISOString(),
  cpuPercent: Math.round(30 + Math.sin(i * 2) * 20 + (i % 33 === 0 ? 400 : 0)) / 10,
  memoryPercent: 69 + Math.sin(i * 0.6) * 0.2,
  diskPercent: 52.4,
  load1: 0.28,
  networkRxBytesPerSecond: 10500,
  networkTxBytesPerSecond: 34800,
  diskReadBytesPerSecond: i % 71 === 0 ? 2e6 : 12000,
  diskWriteBytesPerSecond: i % 60 === 0 ? 6e6 : 131000,
  diskReadsPerSecond: 1,
  diskWritesPerSecond: 20,
  diskIoBusyPercent: 4,
}));
if (state === 'gaps') history.splice(70, 20);
const mount = {
  mountPoint: '/',
  totalBytes: 48.9 * gb,
  usedBytes: 25.6 * gb,
  freeBytes: 23.3 * gb,
  percent: 52.4,
  totalInodes: 3276800,
  usedInodes: 318479,
  freeInodes: 2958321,
  inodePercent: 9.7,
};
const io = {
  readBytesPerSecond: 12000,
  writeBytesPerSecond: 131000,
  readsPerSecond: 1,
  writesPerSecond: 20,
  busyPercent: 4,
};
const dashboard = {
  protocolVersion: 1,
  agentVersion: '1.1.1',
  startedAt: new Date(now - 3 * 86400e3).toISOString(),
  sampledAt: capturedAt,
  host: {
    hostname: state === 'long' ? 'light-note-production-server-with-a-long-hostname' : 'light-note-prod',
    platform: 'linux',
    arch: 'x64',
    release: '5.15.0-76-generic',
    cpuModel: 'General Purpose Processor',
    cpuCores: 2,
  },
  metrics: {
    sampledAt: capturedAt,
    cpu: { percent: 5.1, cores: 2, loadAverage: [0.28, 0.25, 0.21] },
    memory: { totalBytes: 3.6 * gb, usedBytes: 2.5 * gb, freeBytes: 1.1 * gb, percent: 69.2 },
    disk: mount,
    diskIo: io,
    network: { rxBytes: 0, txBytes: 0, rxBytesPerSecond: 10500, txBytesPerSecond: 34800 },
    uptimeSeconds: 100 * 86400 + 5 * 3600,
    collectionErrors: [],
  },
  history: state === 'empty' ? [] : history,
  services,
  capabilities: { workerRestart: true, nginxReload: true, securitySnapshot: true },
  collectionErrors: [],
};
const findings = [
  { id: 'ssh-root-login', state: 'fail', severity: 'high', evidence: { value: 'yes' } },
  { id: 'ssh-password-authentication', state: 'fail', severity: 'high', evidence: { value: true } },
  { id: 'ssh-public-key-authentication', state: 'pass', severity: 'low', evidence: { value: true } },
  { id: 'firewall', state: 'pass', severity: 'high', evidence: { provider: 'ufw', value: 'enabled' } },
  { id: 'fail2ban', state: 'fail', severity: 'medium', evidence: { value: 'not-installed' } },
  { id: 'security-updates', state: 'fail', severity: 'high', evidence: { pending: 420, security: 308 } },
  {
    id: 'unexpected-public-ports',
    state: 'fail',
    severity: 'high',
    evidence: { ports: ['tcp6/3306', 'tcp/8888'], firewallFilteredPorts: ['tcp6/9001'] },
  },
  { id: 'ssh-login-failures', state: 'fail', severity: 'medium', evidence: { failures24h: 12, successes24h: 3 } },
];
const security = {
  protocolVersion: 1,
  capturedAt,
  ssh: {
    available: true,
    port: 22,
    permitRootLogin: 'yes',
    passwordAuthentication: true,
    publicKeyAuthentication: true,
    successes24h: 3,
    failures24h: 12,
    recent: Array.from({ length: 6 }, (_, i) => ({
      occurredAt: new Date(now - i * 60000).toISOString(),
      outcome: i % 2 ? 'succeeded' : 'failed',
      sourceAddress: '192.0.2.' + (i + 1),
      user: 'fixture',
      method: 'publickey',
    })),
  },
  firewall: { available: true, provider: 'ufw', state: 'enabled' },
  fail2ban: { available: true, state: 'disabled', installed: false },
  updates: { available: true, pending: 420, security: 308 },
  listeningPorts: [
    { protocol: 'tcp', address: '0.0.0.0', port: 443, exposure: 'public', firewall: 'allowed' },
    { protocol: 'tcp', address: '0.0.0.0', port: 22, exposure: 'public', firewall: 'allowed' },
    { protocol: 'tcp', address: '0.0.0.0', port: 8888, exposure: 'public', firewall: 'allowed' },
    { protocol: 'tcp6', address: '::', port: 3306, exposure: 'public', firewall: 'allowed' },
    { protocol: 'tcp6', address: '::', port: 9001, exposure: 'public', firewall: 'blocked' },
    { protocol: 'tcp', address: '127.0.0.53', port: 53, exposure: 'loopback', firewall: 'blocked' },
  ],
  collectionErrors: [],
  findings,
  summary: { failed: 6, unknown: 0, passed: 2 },
};
const diagnostics = {
  capturedAt,
  status: 'critical',
  summary: { failed: 7, warning: 0, unknown: 0, passed: 2 },
  checks: [
    {
      id: 'services.health',
      domain: 'services',
      state: 'fail',
      severity: 'high',
      evidence: { total: services.length, unhealthy: ['mysql'] },
      target: { module: 'services', serviceId: 'mysql' },
    },
    ...findings.map((f) => ({
      ...f,
      id: `security.${f.id}`,
      domain: 'security',
      target: { module: 'security', findingId: f.id },
    })),
  ],
  sources: ['overview', 'services', 'storage', 'security'].map((domain) => ({
    domain,
    state: 'available',
    capturedAt,
    collectionErrorCount: 0,
  })),
};
if (state === 'healthy') {
  services.forEach((service) => (service.state = 'running'));
  findings.forEach((finding) => (finding.state = 'pass'));
  Object.assign(findings.find((finding) => finding.id === 'fail2ban')!.evidence, { value: 'enabled' });
  Object.assign(findings.find((finding) => finding.id === 'unexpected-public-ports')!.evidence, { ports: [] });
  Object.assign(security.summary, { failed: 0, unknown: 0, passed: findings.length });
  diagnostics.status = 'healthy';
  diagnostics.checks.forEach((check) => (check.state = 'pass'));
  Object.assign(diagnostics.summary, { failed: 0, warning: 0, unknown: 0, passed: diagnostics.checks.length });
}
if (state === 'unknown') {
  services.forEach((service) => Object.assign(service, { state: 'unknown', cpuPercent: null, memoryBytes: null }));
  history.forEach((point) =>
    Object.assign(point, {
      cpuPercent: null,
      memoryPercent: null,
      diskPercent: null,
      diskReadBytesPerSecond: null,
      diskWriteBytesPerSecond: null,
    }),
  );
  findings.forEach((finding) => (finding.state = 'unknown'));
  Object.assign(security.summary, { failed: 0, unknown: findings.length, passed: 0 });
  Object.assign(security.ssh, { available: false, recent: [], successes24h: null, failures24h: null });
  Object.assign(io, { readBytesPerSecond: null, writeBytesPerSecond: null, busyPercent: null });
  diagnostics.status = 'attention';
  diagnostics.checks.forEach((check) => (check.state = 'unknown'));
  Object.assign(diagnostics.summary, { failed: 0, warning: 0, unknown: diagnostics.checks.length, passed: 0 });
}
const audits = Array.from({ length: 83 }, (_, i) => ({
  id: `audit-${i}`,
  action: i % 4 ? 'infra.service_restart' : 'infra.nginx_reload',
  targetType: 'service',
  targetId: i % 4 ? 'lightnote-document-worker' : 'nginx',
  outcome: ['succeeded', 'failed', 'denied', 'intent'][i % 4],
  reason:
    state === 'long'
      ? 'This is a long operational reason for checking page wrapping and readable audit details. '.repeat(3)
      : '例行维护，处理任务积压',
  createTime: new Date(now - i * 36e5).toISOString(),
  requestId: `fixture-request-${i}`,
  actorAlias: 'Fixture',
  ipMasked: '192.0.2.*',
  metadata: { jobId: `job-${i}` },
}));
const response = (config: any, data: unknown, status = 200) => ({
  data: { status, data, msg: status === 200 ? '' : 'Synthetic unavailable' },
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});
let requests = 0;
request.defaults.adapter = async (config) => {
  requests++;
  const url = config.url || '';
  const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : config.data || {};
  await new Promise((resolve) => setTimeout(resolve, state === 'loading' ? 60000 : state === 'slow' ? 1000 : 40));
  if (state === 'error' || (state === 'stale' && requests > 6)) return response(config, null, 503);
  if (url === '/api/infra/dashboard')
    return response(
      config,
      state === 'offline'
        ? { agentStatus: 'offline', code: 'AGENT_UNAVAILABLE', dashboard: null }
        : { agentStatus: 'online', code: '', dashboard },
    );
  if (url === '/api/infra/services')
    return response(config, {
      protocolVersion: 1,
      capturedAt,
      services: state === 'empty' ? [] : services,
      capabilities: dashboard.capabilities,
      collectionErrors: [],
    });
  if (url === '/api/infra/security') return response(config, security);
  if (url === '/api/infra/diagnostics') return response(config, diagnostics);
  if (url === '/api/infra/storage')
    return response(config, {
      protocolVersion: 1,
      capturedAt,
      mounts: state === 'empty' ? [] : [mount],
      io,
      history: state === 'empty' ? [] : history,
      collectionErrors: [],
    });
  if (url.startsWith('/api/infra/logs/'))
    return response(config, {
      serviceId: url.split('/').pop(),
      lines: [
        '2026-10-29 INFO Worker started',
        '2026-10-29 WARN Retry pending task',
        '2026-10-29 ERROR Synthetic task failed',
      ],
      truncated: false,
      exitCode: 0,
      capturedAt,
    });
  if (url.endsWith('getAdminOperationAudits')) {
    const items =
      state === 'empty'
        ? []
        : audits.filter(
            (item) =>
              (body.outcome === 'all' || body.outcome === item.outcome) &&
              (!body.keyword || JSON.stringify(item).includes(body.keyword)) &&
              (!body.startDate || item.createTime >= `${body.startDate}T00:00:00+08:00`) &&
              (!body.endDate || Date.parse(item.createTime) <= Date.parse(`${body.endDate}T23:59:59+08:00`)),
          );
    return response(config, {
      items: items.slice((body.currentPage - 1) * body.pageSize, body.currentPage * body.pageSize),
      total: items.length,
      filteredSummary: {
        total: items.length,
        succeeded: items.filter((i) => i.outcome === 'succeeded').length,
        failed: items.filter((i) => i.outcome === 'failed').length,
        denied: items.filter((i) => i.outcome === 'denied').length,
        intents: items.filter((i) => i.outcome === 'intent').length,
      },
    });
  }
  throw new Error(`UNEXPECTED_INFRA_FIXTURE_REQUEST: ${url}`);
};
const modules = {
  overview: ServerManagement,
  diagnostics: ServerDiagnostics,
  services: ServerServices,
  security: ServerSecurity,
  storage: ServerStorage,
  events: ServerEvents,
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/serverManagement',
      component: ServerManagementShell,
      children: Object.entries(modules).map(([key, component]) => ({
        path: key,
        name: `serverManagement-${key}`,
        meta: { infraModule: key },
        component,
      })),
    },
    { path: '/personCenter', component: { render: () => h('div', 'Fixture back target') } },
  ],
});
const mobile = isMobileViewport(innerWidth);
const app = createApp({
  render: () =>
    h('div', { style: 'height:100%;background:var(--background-color)' }, [
      !mobile
        ? h(
            'header',
            {
              style:
                'height:var(--ui-layout-64,64px);display:flex;align-items:center;justify-content:space-between;padding:0 var(--ui-space-24,24px);border-bottom:1px solid var(--surface-divider-color);color:var(--text-color)',
            },
            [
              h('strong', { style: 'color:var(--primary-color);font-size:var(--ui-font-20,20px)' }, '轻笺'),
              h('span', '工作台　　书签　　笔记　　云空间　　待办　　标签　　资源中心　　社区　　管理'),
              h('small', { style: 'color:var(--desc-color)' }, '隔离预览 · 示例数据'),
            ],
          )
        : null,
      h('main', { style: mobile ? 'height:100%' : 'height:calc(100% - var(--ui-layout-64,64px))' }, [h(RouterView)]),
    ]),
});
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale, fallbackLocale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
await router.push(
  `/serverManagement/${Object.keys(modules).includes(params.get('page') || '') ? params.get('page') : 'overview'}`,
);
await router.isReady();
app.mount('#app');

if (import.meta.hot) import.meta.hot.on('vite:afterUpdate', () => location.reload());
