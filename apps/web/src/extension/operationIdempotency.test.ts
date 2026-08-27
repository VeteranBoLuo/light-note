import { describe, expect, it } from 'vitest';
import { resolveExtensionOperationReceipt } from './operationIdempotency';

describe('浏览器插件写入幂等凭据', () => {
  it('同一载荷不受对象字段顺序影响并复用原凭据', async () => {
    const first = await resolveExtensionOperationReceipt({
      scope: 'note',
      payload: { title: '标题', content: '正文', addToInbox: true },
    });
    const replay = await resolveExtensionOperationReceipt({
      current: first,
      scope: 'note',
      payload: { addToInbox: true, content: '正文', title: '标题' },
    });

    expect(replay).toBe(first);
    expect(first.key).toMatch(/^browser-extension:note:[0-9a-f-]{36}$/u);
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('用户修改载荷或凭据 scope 不匹配时生成新操作键', async () => {
    const first = await resolveExtensionOperationReceipt({
      scope: 'bookmark:formal',
      payload: { url: 'https://example.com', relatedTags: ['tag-1'] },
    });
    const changed = await resolveExtensionOperationReceipt({
      current: first,
      scope: 'bookmark:formal',
      payload: { url: 'https://example.com', relatedTags: ['tag-2'] },
    });
    const wrongScope = await resolveExtensionOperationReceipt({
      current: first,
      scope: 'bookmark:inbox',
      payload: { url: 'https://example.com', relatedTags: ['tag-1'] },
    });

    expect(changed.key).not.toBe(first.key);
    expect(wrongScope.key).not.toBe(first.key);
  });
});
