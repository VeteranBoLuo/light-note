import { describe, expect, it, vi } from 'vitest';
import bookmarkParseSkill from './bookmarkParseSkill.js';

describe('bookmark.parse_url', () => {
  it('复用统一书签识别能力，只返回字段建议预览', async () => {
    const database = { query: vi.fn().mockResolvedValue([[{ id: 'tag-1', name: '搜索' }]]) };
    const suggestBookmarkMeta = vi.fn().mockResolvedValue({
      resolvedUrl: 'https://www.baidu.com/',
      name: '百度一下，你就知道',
      description: '搜索服务',
      matchedTagIds: ['tag-1'],
      newTags: [],
      metadataSource: 'page',
    });
    const prepared = await bookmarkParseSkill.prepare({
      input: bookmarkParseSkill.validateInput({ url: 'baidu.com' }),
      context: { identity: { subjectUserId: 'u-1' } },
      request: {},
      dependencies: { database, suggestBookmarkMeta },
    });
    const result = await prepared.callModel({ trace: { traceId: 'trace' } });
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('FROM tag'), ['u-1']);
    expect(suggestBookmarkMeta).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://baidu.com' }));
    expect(result).toMatchObject({ kind: 'field_suggestions', writeCommitted: false });
    expect(prepared.availableActions[0]).toMatchObject({ requiresConfirmation: true });
  });
});
