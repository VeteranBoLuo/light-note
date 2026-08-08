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
  });

  it('打开旧的小红书 HTTP 短链前自动升级为 HTTPS', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    openBookmarkUrl('http://xhslink.cn/o/7rNw5RKnE8e');

    expect(open).toHaveBeenCalledWith('https://xhslink.cn/o/7rNw5RKnE8e', '_blank', 'noopener,noreferrer');
    expect(warning).not.toHaveBeenCalled();
  });

  it('不擅自改写未知 HTTP 站点，由原生壳或系统浏览器决定打开方式', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    openBookmarkUrl('http://example.com/path');

    expect(open).toHaveBeenCalledWith('http://example.com/path', '_blank', 'noopener,noreferrer');
  });
});
