import { createApp, h, nextTick, type App } from 'vue';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { manorAdminZh } from '@/i18n/locales/manorAdmin';
import { createManorAdminFixture } from '@/e2e/manorAdminFixture';
const api = vi.hoisted(() => ({
  status: vi.fn(),
  overview: vi.fn(),
  players: vi.fn(),
  player: vi.fn(),
  ops: vi.fn(),
  save: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: false }) }));
vi.mock('@/api/manorAdminApi', () => ({
  getManorAdminStatus: api.status,
  getManorAdminOverview: api.overview,
  getManorAdminPlayers: api.players,
  getManorAdminPlayer: api.player,
  getManorAdminOperations: api.ops,
  setManorAdminRuntime: api.save,
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: api.confirm } }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { success: vi.fn() } }));
vi.mock('@/components/admin/AdminDataPage.vue', () => ({
  default: { setup: (_p: any, c: any) => () => h('main', [c.slots.actions?.(), c.slots.default?.()]) },
}));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    props: ['open', 'title'],
    setup: (p: any, c: any) => () =>
      p.open ? h('section', { role: 'dialog' }, [h('h2', p.title), c.slots.default?.()]) : null,
  },
}));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: {
    props: ['value', 'placeholder'],
    emits: ['update:value', 'enter'],
    setup: (p: any, c: any) => () =>
      h('input', {
        value: p.value,
        placeholder: p.placeholder,
        onInput: (e: any) => c.emit('update:value', e.target.value),
        onKeydown: (e: any) => {
          if (e.key === 'Enter') c.emit('enter');
        },
      }),
  },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: {
    props: ['value', 'options'],
    emits: ['update:value'],
    setup: (p: any, c: any) => () =>
      h(
        'select',
        { value: p.value, onChange: (e: any) => c.emit('update:value', e.target.value) },
        p.options.map((o: any) => h('option', { value: o.value }, o.label)),
      ),
  },
}));
vi.mock('@/components/base/BasicComponents/BTabs.vue', () => ({
  default: {
    props: ['activeTab', 'options'],
    emits: ['change'],
    setup: (p: any, c: any) => () =>
      h(
        'nav',
        p.options.map((o: any) => h('button', { onClick: () => c.emit('change', o.key) }, o.label)),
      ),
  },
}));
vi.mock('@/components/base/BasicComponents/BTable/BTable.vue', () => ({
  default: {
    props: ['data', 'columns'],
    setup: (p: any, c: any) => () =>
      h(
        'div',
        p.data.map((r: any) =>
          h(
            'article',
            p.columns.map((column: any) =>
              h('div', c.slots.bodyCell?.({ column, record: r }) || String(r[column.key] || '')),
            ),
          ),
        ),
      ),
  },
}));
import ManorManagement from './ManorManagement.vue';

