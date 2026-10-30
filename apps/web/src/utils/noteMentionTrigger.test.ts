import { describe, expect, it } from 'vitest';
import { isAmbiguousAsciiMention, isResourceMentionTextTrigger } from './noteMentionTrigger';

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

  it.each(['hello@', '查看 AI@', 'v2@', '2024@', 'test_tag@', 'v2-beta@', 'привет@'])(
    '允许紧接英文、数字等文字：%s',
    (text) => {
      expect(trigger(text)).toBe(true);
    },
  );

  it.each(['name.surname@', 'test+tag@', 'a%b@', 'mailto:name@', '发送至 mailto:name@'])(
    '拒绝带邮箱专用符号的本地段与 mailto：%s',
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

  it('紧接纯英文/数字单词时，关键词出现非 ASCII 字符前视为疑似邮箱或账号', () => {
    const ambiguous = (text: string, keyword: string) => isAmbiguousAsciiMention(text, text.indexOf('@'), keyword);
    expect(ambiguous('felix@dupoin.com', 'dupoin.com')).toBe(true);
    expect(ambiguous('1902013368@qq.com', 'qq.com')).toBe(true);
    expect(ambiguous('参考 v2@', '')).toBe(true);
    expect(ambiguous('账号 boluo@', 'readme')).toBe(true);
    expect(ambiguous('参考 v2@项目', '项目')).toBe(false);
    expect(ambiguous('test@资料', '资料')).toBe(false);
    // 前面的词含中文、或 @ 前有分隔时，按自然中文书写立即弹出。
    expect(ambiguous('版本v2@', '')).toBe(false);
    expect(ambiguous('查阅AI@', '')).toBe(false);
    expect(ambiguous('参考 @readme', 'readme')).toBe(false);
    expect(ambiguous('@', '')).toBe(false);
  });
});
