import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Router } from 'vue-router';
import type { SearchResultItem } from '@/api/search';
import { locateSearchResult, navigateToSearchResult } from './globalSearchNavigation';
import { openBookmarkUrl } from '@/utils/openBookmark';

vi.mock('@/utils/openBookmark', () => ({ openBookmarkUrl: vi.fn() }));

const push = vi.fn();
const router = { push } as unknown as Router;
const file: SearchResultItem = {
  id: 'file-42',
  type: 'file',
  title: '项目报告 #1.pdf',
  description: '',
  route: '/cloudSpace?fileName=old-name.pdf',
};

beforeEach(() => vi.clearAllMocks());

describe('搜索结果打开与定位', () => {
  it('打开文件只用稳定 ID，不继承名称过滤或旧 route', () => {
    navigateToSearchResult(router, file);
    expect(push).toHaveBeenCalledExactlyOnceWith({ path: '/cloudSpace', query: { fileId: 'file-42' } });
  });

  it('改名不改变打开对象，重名结果按各自 ID 打开', () => {
    navigateToSearchResult(router, { ...file, title: '改名后的报告.pdf' });
    navigateToSearchResult(router, { ...file, id: 'file-43' });
    expect(push.mock.calls.map(([target]) => target.query)).toEqual([{ fileId: 'file-42' }, { fileId: 'file-43' }]);
  });

  it('缺少文件 ID 时不退回名称或不可信 route 打开', () => {
    navigateToSearchResult(router, { ...file, id: ' ' });
    expect(push).not.toHaveBeenCalled();
  });

  it('定位文件保留按展示名称筛选的原入口，不打开预览', () => {
    locateSearchResult(router, file);
    expect(push).toHaveBeenCalledExactlyOnceWith({ path: '/cloudSpace', query: { fileName: file.title } });
  });

  it('书签打开仍遵守统一打开工具，定位仍进入书签列表', () => {
    const bookmark: SearchResultItem = { ...file, id: 'bookmark-1', type: 'bookmark', url: 'https://example.com' };
    navigateToSearchResult(router, bookmark);
    expect(openBookmarkUrl).toHaveBeenCalledExactlyOnceWith(bookmark.url, { resourceId: bookmark.id });
    expect(push).not.toHaveBeenCalled();
    locateSearchResult(router, bookmark);
    expect(push).toHaveBeenCalledExactlyOnceWith({ path: '/home', query: { locate: bookmark.id } });
  });

  it.each(['note', 'tag', 'todo'] as const)('%s 沿用原有站内路由，没有文件定位行为', (type) => {
    const result = { ...file, type, route: `/${type}/fixture` };
    navigateToSearchResult(router, result);
    locateSearchResult(router, result);
    expect(push).toHaveBeenCalledExactlyOnceWith(result.route);
  });
});
