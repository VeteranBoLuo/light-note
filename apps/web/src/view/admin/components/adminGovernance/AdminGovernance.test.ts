import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const apiMocks = vi.hoisted(() => ({ load: vi.fn() }));
const messageMocks = vi.hoisted(() => ({ error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('@/api/commonApi', () => ({ getAdminGovernance: apiMocks.load }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: messageMocks }));
vi.mock('@/router', () => ({ default: routerMocks }));
vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: false }) }));
vi.mock('@/components/admin/AdminDataPage.vue', () => ({
  default: {
    name: 'AdminDataPageStub',
    template:
      '<main><div class="actions"><slot name="actions" /></div><div class="metrics"><slot name="metrics" /></div><slot /></main>',
  },
}));

const { default: AdminGovernance } = await import('./AdminGovernance.vue');

function payload() {
  return {
    status: 200,
    data: {
      generatedAt: '2026-08-09 12:00:00',
      roles: [
        {
          role: 'user',
          authenticated: true,
          ownContent: 'full',
          adminConsole: false,
          userPreview: false,
          contentMaintenance: false,
          highRiskOperations: false,
          analyticsIncluded: true,
        },
        {
          role: 'root',
          authenticated: true,
          ownContent: 'full',
          adminConsole: true,
          userPreview: true,
          contentMaintenance: true,
          highRiskOperations: true,
          analyticsIncluded: false,
        },
      ],
      routePolicies: { total: 120, counts: { read: 55, content_write: 30, admin_only: 20 }, resources: {} },
      runtime: {
        adminContext: {
          previewEnabled: true,
          maintenanceEnabled: true,
          readonlyTtlMinutes: 20,
          maintenanceTtlMinutes: 10,
        },
        security: {
          requestBlockingEnabled: true,
          reputationDecisionEnabled: false,
          ipAutoBanEnabled: false,
          blockThreshold: 50,
          logThreshold: 20,
          eventRetentionDays: 90,
        },
        community: {
          accessMode: 'invite_only',
          messagingEnabled: true,
          realtimeEnabled: true,
          emergencyReadOnly: false,
          rulesVersion: 'rules-v1',
        },
        jobs: { bookmarkIconBackgroundEnabled: true },
        retention: {
          operationalLogs: { retentionDays: 180, digestRetentionDays: 7 },
          aiProductEvents: { retentionDays: 180, state: 'default' },
          aiArtifacts: {
            domains: { changeSet: { days: null, state: 'disabled', enabled: false } },
            invalidDomains: [],
          },
        },
      },
      warnings: [{ code: 'maintenance_enabled', severity: 'warning' }],
      safety: { readOnlySnapshot: true, secretsExposed: false, arbitraryConfigWriteEnabled: false },
    },
  };
}

function mountPage() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(AdminGovernance) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  return {
    host,
    unmount() {
      app.unmount();
      host.remove();
    },
  };
}

describe('AdminGovernance', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.load.mockResolvedValue(payload());
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.innerHTML = '';
  });

  it('把真实策略来源、风险提醒与角色矩阵放在同一只读页面', async () => {
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('运行时策略'));

    expect(apiMocks.load).toHaveBeenCalledOnce();
    expect(mounted.host.textContent).toContain('管理员内容代管已开启');
    expect(mounted.host.textContent).toContain('ENV + CODE');
    expect(mounted.host.textContent).toContain('角色能力矩阵');
    expect(mounted.host.textContent).toContain('未声明接口默认拒绝');
    expect(mounted.host.textContent).not.toContain('private-value');
  });
});
