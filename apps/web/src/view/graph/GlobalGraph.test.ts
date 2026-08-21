import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import { resetMobileOverlayHistoryForTests } from '@/utils/mobileOverlayHistory';
import GlobalGraph from './GlobalGraph.vue';

const mocks = vi.hoisted(() => ({
  bookmark: { isMobile: true },
  fetchGlobalGraph: vi.fn(),
  fetchTagGraph: vi.fn(),
  routerPush: vi.fn(),
  openBookmarkUrl: vi.fn(),
}));

vi.mock('@/store', () => ({
  bookmarkStore: () => mocks.bookmark,
}));

vi.mock('@/router', () => ({
  default: { push: mocks.routerPush },
}));

vi.mock('@/utils/openBookmark.ts', () => ({
  openBookmarkUrl: mocks.openBookmarkUrl,
}));

vi.mock('@/api/tagGraph.ts', () => ({
  fetchGlobalGraph: mocks.fetchGlobalGraph,
  fetchTagGraph: mocks.fetchTagGraph,
}));

let cleanup: (() => void) | undefined;

const tagNode = (id: string, label: string, resourceCount = 1) => ({
  id: `tag:${id}`,
  rawId: id,
  type: 'tag' as const,
  label,
  size: 32,
  weight: resourceCount,
  meta: { resourceCount },
});

const focusedResponse = (centerId: string, centerLabel: string, relatedId: string, relatedLabel: string) => ({
  status: 200,
  msg: '',
  data: {
    centerTag: { id: centerId, name: centerLabel },
    nodes: [
      { ...tagNode(centerId, centerLabel), meta: { isCenter: true } },
      { ...tagNode(relatedId, relatedLabel, 2), meta: { relatedCount: 2, sharedCount: 4 } },
      {
        id: `bookmark:${centerId}-bookmark`,
        rawId: `${centerId}-bookmark`,
        type: 'bookmark' as const,
        label: `${centerLabel}书签`,
        size: 30,
        weight: 1,
        meta: { url: 'https://example.com' },
      },
    ],
    edges: [
      {
        id: `edge:${centerId}:${relatedId}`,
        source: `tag:${centerId}`,
        target: `tag:${relatedId}`,
        type: 'tag-tag' as const,
        weight: 3,
        sharedCount: 4,
      },
    ],
    stats: { relatedTagCount: 1, bookmarkCount: 1, noteCount: 0, fileCount: 0 },
  },
});

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

async function mountGraph() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(GlobalGraph) });
  app.component('OriginalIcon', { render: () => h('span', { 'aria-hidden': 'true' }) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await flushPromises();
  return host;
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 390 });
  mocks.fetchGlobalGraph.mockResolvedValue({
    status: 200,
    msg: '',
    data: {
      nodes: [tagNode('a', '主题 A', 3), tagNode('b', '全局主题 B', 2)],
      edges: [
        {
          id: 'edge:a:b',
          source: 'tag:a',
          target: 'tag:b',
          type: 'tag-tag',
          weight: 3,
          sharedCount: 3,
        },
      ],
      stats: {
        tagCount: 2,
        shownTagCount: 2,
        resourceCount: 5,
        totalResourceCount: 6,
        taggedResourceCount: 5,
        untaggedResourceCount: 1,
        emptyTagCount: 0,
        isolatedTagCount: 0,
        edgeCount: 1,
        truncated: false,
      },
    },
  });
  mocks.fetchTagGraph
    .mockResolvedValueOnce(focusedResponse('a', '主题 A', 'c', '接口相关主题 C'))
    .mockResolvedValueOnce(focusedResponse('c', '接口相关主题 C', 'd', '下一级主题 D'));
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.querySelectorAll('.b-drawer-wrapper').forEach((element) => element.remove());
  mocks.fetchGlobalGraph.mockReset();
  mocks.fetchTagGraph.mockReset();
  mocks.routerPush.mockReset();
  mocks.openBookmarkUrl.mockReset();
  resetMobileOverlayHistoryForTests();
  window.history.replaceState({}, '', '/');
});

describe('GlobalGraph mobile topic exploration', () => {
  it('桌面地图去掉重复标题说明，并把四项统计与重置放在同一工具栏', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/view/graph/GlobalGraph.vue'), 'utf8');
    const toolbar = source.match(/<section class="km-toolbar">([\s\S]*?)<section class="km-content"/)?.[1] || '';
    expect(source).not.toContain('class="km-heading"');
    expect(source).not.toContain('class="km-eyebrow"');
    expect(toolbar).toContain('class="km-stats"');
    expect(toolbar).toContain("t('knowledgeMap.reset')");
  });

  it('opens a topic drawer with focused API relations and switches related topics without routing', async () => {
    const host = await mountGraph();
    const firstTopic = host.querySelector<HTMLButtonElement>('.km-mobile-item');

    firstTopic?.click();
    await flushPromises();
    await nextTick();

    expect(mocks.fetchTagGraph).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tagId: 'a', limitRelatedTags: 12, limitPerResourceType: 50 }),
    );
    let drawer = document.querySelector<HTMLElement>('.b-drawer-panel');
    expect(drawer?.textContent).toContain('主题 A');
    expect(drawer?.textContent).toContain('接口相关主题 C');
    expect(drawer?.textContent).toContain('主题 A书签');
    expect(drawer?.querySelectorAll('[role="tab"]')).toHaveLength(4);

    drawer?.querySelector<HTMLButtonElement>('.km-mobile-related-item')?.click();
    await flushPromises();

    expect(mocks.fetchTagGraph).toHaveBeenNthCalledWith(2, expect.objectContaining({ tagId: 'c' }));
    drawer = document.querySelector<HTMLElement>('.b-drawer-panel');
    expect(drawer?.textContent).toContain('接口相关主题 C');
    expect(drawer?.textContent).toContain('下一级主题 D');
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });
});
