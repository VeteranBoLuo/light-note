import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginNetworkRequestFeedback,
  finishNetworkRequestFeedback,
  networkRequestLoading,
  resetNetworkRequestFeedback,
} from './useNetworkRequestFeedback';

describe('networkRequestFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetNetworkRequestFeedback();
  });

  afterEach(() => {
    resetNetworkRequestFeedback();
    vi.useRealTimers();
  });

  it('快速请求不闪烁全局进度条', () => {
    beginNetworkRequestFeedback();
    vi.advanceTimersByTime(120);
    finishNetworkRequestFeedback();
    vi.runAllTimers();
    expect(networkRequestLoading.value).toBe(false);
  });

  it('弱网请求超过阈值后显示，并满足最短可见时间', () => {
    beginNetworkRequestFeedback();
    vi.advanceTimersByTime(380);
    expect(networkRequestLoading.value).toBe(true);
    finishNetworkRequestFeedback();
    vi.advanceTimersByTime(259);
    expect(networkRequestLoading.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(networkRequestLoading.value).toBe(false);
  });

  it('并发请求全部结束后才隐藏', () => {
    beginNetworkRequestFeedback();
    beginNetworkRequestFeedback();
    vi.advanceTimersByTime(380);
    finishNetworkRequestFeedback();
    vi.advanceTimersByTime(500);
    expect(networkRequestLoading.value).toBe(true);
    finishNetworkRequestFeedback();
    vi.advanceTimersByTime(260);
    expect(networkRequestLoading.value).toBe(false);
  });
});
