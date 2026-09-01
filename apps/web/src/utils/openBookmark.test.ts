import { beforeEach, describe, expect, it, vi } from 'vitest';

const user = { preferences: { openBookmarkIn: 'newTab' as 'newTab' | 'current' } };
const warning = vi.fn();

vi.mock('@/store', () => ({ useUserStore: () => user }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { warning },
}));
vi.mock('@/i18n', () => ({
  default: { global: { t: (key: string) => key } },
}));

const { openBookmarkUrl } = await import('./openBookmark');

describe('openBookmarkUrl', () => {
  beforeEach(() => {
    user.preferences.openBookmarkIn = 'newTab';
    warning.mockReset();
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('打开旧的小红书 HTTP 短链前自动升级为 HTTPS', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    const opened = openBookmarkUrl('http://xhslink.cn/o/7rNw5RKnE8e');

    expect(opened).toBe(true);
    expect(open).toHaveBeenCalledWith('https://xhslink.cn/o/7rNw5RKnE8e', '_blank', 'noopener,noreferrer');
    expect(warning).not.toHaveBeenCalled();
  });

  it('不擅自改写未知 HTTP 站点，由原生壳或系统浏览器决定打开方式', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    openBookmarkUrl('http://example.com/path');

    expect(open).toHaveBeenCalledWith('http://example.com/path', '_blank', 'noopener,noreferrer');
  });

  it('新标签页在真正打开前同步执行校验后的 beforeNavigate', () => {
    const order: string[] = [];
    const beforeNavigate = vi.fn(({ openInCurrent }: { openInCurrent: boolean }) => {
      order.push('before');
      expect(openInCurrent).toBe(false);
    });
    vi.spyOn(window, 'open').mockImplementation(() => {
      order.push('open');
      return null;
    });

    expect(openBookmarkUrl('https://example.com/review', { beforeNavigate })).toBe(true);
    expect(order).toEqual(['before', 'open']);
  });

  it('当前页打开也会先执行 beforeNavigate，并返回已接受导航', () => {
    user.preferences.openBookmarkIn = 'current';
    const beforeNavigate = vi.fn();
    const target = `${window.location.href}#daily-review-target`;

    expect(openBookmarkUrl(target, { beforeNavigate })).toBe(true);
    expect(beforeNavigate).toHaveBeenCalledWith({ url: target, openInCurrent: true });
    expect(window.location.hash).toBe('#daily-review-target');
  });

  it('非法 URL 不执行回顾写入回调，也不触发导航', () => {
    const beforeNavigate = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    expect(openBookmarkUrl('javascript:alert(1)', { beforeNavigate })).toBe(false);
    expect(beforeNavigate).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledTimes(1);
  });
});
