import { describe, expect, it } from 'vitest';
import { buildBookmarkCapturePayload, resolveBookmarkCaptureReceipt } from './bookmarkCapture.ts';

describe('浏览器书签收集模式', () => {
  it('正式保存保留标签和网页存档', () => {
    expect(
      buildBookmarkCapturePayload({
        mode: 'formal',
        source: 'browser_extension',
        url: ' https://example.com ',
        name: ' 示例 ',
        description: ' 描述 ',
        relatedTags: ['tag-1'],
        relatedTagNames: ['新标签'],
      }),
    ).toEqual({
      url: 'https://example.com',
      name: '示例',
      description: '描述',
      relatedTags: ['tag-1'],
      relatedTagNames: ['新标签'],
      tagSource: 'browser_extension',
      addToInbox: false,
      inboxSource: 'browser_extension',
      saveSnapshot: true,
    });
  });

  it('快速待整理强制清空标签并关闭网页存档', () => {
    const payload = buildBookmarkCapturePayload({
      mode: 'inbox',
      source: 'quick_capture',
      url: 'https://example.com',
      name: '示例',
      relatedTags: ['tag-1'],
      relatedTagNames: ['新标签'],
      saveSnapshot: true,
    });

    expect(payload).toMatchObject({
      relatedTags: [],
      relatedTagNames: [],
      tagSource: 'manual',
      addToInbox: true,
      inboxSource: 'quick_capture',
      saveSnapshot: false,
    });
  });

  it('相同载荷重试复用幂等键，载荷变化后换键', async () => {
    const first = await resolveBookmarkCaptureReceipt({
      mode: 'inbox',
      source: 'quick_capture',
      payload: { url: 'https://example.com', name: '示例' },
    });
    const retry = await resolveBookmarkCaptureReceipt({
      current: first,
      mode: 'inbox',
      source: 'quick_capture',
      payload: { name: '示例', url: 'https://example.com' },
    });
    const changed = await resolveBookmarkCaptureReceipt({
      current: first,
      mode: 'inbox',
      source: 'quick_capture',
      payload: { url: 'https://example.com/changed', name: '示例' },
    });

    expect(retry).toEqual(first);
    expect(changed.key).not.toBe(first.key);
  });
});
