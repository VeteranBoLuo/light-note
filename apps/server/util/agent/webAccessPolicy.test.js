import { describe, expect, it } from 'vitest';
import { hasExplicitWebUrl, isAgentUrlAllowedByScope } from './webAccessPolicy.js';

describe('Agent 网页访问范围', () => {
  it('识别用户显式提供的 HTTP/HTTPS 与 www 地址', () => {
    expect(hasExplicitWebUrl('https://uuye.163.com这个链接是干嘛的？')).toBe(true);
    expect(hasExplicitWebUrl('总结 www.example.com/docs')).toBe(true);
    expect(hasExplicitWebUrl('帮我搜索一下相关资料')).toBe(false);
  });

  it('关闭广泛联网时仅允许用户原话中的 URL', () => {
    expect(
      isAgentUrlAllowedByScope({
        message: 'https://uuye.163.com这个链接是干嘛的？',
        url: 'https://uuye.163.com',
      }),
    ).toBe(true);
    expect(
      isAgentUrlAllowedByScope({
        message: '总结 www.example.com/docs',
        url: 'https://www.example.com/docs',
      }),
    ).toBe(true);
    expect(
      isAgentUrlAllowedByScope({
        message: '总结 https://example.com/中文页面。',
        url: 'https://example.com/中文页面',
      }),
    ).toBe(true);
    expect(
      isAgentUrlAllowedByScope({
        message: '总结 https://example.com/docs',
        url: 'https://other.example.com/docs',
      }),
    ).toBe(false);
  });

  it('不会把更长域名或路径的前缀误授权', () => {
    expect(
      isAgentUrlAllowedByScope({
        message: '看看 https://example.com.evil.test/docs',
        url: 'https://example.com',
      }),
    ).toBe(false);
    expect(
      isAgentUrlAllowedByScope({
        message: '看看 https://example.com/document',
        url: 'https://example.com/doc',
      }),
    ).toBe(false);
  });

  it('显式打开广泛联网时仍要求参数是有效 HTTP/HTTPS URL', () => {
    expect(isAgentUrlAllowedByScope({ message: '', url: 'https://example.com', externalWeb: true })).toBe(true);
    expect(isAgentUrlAllowedByScope({ message: '', url: 'file:///etc/passwd', externalWeb: true })).toBe(false);
    expect(isAgentUrlAllowedByScope({ message: '', url: 'https://user:pass@example.com', externalWeb: true })).toBe(
      false,
    );
  });

  it('允许读取服务端按用户书签 ID 重新校验得到的精确链接', () => {
    expect(
      isAgentUrlAllowedByScope({
        message: '继续详细分析刚才那个书签',
        url: 'https://example.com/docs',
        allowedUrls: ['https://example.com/docs'],
      }),
    ).toBe(true);
    expect(
      isAgentUrlAllowedByScope({
        message: '继续详细分析刚才那个书签',
        url: 'https://example.com/admin',
        allowedUrls: ['https://example.com/docs'],
      }),
    ).toBe(false);
  });
});
