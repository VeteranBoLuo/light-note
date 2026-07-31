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

  it('邮箱与 URL 不触发', () => {
    const mail = 'felix@dupoin.com';
    expect(resolveMentionQuery(mail, 'felix@'.length)).toBeNull();
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
