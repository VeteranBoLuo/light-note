import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));
const { entrySource } = await import('./conversion');

function visit(referrer: string, search = '') {
  vi.spyOn(document, 'referrer', 'get').mockReturnValue(referrer);
  window.history.replaceState(null, '', `/${search}`);
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('entrySource', () => {
  it('只上报来源网站域名,不带路径和搜索词', () => {
    visit('https://www.baidu.com/link?url=abc&wd=%E8%BD%BB%E7%AC%BA');
    expect(entrySource()).toEqual({ referrer: 'www.baidu.com', campaign: '' });
  });

  it('推广参数优先取 utm_source,其次 ref,并截断到 32 字符', () => {
    visit('', '?utm_source=v2ex&ref=other');
    expect(entrySource()).toEqual({ referrer: '', campaign: 'v2ex' });
    visit('', `?ref=${'p'.repeat(40)}`);
    expect(entrySource()?.campaign).toHaveLength(32);
  });

  it('从本站打开的新标签页不算来源,非法来源按无来源处理', () => {
    visit(`${location.origin}/noteLibrary`);
    expect(entrySource()).toBeNull();
    visit('not a url');
    expect(entrySource()).toEqual({ referrer: '', campaign: '' });
  });
});
