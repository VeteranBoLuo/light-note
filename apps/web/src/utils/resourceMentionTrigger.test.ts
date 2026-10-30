import { describe, expect, it } from 'vitest';
import { replaceMentionQuery, resolveMentionQuery } from './resourceMentionTrigger';

describe('resourceMentionTrigger', () => {
  it('解析光标处的 @ 关键词区间', () => {
    const text = '整理备案材料,参考 @备案';
    const query = resolveMentionQuery(text, text.length);
    expect(query).toMatchObject({ keyword: '备案' });
    expect(text.slice(query!.start, query!.end)).toBe('@备案');
  });

  it('刚输入 @ 时即触发,关键词为空', () => {
    const text = '参考 @';
    expect(resolveMentionQuery(text, text.length)).toMatchObject({ keyword: '' });
  });

  it('关键词后出现空格即退出提及上下文', () => {
    const text = '参考 @备案 材料';
    expect(resolveMentionQuery(text, text.length)).toBeNull();
  });

  it('紧接中文混排词立即触发，紧接纯英文/数字时等关键词出现中文', () => {
    expect(resolveMentionQuery('版本v2@', 5)).toMatchObject({ start: 4, keyword: '' });
    expect(resolveMentionQuery('第2@', 3)).toMatchObject({ keyword: '' });
    expect(resolveMentionQuery('hello@', 6)).toBeNull();
    expect(resolveMentionQuery('参考 v2@项', 7)).toMatchObject({ keyword: '项' });
    expect(resolveMentionQuery('2024@年报', 7)).toMatchObject({ keyword: '年报' });
  });

  it('纯字母或数字开头的邮箱全程不触发，URL 不触发', () => {
    for (const mail of ['felix@dupoin.com', '1902013368@qq.com']) {
      for (let caret = mail.indexOf('@') + 1; caret <= mail.length; caret += 1) {
        expect(resolveMentionQuery(mail, caret)).toBeNull();
      }
    }
    expect(resolveMentionQuery('name.surname@资料', 15)).toBeNull();
    expect(resolveMentionQuery('参考 @readme.md', 13)).toMatchObject({ keyword: 'readme.md' });
    const url = 'https://a.com/@user';
    expect(resolveMentionQuery(url, url.length)).toBeNull();
  });

  it('中文连写场景放行', () => {
    const text = '查阅AI@资料';
    expect(resolveMentionQuery(text, text.length)).toMatchObject({ keyword: '资料' });
  });

  it('光标在 @ 之前时不触发', () => {
    const text = '参考 @备案';
    expect(resolveMentionQuery(text, 2)).toBeNull();
  });

  it('超长关键词判定为已离开提及上下文', () => {
    const text = `参考 @${'长'.repeat(60)}`;
    expect(resolveMentionQuery(text, text.length)).toBeNull();
  });

  it('替换区间可消费查询文本或插入内容', () => {
    const text = '参考 @备案';
    const query = resolveMentionQuery(text, text.length)!;
    expect(replaceMentionQuery(text, query)).toBe('参考 ');
    expect(replaceMentionQuery(text, query, '[备案清单]')).toBe('参考 [备案清单]');
  });
});
