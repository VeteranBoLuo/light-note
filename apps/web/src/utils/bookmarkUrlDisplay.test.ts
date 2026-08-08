import { describe, expect, it } from 'vitest';
import { getBookmarkDisplayDomain } from './bookmarkUrlDisplay';

describe('getBookmarkDisplayDomain', () => {
  it.each([
    'http://xhslink.cn/o/7rNw5RKnE8e',
    'https://xhslink.com/o/7rNw5RKnE8e',
    'https://www.xiaohongshu.com/explore/6a753a7c00000000050305b0',
  ])('小红书短链和真实地址都展示真实站点域名: %s', (url) => {
    expect(getBookmarkDisplayDomain(url)).toBe('xiaohongshu.com');
  });

  it('普通网站继续显示自身域名并去掉 www 前缀', () => {
    expect(getBookmarkDisplayDomain('https://www.example.com/docs')).toBe('example.com');
  });
});
