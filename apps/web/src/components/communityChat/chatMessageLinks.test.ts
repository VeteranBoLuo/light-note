import { describe, expect, it } from 'vitest';
import { chatMessageLinkAppPath, splitChatMessageLinks } from './chatMessageLinks';

const links = (text: string) => splitChatMessageLinks(text).filter((part) => part.type === 'link').map((part) => part.value);

describe('chat message links', () => {
  it('keeps the surrounding text and stops at Chinese text, punctuation and whitespace', () => {
    expect(splitChatMessageLinks('完整更新日志：\nhttps://boluo66.top/updateLogs')).toEqual([
      { type: 'text', value: '完整更新日志：\n' },
      { type: 'link', value: 'https://boluo66.top/updateLogs' },
    ]);
    expect(links('看这里https://example.com/a?b=1#c了解更多，或者 http://example.org。')).toEqual([
      'https://example.com/a?b=1#c',
      'http://example.org',
    ]);
  });

  it('leaves sentence punctuation and unmatched brackets outside the link', () => {
    expect(links('文档 (https://example.com/wiki/A_(b)). 结束')).toEqual(['https://example.com/wiki/A_(b)']);
    expect(links('Visit https://example.com/path, then https://example.com/next!')).toEqual([
      'https://example.com/path',
      'https://example.com/next',
    ]);
  });

  it('only links explicit http(s) URLs', () => {
    expect(links('boluo66.top/updateLogs javascript:alert(1) ftp://example.com https://')).toEqual([]);
    expect(splitChatMessageLinks('没有链接')).toEqual([{ type: 'text', value: '没有链接' }]);
  });

  it('maps Light Note links to in-app paths and leaves other sites to the browser', () => {
    expect(chatMessageLinkAppPath('https://boluo66.top/updateLogs?tab=1#v2', 'http://localhost:5173')).toBe(
      '/updateLogs?tab=1#v2',
    );
    expect(chatMessageLinkAppPath('http://localhost:5173/community/chat', 'http://localhost:5173')).toBe(
      '/community/chat',
    );
    expect(chatMessageLinkAppPath('https://tool.boluo66.top/x', 'https://boluo66.top')).toBeNull();
    expect(chatMessageLinkAppPath('https://example.com/updateLogs', 'https://boluo66.top')).toBeNull();
  });
});
