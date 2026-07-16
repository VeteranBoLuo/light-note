import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/store/bookmark', () => ({ default: () => ({ isMobileDevice: false }) }));

const { getLogFingerprint } = await import('./common.ts');

describe('日志请求身份', () => {
  afterEach(() => {
    delete (window as any).fingerprint;
    vi.restoreAllMocks();
  });

  it('复用已经生成的浏览器指纹', () => {
    (window as any).fingerprint = 'cached-fingerprint';
    expect(getLogFingerprint()).toBe('cached-fingerprint');
  });

  it('首个 API 请求前同步生成并缓存指纹', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      textBaseline: '',
      font: '',
      fillStyle: '',
      fillRect: vi.fn(),
      fillText: vi.fn(),
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,fingerprint');

    const first = getLogFingerprint();
    const second = getLogFingerprint();

    expect(first).not.toBe('');
    expect(second).toBe(first);
    expect((window as any).fingerprint).toBe(first);
  });
});
