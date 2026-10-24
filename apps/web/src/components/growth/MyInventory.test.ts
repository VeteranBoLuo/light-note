import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import zh from '@/i18n/locales/zh-CN';
import type { InventoryTab } from '@/utils/inventoryNavigation';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => null } }));

const mocks = vi.hoisted(() => ({ state: {} as any, detailsMounts: 0, recordOpens: 0 }));
vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: false, isMobileDevice: false }) }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BModal/Alert.ts', () => ({ default: { alert: vi.fn() } }));
vi.mock('@/composables/useGrowth.ts', () => ({ useGrowth: () => mocks.state }));
vi.mock('./InventoryPointsDetails.vue', async () => {
  const { ref, h, onMounted } = await import('vue');
  return {
    default: {
      setup() {
        const filter = ref('all');
        onMounted(() => mocks.detailsMounts++);
        return () =>
          h('div', { class: 'points-test' }, [
            h('input', {
              value: filter.value,
              onInput: (event: Event) => {
                filter.value = (event.target as HTMLInputElement).value;
              },
            }),
          ]);
      },
    },
  };
});
vi.mock('./LotteryRecords.vue', () => ({
  default: {
    setup(_: unknown, { expose }: any) {
      expose({ open: () => mocks.recordOpens++ });
      return () => h('div', { class: 'records-test' }, '获得记录');
    },
  },
}));
import MyInventory from './MyInventory.vue';

let cleanup: (() => void) | undefined;
const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await nextTick();
};
beforeEach(() => {
  mocks.detailsMounts = 0;
  mocks.recordOpens = 0;
  mocks.state = {
    inventory: ref({
      assets: { points: 3280, aiBonusTokens: 1200000, storageBonusMb: 4096 },
      items: [
        { id: 'makeup_card', qty: 2, name: '补签卡', action: 'makeup' },
        { id: 'ai_pack', qty: 0, name: 'AI 加油包', action: 'use' },
      ],
    }),
    inventoryLoading: ref(false),
    inventoryError: ref(false),
    growth: ref({ makeupDays: ['20261022'] }),
    loadInventory: vi.fn(),
    loadDashboard: vi.fn(),
    useItem: vi.fn(),
    useProtectCard: vi.fn(),
  };
});
afterEach(() => cleanup?.());
async function mount(initial: InventoryTab = 'overview', readOnly = false) {
  const tab = ref(initial);
  const host = document.createElement('div');
  document.body.append(host);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/growth', component: { render: () => null } },
      { path: '/ai-usage', name: 'aiUsage', component: { render: () => null } },
      { path: '/store', component: { render: () => null } },
    ],
  });
  await router.push('/growth');
  const app = createApp({
    render: () =>
      h(MyInventory, {
        activeTab: tab.value,
        readOnly,
        'onUpdate:activeTab': (next: InventoryTab) => {
          tab.value = next;
        },
      }),
  });
  app.use(router).use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await flush();
  const click = async (label: string, selector = 'button') => {
    [...host.querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent?.trim() === label)!.click();
    await flush();
  };
  return { host, router, tab, click };
}

describe('背包内容整合与操作边界', () => {
  it('从积分卡进入完整明细，按需挂载并在来回切换后保留筛选', async () => {
    const { host, click, tab } = await mount();
    expect(mocks.detailsMounts).toBe(0);
    await click('查看明细');
    expect(tab.value).toBe('points');
    expect(mocks.detailsMounts).toBe(1);
    const input = host.querySelector('input')!;
    input.value = 'spent';
    input.dispatchEvent(new Event('input'));
    await click('背包总览', '[role=tab]');
    await click('积分明细', '[role=tab]');
    expect(host.querySelector('input')?.value).toBe('spent');
    expect(mocks.detailsMounts).toBe(1);
    expect(host.querySelectorAll('.inv-assets .asset')).toHaveLength(3);
  });
  it('直达积分页签时延迟挂载获得记录，页头仍能打开同一个记录视图', async () => {
    const { host, click } = await mount('points');
    expect(host.querySelector('.records-test')).toBeNull();
    await click('获得记录');
    expect(host.querySelectorAll('.records-test')).toHaveLength(1);
    expect(mocks.recordOpens).toBe(1);
  });
  it('余额加载失败不遮挡积分明细；只读上下文禁用写操作，保留明细入口', async () => {
    const { host, click, router } = await mount('overview', true);
    for (const label of ['去兑换', '购买', '补签']) {
      const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')].filter(
        (el) => el.textContent?.trim() === label,
      );
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons.every((button) => button.disabled)).toBe(true);
    }
    expect(host.querySelectorAll('.inv-item')).toHaveLength(1);
    await click('查看明细');
    expect(router.currentRoute.value.path).toBe('/growth');
    mocks.state.inventory.value = null;
    mocks.state.inventoryError.value = true;
    await flush();
    expect(host.querySelector('[role=alert]')).not.toBeNull();
    expect(host.querySelector('.points-test')).not.toBeNull();
  });
});
