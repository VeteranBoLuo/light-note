import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';

const apiBasePost = vi.fn();

vi.mock('@/http/request', () => ({ apiBasePost }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({
  default: { alert: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    name: 'BModalStub',
    props: ['visible'],
    template: '<div v-if="visible"><slot /><slot name="footer" /></div>',
  },
}));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }));

const { default: SecurityAccessControl } = await import('./SecurityAccessControl.vue');
const accessControlSource = readFileSync(
  resolve(process.cwd(), 'src/view/admin/components/securityCenter/SecurityAccessControl.vue'),
  'utf8',
);
const whitelistSource = readFileSync(
  resolve(process.cwd(), 'src/view/admin/components/securityCenter/Whitelist.vue'),
  'utf8',
);

let cleanup: (() => void) | undefined;

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mountAccessControl() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(SecurityAccessControl) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: {} }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('安全中心访问控制', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiBasePost.mockImplementation((url: string) => {
      if (url === '/api/security/v2/source-denies/list') {
        return Promise.resolve({
          status: 200,
          data: { items: [{ ip: '35.233.10.128', bannedUntil: '2026-08-08 13:47:00', banReason: '人工复核' }] },
        });
      }
      return Promise.resolve({ status: 200, data: { items: [] } });
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('自定义弹框 footer 在 PC 和移动端保留统一安全间距', () => {
    for (const source of [accessControlSource, whitelistSource]) {
      expect(source).toMatch(/modal-footer\s*\{[\s\S]*?padding:\s*0 20px 16px;/);
      expect(source).toMatch(
        /@media \(max-width:\s*767px\)[\s\S]*?modal-footer\s*\{[\s\S]*?padding:\s*0 16px 12px;/,
      );
    }
  });

  it('移除无效分段 Tab，保留各区域入口并展示完整来源 IP', async () => {
    const host = mountAccessControl();
    await flushPromises();

    expect(host.querySelector('.access-segment')).toBeNull();
    expect(host.textContent).toContain('＋ 新增账号限制');
    expect(host.textContent).toContain('＋ 添加');
    expect(host.textContent).toContain('临时限制来源');
    expect(host.textContent).toContain('35.233.10.128');
    expect(host.textContent).not.toContain('35.233.***.128');
  });
});
