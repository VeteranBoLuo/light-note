import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasAndroidBridge, postAndroidAppReady, postAndroidMessage } from './androidBridge';

afterEach(() => {
  delete window.LightNoteAndroid;
  vi.restoreAllMocks();
});

describe('androidBridge', () => {
  it('没有原生通道时安全回退', () => {
    expect(hasAndroidBridge()).toBe(false);
    expect(postAndroidMessage({ type: 'download' })).toBe(false);
  });

  it('把结构化消息序列化后交给受信原生通道', () => {
    const postMessage = vi.fn();
    window.LightNoteAndroid = { postMessage };

    expect(postAndroidMessage({ type: 'privacyConsent.withdraw' })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'privacyConsent.withdraw' }));
  });

  it('首个路由页面完成绘制后可通知原生壳撤掉品牌封面', () => {
    const postMessage = vi.fn();
    window.LightNoteAndroid = { postMessage };

    expect(postAndroidAppReady()).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'app.ready' }));
  });

  it('原生通道抛错时不阻断网页回退逻辑', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.LightNoteAndroid = {
      postMessage() {
        throw new Error('bridge unavailable');
      },
    };

    expect(postAndroidMessage({ type: 'download' })).toBe(false);
  });
});
