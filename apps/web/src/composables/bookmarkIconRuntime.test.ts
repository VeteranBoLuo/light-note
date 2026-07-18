import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginBookmarkIconRefresh,
  finishBookmarkIconRefresh,
  getBookmarkIconRuntimeState,
  resetBookmarkIconRuntime,
  resolveBookmarkIconSource,
} from './bookmarkIconRuntime.ts';

describe('bookmarkIconRuntime', () => {
  beforeEach(() => resetBookmarkIconRuntime());

  it('同站点刷新期间保留旧图标，完成后无感切换到新图标', () => {
    const token = beginBookmarkIconRefresh('bookmark-1', {
      previousIconUrl: '/uploads/old.png',
    });

    expect(getBookmarkIconRuntimeState('bookmark-1')?.refreshing).toBe(true);
    expect(resolveBookmarkIconSource('bookmark-1', '/uploads/old.png')).toBe('/uploads/old.png');

    finishBookmarkIconRefresh('bookmark-1', token, '/uploads/new.png');

    expect(getBookmarkIconRuntimeState('bookmark-1')?.refreshing).toBe(false);
    expect(resolveBookmarkIconSource('bookmark-1', '/uploads/old.png')).toBe('/uploads/new.png');
  });

  it('跨站点刷新隐藏旧图标，失败后允许后续列表数据接管', () => {
    const token = beginBookmarkIconRefresh('bookmark-1', {
      clearExisting: true,
      previousIconUrl: '/uploads/old.png',
    });

    expect(resolveBookmarkIconSource('bookmark-1', '/uploads/old.png')).toBe('');
    finishBookmarkIconRefresh('bookmark-1', token);
    expect(getBookmarkIconRuntimeState('bookmark-1')?.refreshing).toBe(false);
    expect(resolveBookmarkIconSource('bookmark-1', '/uploads/old.png')).toBe('');
    expect(resolveBookmarkIconSource('bookmark-1', '/uploads/from-list.png')).toBe('/uploads/from-list.png');
  });

  it('较慢的旧请求不能覆盖后发刷新结果', () => {
    const firstToken = beginBookmarkIconRefresh('bookmark-1');
    const secondToken = beginBookmarkIconRefresh('bookmark-1');

    finishBookmarkIconRefresh('bookmark-1', firstToken, '/uploads/stale.png');
    expect(getBookmarkIconRuntimeState('bookmark-1')?.refreshing).toBe(true);
    expect(resolveBookmarkIconSource('bookmark-1', '')).toBe('');

    finishBookmarkIconRefresh('bookmark-1', secondToken, '/uploads/latest.png');
    expect(resolveBookmarkIconSource('bookmark-1', '')).toBe('/uploads/latest.png');
  });
});
