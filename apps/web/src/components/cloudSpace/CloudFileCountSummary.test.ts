import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zh from '@/i18n/locales/zh-CN-core';
import en from '@/i18n/locales/en-US-core';
import CloudFileCountSummary from './CloudFileCountSummary.vue';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function mountSummary(locale = 'zh-CN') {
  const props = ref({
    counts: null as { direct: number; total: number } | null,
    fileTotal: 306,
    allFileCount: 306,
    filtered: false,
    loading: false,
  });
  const host = document.createElement('div');
  const app = createApp({ render: () => h(CloudFileCountSummary, props.value) });
  app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
  app.mount(host);
  cleanup = () => app.unmount();
  return { props, host };
}

describe('CloudFileCountSummary', () => {
  it('全部文件显示列表总量，切换文件夹后区分本层和含子文件夹的总量', async () => {
    const { host, props } = mountSummary();
    expect(host.textContent).toBe('共 306 个文件');
    props.value.counts = { direct: 9, total: 145 };
    props.value.fileTotal = 9;
    await nextTick();
    expect(host.textContent).toBe('当前文件夹有 9 个文件，含子文件夹共 145 个');
    for (const counts of [
      { direct: 0, total: 18 },
      { direct: 8, total: 8 },
      { direct: 0, total: 0 },
    ]) {
      props.value.counts = counts;
      await nextTick();
      expect(host.textContent).toBe(
        counts.direct === counts.total
          ? `当前文件夹共 ${counts.total} 个文件`
          : `当前文件夹有 ${counts.direct} 个文件，含子文件夹共 ${counts.total} 个`,
      );
    }
    props.value.counts = null;
    props.value.fileTotal = 306;
    await nextTick();
    expect(host.textContent).toBe('共 306 个文件');
  });

  it('搜索或类型筛选结果独立显示，不冒充本层库存或子树总量', async () => {
    const { host, props } = mountSummary();
    props.value = {
      counts: { direct: 9, total: 145 },
      fileTotal: 2,
      allFileCount: 306,
      filtered: true,
      loading: false,
    };
    await nextTick();
    expect(host.textContent).toBe('筛选到 2 个文件，当前文件夹共 145 个文件（含子文件夹）');
    props.value.fileTotal = 0;
    await nextTick();
    expect(host.textContent).toBe('筛选到 0 个文件，当前文件夹共 145 个文件（含子文件夹）');
    props.value.counts = null;
    await nextTick();
    expect(host.textContent).toBe('筛选到 0 个文件，全部文件共 306 个');
    props.value.allFileCount = 0;
    await nextTick();
    expect(host.textContent).toBe('筛选到 0 个文件，全部文件共 0 个');
  });

  it('查询中不把上一请求的数量显示为新筛选的结果，并保留已知目录统计', async () => {
    const { host, props } = mountSummary();
    props.value = { counts: { direct: 9, total: 145 }, fileTotal: 2, allFileCount: 306, filtered: true, loading: true };
    await nextTick();
    expect(host.textContent).toBe('正在筛选文件，当前文件夹共 145 个文件（含子文件夹）');
    props.value.counts = null;
    await nextTick();
    expect(host.textContent).toBe('正在筛选文件，全部文件共 306 个');
    props.value.allFileCount = 0;
    await nextTick();
    expect(host.textContent).toBe(zh.common.loading);
  });

  it('英文保持同一统计口径', async () => {
    const { host, props } = mountSummary('en-US');
    props.value = {
      counts: { direct: 9, total: 145 },
      fileTotal: 2,
      allFileCount: 306,
      filtered: true,
      loading: false,
    };
    await nextTick();
    expect(host.textContent).toBe('Matching files: 2; folder total: 145 (including subfolders)');
  });
});
