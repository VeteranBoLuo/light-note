import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/i18n/locales/zh-CN';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/api/growthApi', () => ({ default: { getPointsSummary: get } }));
import PointsSummary from './PointsSummary.vue';
let app: ReturnType<typeof createApp>;
let host: HTMLDivElement;
const data = {
  balance: 2013,
  last28Days: { earned: 900, spent: 140 },
  sources: [
    { key: 'operations', reason: 'admin', amount: 100 },
    { key: 'operations', reason: 'admin', amount: -40 },
  ],
  earningRules: {},
};
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(PointsSummary);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
  await flush();
}
function click(text: string) {
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!.click();
}
beforeEach(() => get.mockReset());
afterEach(() => {
  app?.unmount();
  host?.remove();
});
describe('积分收支摘要', () => {
  it('优先显示完整收入，同一来源的收入和支出可分别查看，展开不重复查询', async () => {
    get.mockResolvedValue({ status: 200, data });
    await mount();
    expect(host.querySelector('.totals .income')?.textContent).toBe('+900');
    expect(host.querySelector('.totals .expense')?.textContent).toBe('-140');
    expect(host.querySelector('.source-groups')).toBeNull();
    click('收支分析');
    await flush();
    expect(host.querySelector('.source-row .income')?.textContent).toBe('+100');
    expect(host.querySelector('.source-row .expense')?.textContent).toBe('-40');
    click('积分规则');
    await flush();
    expect(host.querySelector('.source-groups')).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('加载失败不会伪装成零余额，重试恢复摘要', async () => {
    get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ status: 200, data });
    await mount();
    expect(host.querySelector('.balance strong')?.textContent).toBe('—');
    expect(host.querySelector('[role=alert]')).not.toBeNull();
    click(zh.common.retry);
    await flush();
    expect(host.querySelector('.balance strong')?.textContent).toBe('2,013');
  });
  it('兼容旧接口，净来源加支出恢复完整收入，而非只求正来源之和', async () => {
    get.mockResolvedValue({ status: 200, data: { ...data, last28Days: { spent: 140 } } });
    await mount();
    expect(host.querySelector('.totals .income')?.textContent).toBe('+200');
  });
});
