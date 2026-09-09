import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import { saveEntitlementJourney, prepareEntitlementReturn } from '@/utils/entitlementJourney';
import zhCN from '@/i18n/locales/zh-CN';
const mocks = vi.hoisted(() => ({ preview: vi.fn(), user: { id: 'owner' } }));
const route = reactive({ fullPath: '/home' });
vi.mock('vue-router', () => ({ useRoute: () => route }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/api/search', () => ({ previewSearchBatchSelection: mocks.preview }));
vi.mock('@/components/aiSkills/AiSkillPanel.vue', () => ({
  default: {
    props: ['initialInput', 'autoRunActionId'],
    template: '<div class="restored-panel">{{ initialInput.question }}<span>{{ autoRunActionId }}</span></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { template: '<div><slot /></div>' },
}));
import EntitlementReturnHost from './EntitlementReturnHost.vue';
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  sessionStorage.clear();
  route.fullPath = '/home';
  mocks.user.id = 'owner';
  mocks.preview.mockReset();
  saveEntitlementJourney({
    userId: 'owner',
    source: 'bookmark',
    asset: 'ai',
    returnPath: '/home',
    task: {
      skillId: 'bookmark.analyze',
      surface: 'bookmark.dialog',
      input: { question: 'saved input' },
      resourceRefs: [{ type: 'bookmark', id: 'one' }],
    },
  });
  prepareEntitlementReturn('owner');
});
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = '';
});
async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp(EntitlementReturnHost);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
  return host;
}
describe('返回任务材料核验', () => {
  it('校验资源后恢复输入，但不给面板传自动执行动作', async () => {
    mocks.preview.mockResolvedValue({ status: 200, data: { unavailableItems: [] } });
    const host = await mount();
    expect(mocks.preview).toHaveBeenCalledWith({ mode: 'explicit', items: [{ type: 'bookmark', id: 'one' }] });
    expect(host.querySelector('.restored-panel')?.textContent).toBe('saved input');
  });
  it('资源已删除时停留原页面并禁止恢复执行面板', async () => {
    mocks.preview.mockResolvedValue({ status: 200, data: { unavailableItems: [{ id: 'one' }] } });
    const host = await mount();
    expect(host.querySelector('.restored-panel')).toBeNull();
    expect(host.textContent).toContain('原任务状态已变化');
  });
});
