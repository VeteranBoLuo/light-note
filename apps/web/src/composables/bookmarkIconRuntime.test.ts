import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKMARK_ICON_LOADING_TIMEOUT_MS,
  beginBookmarkIconRefresh,
  finishBookmarkIconRefresh,
  getBookmarkIconRuntimeState,
  resetBookmarkIconRuntime,
  resolveBookmarkIconSource,
  setBookmarkIconBatchLoading,
} from './bookmarkIconRuntime.ts';

describe('bookmarkIconRuntime', () => {
  beforeEach(() => resetBookmarkIconRuntime());
  afterEach(() => {
    resetBookmarkIconRuntime();
    vi.useRealTimers();
  });

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

  it('批次加载态与单条保存后刷新相互独立', () => {
    setBookmarkIconBatchLoading('bookmark-1', true);
    const token = beginBookmarkIconRefresh('bookmark-1');

    expect(getBookmarkIconRuntimeState('bookmark-1')).toMatchObject({
      refreshing: true,
      batchLoading: true,
    });
    setBookmarkIconBatchLoading('bookmark-1', false);
    expect(getBookmarkIconRuntimeState('bookmark-1')?.refreshing).toBe(true);

    finishBookmarkIconRefresh('bookmark-1', token);
    expect(getBookmarkIconRuntimeState('bookmark-1')).toMatchObject({
      refreshing: false,
      batchLoading: false,
    });
  });

  it('单条刷新超过界面兜底时间后自动清除 refreshing', () => {
    vi.useFakeTimers();
    beginBookmarkIconRefresh('bookmark-1');

    vi.advanceTimersByTime(BOOKMARK_ICON_LOADING_TIMEOUT_MS);

    expect(getBookmarkIconRuntimeState('bookmark-1')?.refreshing).toBe(false);
  });

  it('后台批次超过界面兜底时间后自动清除 batchLoading', () => {
    vi.useFakeTimers();
    setBookmarkIconBatchLoading('bookmark-1', true);

    vi.advanceTimersByTime(BOOKMARK_ICON_LOADING_TIMEOUT_MS);

    expect(getBookmarkIconRuntimeState('bookmark-1')?.batchLoading).toBe(false);
  });
});
