import { describe, expect, it } from 'vitest';
import { resolveCommunityChatMentionQuery } from './communityChatMentionQuery';

function resolveAtEnd(text: string) {
  return resolveCommunityChatMentionQuery(text, text.length);
}

describe('resolveCommunityChatMentionQuery', () => {
  it.each([
    ['@', '', 0],
    ['123@', '', 3],
    ['你好@薄荷', '薄荷', 2],
    ['前面已有内容 @ln_member', 'ln_member', 7],
  ])('允许在已有内容后触发：%s', (text, keyword, start) => {
    expect(resolveAtEnd(text)).toEqual({ start, end: text.length, keyword });
  });

  it('按光标位置解析句中提及，不吞掉光标后的正文', () => {
    const text = '请联系123@后面的内容';
    const caret = '请联系123@'.length;
    expect(resolveCommunityChatMentionQuery(text, caret)).toEqual({
      start: '请联系123'.length,
      end: caret,
      keyword: '',
    });
  });

  it.each([
    'hello@example.com',
    '访问https://example.com/@member',
    'www.example.com/@member',
    '你好@薄荷 再见',
    '你好@薄荷，稍后联系',
    '你好@@',
  ])('在邮箱、URL 或查询终止符出现后关闭：%s', (text) => {
    expect(resolveAtEnd(text)).toBeNull();
  });

  it('限制候选查询长度', () => {
    expect(resolveAtEnd(`正文@${'长'.repeat(33)}`)).toBeNull();
  });
});
