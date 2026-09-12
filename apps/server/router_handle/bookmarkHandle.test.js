import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';

// common.js 的循环依赖链会一路拉到 router/file.js → util/obsClient.js,
// 后者在模块加载时就 new ObsClient(...),本地没有 OBS_AK/OBS_SK 时会直接抛错(同 commonHandle.test.js 的环境问题),
// mock 掉换成占位实现,不影响本文件只测 normalizeBookmarkUrl 这个纯函数。
vi.mock('../util/obsClient.js', () => ({
  default: {},
  bucketBaseUrl: 'https://mock-bucket.example.com',
  buildObjectKey: vi.fn(),
  createUploadSignedUrl: vi.fn(),
  createDownloadSignedUrl: vi.fn(),
  deleteObjectFromObs: vi.fn(),
  copyObjectInObs: vi.fn(),
  putObjectToObs: vi.fn(),
  buildObjectUrl: vi.fn(),
}));

// bookmarkHandle.js 依赖 common.js(resultData),存在 common.js↔router↔handler 循环依赖:
// 先 import common.js 让 handler 作为叶子完成初始化,规避循环(同 auth.test.js / commonHandle.test.js)。
await import('../util/common.js');
const { normalizeBookmarkUrl } = await import('./bookmarkHandle.js');
const source = readFileSync(new URL('./bookmarkHandle.js', import.meta.url), 'utf8');

describe('normalizeBookmarkUrl', () => {
  it('裸域名补 https://', () => {
    expect(normalizeBookmarkUrl('keep.com')).toBe('https://keep.com');
  });

  it('已带 http:// 时保持不变(不重复补)', () => {
    expect(normalizeBookmarkUrl('http://keep.com')).toBe('http://keep.com');
  });

  it('已带 https:// 时保持不变', () => {
    expect(normalizeBookmarkUrl('https://keep.com')).toBe('https://keep.com');
  });

  it('大小写不敏感(HTTPS://)', () => {
    expect(normalizeBookmarkUrl('HTTPS://keep.com')).toBe('https://keep.com');
  });

  it('去除首尾空格后再判断', () => {
    expect(normalizeBookmarkUrl('  keep.com  ')).toBe('https://keep.com');
  });

  it('显式传入空地址时直接拒绝', () => {
    for (const value of ['', '   ', undefined, null]) {
      expect(() => normalizeBookmarkUrl(value)).toThrow('网址不能为空');
    }
  });

  it('拒绝错误拼接和分享文案，不能仅凭 https 前缀放行', () => {
    expect(() => normalizeBookmarkUrl('https://%20keep.com')).toThrow('识别到候选地址');
    expect(() => normalizeBookmarkUrl('https://网址放这里→ https:// keep.com')).toThrow('识别到候选地址');
    expect(() => normalizeBookmarkUrl('javascript:alert(1)')).toThrow('仅支持 HTTP 或 HTTPS 地址');
  });
});

describe('bookmarkHandle 资源主体与错误边界', () => {
  it('编辑与排序在管理员代管模式下写入 resourceUser，而不是管理员本人', () => {
    const updateSource = source.slice(source.indexOf('export const updateBookmark ='), source.indexOf('export const getBookmarkDetail'));
    const sortSource = source.slice(source.indexOf('export const updateBookmarkSort ='), source.indexOf('// 解析 Netscape'));

    expect(updateSource).toContain('const userId = (req.resourceUser || req.user).id');
    expect(sortSource).toContain('const userId = (req.resourceUser || req.user).id');
    expect(updateSource).not.toContain('const userId = req.user.id');
    expect(sortSource).not.toContain('const userId = req.user.id');
  });

  it('书签编辑不会把数据库原始错误文本返回给客户端', () => {
    const updateSource = source.slice(source.indexOf('export const updateBookmark ='), source.indexOf('export const getBookmarkDetail'));
    expect(updateSource).toContain("console.error('[bookmark] update failed code=%s'");
    expect(updateSource).toContain("resultData(null, 500, '服务器内部错误')");
    expect(updateSource).not.toContain('resultData(null, 500, error.message)');
  });
});

describe('书签详情响应边界', () => {
  it('按认证归属返回可序列化的详情', async () => {
    const { default: pool } = await import('../db/index.js');
    const { getBookmarkDetail } = await import('./bookmarkHandle.js');
    const query = vi.spyOn(pool, 'query').mockResolvedValueOnce([[{
      id: 'bookmark-1', name: '手填名称', description: '手填说明', url: 'https://example.com',
    }]]);
    try {
      const send = vi.fn();
      await getBookmarkDetail({ body: { filters: { id: 'bookmark-1' }, userId: 'untrusted' }, user: { id: 'login' }, resourceUser: { id: 'owner' } }, { send });
      expect(query.mock.calls[0][1]).toEqual(['bookmark-1', 'owner']);
      expect(send.mock.calls[0][0]).toMatchObject({ status: 200, data: { name: '手填名称', description: '手填说明' } });
      expect(() => JSON.stringify(send.mock.calls[0][0])).not.toThrow();
    } finally { query.mockRestore(); }
  });

  it('不存在或不属于当前账号时返回 404，数据库故障不泄露内部错误', async () => {
    const { default: pool } = await import('../db/index.js');
    const { getBookmarkDetail } = await import('./bookmarkHandle.js');
    const query = vi.spyOn(pool, 'query').mockResolvedValueOnce([[]]).mockRejectedValueOnce(new Error('private SQL failure'));
    try {
      const send = vi.fn();
      const req = { body: { filters: { id: 'missing' } }, user: { id: 'owner' } };
      await getBookmarkDetail(req, { send });
      expect(send.mock.calls[0][0]).toMatchObject({ status: 404, data: null });
      await getBookmarkDetail(req, { send });
      expect(send.mock.calls[1][0]).toMatchObject({ status: 500, msg: '获取书签失败，请稍后重试' });
      expect(JSON.stringify(send.mock.calls[1][0])).not.toContain('private SQL');
    } finally { query.mockRestore(); }
  });
});
