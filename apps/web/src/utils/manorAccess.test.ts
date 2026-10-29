import { afterEach, describe, expect, it, vi } from 'vitest';
import { manorBrowserSupported, showManorEntry } from './manorAccess';

describe('庄园入口可见性', () => {
  afterEach(() => vi.unstubAllGlobals());
  const open = { features: { manor: true } };
  it('只认服务端开放标记，代管、英文界面和能力不足的浏览器都隐藏入口', () => {
    vi.stubGlobal('CSS', { supports: () => true });
    expect(showManorEntry(open, null, 'zh-CN')).toBe(true);
    expect(showManorEntry({ features: { manor: false } }, null, 'zh-CN')).toBe(false);
    expect(showManorEntry(null, null, 'zh-CN')).toBe(false);
    expect(showManorEntry(open, { mode: 'preview' }, 'zh-CN')).toBe(false);
    expect(showManorEntry(open, null, 'en-US')).toBe(false);
    vi.stubGlobal('CSS', { supports: (property: string) => property !== 'container-type' });
    expect(manorBrowserSupported()).toBe(false);
    expect(showManorEntry(open, null, 'zh-CN')).toBe(false);
  });
  it('缺少 CSS.supports 的旧环境按不支持处理', () => {
    vi.stubGlobal('CSS', undefined);
    expect(manorBrowserSupported()).toBe(false);
  });
});