let app: App | undefined, root: HTMLDivElement, fixture: ReturnType<typeof createManorAdminFixture>;
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await nextTick();
};
const button = (label: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
async function mount(tab = 'overview') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/manor', component: ManorManagement }],
  });
  await router.push({ path: '/manor', query: { tab } });
  root = document.createElement('div');
  document.body.append(root);
  app = createApp(RouterView)
    .use(router)
    .use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': { manorAdmin: manorAdminZh, common: { refresh: '刷新' } } },
      }),
    );
  app.mount(root);
  await flush();
  return router;
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture = createManorAdminFixture();
  api.status.mockImplementation(async () => structuredClone(fixture.runtime));
  api.overview.mockImplementation(async () => fixture.overview());
  api.players.mockResolvedValue({ items: fixture.players.slice(0, 2), total: 86, page: 1 });
  api.ops.mockResolvedValue({ items: fixture.ops, nextCursor: null });
  api.player.mockImplementation(async (id: string) => fixture.player(id));
  api.save.mockResolvedValue({ ...fixture.runtime, mode: 'maintenance', revision: 2 });
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});
describe('庄园管理按目标与修订展示真实结果', () => {
  it('通过玩家入口读取详情，不调用正式玩法写接口', async () => {
    await mount('players');
    button('查看').click();
    await vi.waitFor(() => expect(api.player).toHaveBeenCalledOnce());
    await flush();
    expect(api.player).toHaveBeenCalledWith('u_demo_001', expect.any(AbortSignal));
    expect(root.textContent).toContain('春风的庄园');
    expect(root.textContent).toContain('查看不会领取奖励');
    expect(api.save).not.toHaveBeenCalled();
  });
  it('切换页签后迟到的列表不能覆盖当前记录', async () => {
    let resolve!: (value: any) => void;
    api.players.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await mount('players');
    button('操作记录').click();
    await flush();
    resolve({ items: [{ userId: 'stale', alias: '错误旧用户' }], total: 1, page: 1 });
    await flush();
    expect(root.textContent).not.toContain('错误旧用户');
    expect(root.textContent).toContain('出售作物');
  });
  it('更换筛选失败时不把上个条件的玩家冒充为新结果', async () => {
    const router = await mount('players');
    expect(root.textContent).toContain('春风');
    api.players.mockRejectedValueOnce(new Error('unavailable'));
    await router.replace({ query: { tab: 'players', search: '不存在的用户' } });
    await flush();
    expect(root.textContent).not.toContain('春风');
    expect(root.textContent).toContain('请求未完成，请重试');
  });
  it('维护修改只有确认后提交，携带原配置修订和原因', async () => {
    await mount('settings');
    const select = root.querySelector('select')!;
    select.value = 'maintenance';
    select.dispatchEvent(new Event('change'));
    const reason = root.querySelector('input[placeholder]') as HTMLInputElement;
    reason.value = '公开前维护验收测试';
    reason.dispatchEvent(new Event('input'));
    await flush();
    button('保存运行设置').click();
    expect(api.save).not.toHaveBeenCalled();
    const confirmation = api.confirm.mock.calls[0][0];
    await confirmation.onOk();
    await flush();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'maintenance',
        expectedRevision: 1,
        confirmed: true,
        reason: '公开前维护验收测试',
      }),
    );
    expect(root.textContent).not.toContain('有未保存修改');
  });
  it('保存响应未知时保留原因，只读取当前状态而不自动再次写入', async () => {
    await mount('settings');
    const select = root.querySelector('select')!;
    select.value = 'maintenance';
    select.dispatchEvent(new Event('change'));
    const reason = root.querySelector('input[placeholder]') as HTMLInputElement;
    reason.value = '公开前维护验收测试';
    reason.dispatchEvent(new Event('input'));
    await flush();
    api.save.mockRejectedValue({ code: 'NETWORK_ERROR' });
    button('保存运行设置').click();
    await api.confirm.mock.calls[0][0].onOk();
    await flush();
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('暂未确认保存结果');
    expect(reason.value).toBe('公开前维护验收测试');
  });
  it('未声明统计覆盖时人数显示未知而非假零值', async () => {
    fixture.runtime.coverageStartedAt = null;
    await mount();
    expect(root.textContent).toContain('行为统计覆盖起点尚未确认');
    const active = [...root.querySelectorAll('article')].find((el) => el.textContent?.includes('有操作人数'));
    expect(active?.querySelector('strong')?.textContent).toBe('—');
  });
  it('已知的零积分收支显示为零，与不可用分开', async () => {
    api.overview.mockResolvedValueOnce({ ...fixture.overview(), finances: { issued: 0, spent: 0, trend: [] } });
    await mount();
    for (const label of ['庄园积分产出', '庄园积分消耗']) {
      const metric = [...root.querySelectorAll('article')].find((el) => el.textContent?.includes(label));
      expect(metric?.querySelector('strong')?.textContent).toBe('0');
    }
    expect(root.textContent).toContain('净产出 0');
  });
});
