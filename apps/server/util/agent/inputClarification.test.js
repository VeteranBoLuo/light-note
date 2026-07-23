import { describe, expect, it } from 'vitest';
import { resolveAgentInputClarification } from './inputClarification.js';

describe('resolveAgentInputClarification', () => {
  it('网页总结缺少链接时确定性澄清', () => {
    expect(resolveAgentInputClarification({ message: '帮我总结一个网页（粘贴链接）' })).toBe(
      '请粘贴需要读取或总结的网页链接。',
    );
  });

  it('已有链接或显式网页资源时不拦截', () => {
    expect(resolveAgentInputClarification({ message: '总结 https://example.com' })).toBe('');
    expect(
      resolveAgentInputClarification({
        message: '总结这个网页',
        contextTypes: ['bookmark'],
      }),
    ).toBe('');
  });

  it('普通总结请求不误判为缺少网址', () => {
    expect(resolveAgentInputClarification({ message: '总结我最近的笔记' })).toBe('');
  });
});
