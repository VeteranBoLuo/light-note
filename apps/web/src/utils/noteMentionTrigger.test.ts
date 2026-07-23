import { describe, expect, it } from 'vitest';
import { isResourceMentionTextTrigger } from './noteMentionTrigger';

function trigger(text: string) {
  return isResourceMentionTextTrigger(text, text.lastIndexOf('@'));
}

describe('isResourceMentionTextTrigger', () => {
  it.each(['@', '查看@', '查阅AI@', '第2@', '（@', '：@', '“@', ' @', '\n@'])(
    '允许中文自然正文与明确边界：%s',
    (text) => {
      expect(trigger(text)).toBe(true);
    },
  );

  it.each(['hello@', 'name.surname@', 'test+tag@', 'mailto:name@', '查看 AI@'])(
    '拒绝未分隔的 ASCII 单词或邮箱本地段：%s',
    (text) => {
      expect(trigger(text)).toBe(false);
    },
  );

  it.each(['https://example.com/@', 'www.example.com/@', '`@`', '```\n@\n', '[标题@', '[标题](/noteLibrary/@'])(
    '拒绝 URL、代码与 Markdown 链接语法：%s',
    (text) => {
      expect(trigger(text)).toBe(false);
    },
  );
});
