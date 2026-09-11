import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import zh from '@/i18n/locales/zh-CN';
import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
import Dashboard from './OrganizeOverviewDashboard.vue';
let app: App, host: HTMLElement;
const fixture = () => ({
  pendingShortcut: { state: 'ready', count: 0, typeTotals: { bookmark: 0, note: 0, file: 0 } },
  generatedAt: '2026-09-05',
  issues: {
    untagged: { state: 'ready', findingCount: 191, typeTotals: { bookmark: 3, note: 33, file: 155 } },
    duplicateBookmark: { state: 'ready', findingCount: 0, groupCount: 0 },
    bookmarkHealth: {
      state: 'ready',
      findingCount: 0,
      coverage: { checked: 232, total: 233 },
      alive: 220,
      userNormalCount: 2,
      unknownCount: 10,
      unchecked: 1,
    },
  },
  previews: { untagged: { items: [{ resourceType: 'file', resourceId: 'f', title: '不能把预览当汇总' }] } },
});
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  const props = reactive({ summary: fixture(), onRefresh: vi.fn(), onSelect: vi.fn() });
  app = createApp({ render: () => h(Dashboard, props as any) });
  app.component('SvgIcon', SvgIcon);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
  await nextTick();
  return props;
}
afterEach(() => {
  app?.unmount();
  host?.remove();
});
it('总览不渲染资源操作或筛选，详情入口进入对应分类', async () => {
  const props = await mount();
  expect(host.querySelector('input,[role="combobox"]')).toBeNull();
  expect(host.textContent).not.toContain('加标签');
  expect(host.textContent).not.toContain('不能把预览当汇总');
  expect(host.querySelector('[aria-pressed]')).toBeNull();
  host.querySelector<HTMLButtonElement>('.governance-summary__metric button')!.click();
  expect(props.onSelect).toHaveBeenCalledWith('untagged');
});
it('首张突出卡直接进入 AI 整理建议', async () => {
  const props = await mount();
  const card = host.querySelector<HTMLElement>('.governance-summary__ai-entry')!;
  expect(card.textContent).toContain('AI 整理建议');
  expect(card.textContent).toContain('核心整理能力');
  card.querySelector<HTMLButtonElement>('button')!.click();
  expect(props.onSelect).toHaveBeenCalledWith('ai_suggestions');
});
it('环形图使用全量类型统计，完全忽略预览样本', async () => {
  await mount();
  const chart = host.querySelector('.organize-donut-chart')!;
  expect(chart.textContent).toContain('155');
  expect(chart.textContent).toContain('33');
  expect(chart.textContent).toContain('191');
  expect(chart.querySelectorAll('[data-segment-key]')).toHaveLength(3);
});
it('缺少类型统计时不推算比例、不伪装为零，其他统计仍展示', async () => {
  const props = await mount();
  (props.summary.issues.untagged as any).typeTotals = null;
  await nextTick();
  expect(host.querySelectorAll('.organize-donut-chart')).toHaveLength(0);
  expect(host.textContent).toContain('类型统计暂不可用');
  expect(host.textContent).toContain('232 / 233');
  expect(host.textContent).toContain('191');
});
