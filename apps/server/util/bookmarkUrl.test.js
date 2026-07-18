import { describe, expect, it } from 'vitest';
import { BookmarkUrlError, inspectBookmarkUrl, requireBookmarkUrl } from './bookmarkUrl.js';

describe('bookmark URL deterministic resolver', () => {
  it.each([
    ['https://boluo66.top', 'valid', 'https://boluo66.top'],
    ['boluo66.top', 'normalized', 'https://boluo66.top'],
    ['https:123.com', 'normalized', 'https://123.com'],
    ['  HTTP://Example.COM/path  ', 'normalized', 'http://example.com/path'],
  ])('规范化可确定的单一地址: %s', (input, state, canonicalUrl) => {
    expect(inspectBookmarkUrl(input)).toMatchObject({ state, canonicalUrl, candidates: [] });
  });

  it('协议后编码空格只生成候选，不静默修改后保存', () => {
    expect(inspectBookmarkUrl('https://%20boluo66.top/')).toMatchObject({
      state: 'needs_confirmation',
      candidates: [{ url: 'https://boluo66.top', source: 'explicit' }],
    });
    expect(inspectBookmarkUrl('https:// boluo66.top')).toMatchObject({
      state: 'needs_confirmation',
      candidates: [{ url: 'https://boluo66.top', source: 'explicit' }],
    });
  });

  it('重复协议拼接不直接保存，只给出可核对的候选地址', () => {
    expect(inspectBookmarkUrl('https://https:123.com')).toMatchObject({
      state: 'needs_confirmation',
      candidates: [{ url: 'https://123.com', source: 'domain' }],
    });
  });

  it('从分享文案中提取唯一候选并忽略“网址放这里”等占位文本', () => {
    const result = inspectBookmarkUrl(
      'https://网址放这里→ https:// boluo66.top  ，手机电脑平板通用，欢迎体验[害羞R]',
    );
    expect(result).toMatchObject({
      state: 'needs_confirmation',
      candidates: [{ url: 'https://boluo66.top', source: 'explicit' }],
    });
  });

  it('多地址文本保留去重后的候选，交由用户选择', () => {
    expect(inspectBookmarkUrl('example.com 或 https://openai.com')).toMatchObject({
      state: 'needs_confirmation',
      candidates: [
        { url: 'https://openai.com', source: 'explicit' },
        { url: 'https://example.com', source: 'domain' },
      ],
    });
  });

  it.each(['javascript:alert(1)', '不是网址', 'https://user:pass@example.com'])('拒绝非法地址: %s', (input) => {
    expect(inspectBookmarkUrl(input).state).toBe('invalid');
  });

  it('区分带账号密码和超长网址，便于端上给出精确提示', () => {
    expect(inspectBookmarkUrl('https://user:pass@example.com').code).toBe('CREDENTIALS_NOT_ALLOWED');
    expect(inspectBookmarkUrl(`https://example.com/${'a'.repeat(240)}`).code).toBe('URL_TOO_LONG');
  });

  it('清理 Markdown 或句子末尾的右括号', () => {
    expect(inspectBookmarkUrl('参考 (https://example.com/path).')).toMatchObject({
      state: 'needs_confirmation',
      candidates: [{ url: 'https://example.com/path', source: 'explicit' }],
    });
  });

  it('严格入口不从 HTML href 中提取分享文案', () => {
    expect(inspectBookmarkUrl('点击 example.com 查看', { allowTextExtraction: false }).state).toBe('invalid');
  });

  it('服务层对候选地址抛出可供前端和 Agent 继续选择的结构化错误', () => {
    expect(() => requireBookmarkUrl('地址一 example.com，地址二 openai.com')).toThrow(BookmarkUrlError);
    try {
      requireBookmarkUrl('地址一 example.com，地址二 openai.com');
    } catch (error) {
      expect(error).toMatchObject({ code: 'CANDIDATE_CONFIRMATION_REQUIRED', status: 400 });
      expect(error.data.urlResolution.candidates).toHaveLength(2);
    }
  });
});
