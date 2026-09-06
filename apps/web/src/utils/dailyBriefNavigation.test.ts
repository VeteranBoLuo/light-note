import { describe, expect, it } from 'vitest';
import { resolveBriefSourceTarget } from './dailyBriefNavigation';
describe('简报来源导航', () => {
  it('笔记保留工作台返回来源，文件定位到云空间', () => {
    expect(resolveBriefSourceTarget({ type: 'note', id: 'n', title: '笔记' })?.route).toEqual({
      path: '/noteLibrary/n',
      query: { from: '/workbenches' },
    });
    expect(resolveBriefSourceTarget({ type: 'file', id: 'f', title: '文件' })?.route).toEqual({
      path: '/cloudSpace',
      query: { fileId: 'f', fileName: '文件' },
    });
  });
  it('书签沿用安全网址解析，不允许脚本或凭据链接', () => {
    expect(
      resolveBriefSourceTarget({ type: 'bookmark', id: 'b', title: '网页', url: 'https://example.com' })?.external,
    ).toBeTruthy();
    for (const url of ['javascript:alert(1)', 'https://user:secret@example.com', '']) {
      expect(resolveBriefSourceTarget({ type: 'bookmark', id: 'b', title: '网页', url })).toBeNull();
    }
  });
});
