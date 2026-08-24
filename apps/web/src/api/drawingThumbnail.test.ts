import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiBasePost: vi.fn(),
  apiBaseHead: vi.fn(),
  createDataUrl: vi.fn(),
}));

vi.mock('@/http/request', () => ({ apiBaseHead: mocks.apiBaseHead, apiBasePost: mocks.apiBasePost }));
vi.mock('@/utils/drawingThumbnail', () => ({ createDrawingThumbnailDataUrl: mocks.createDataUrl }));

import { drawingThumbnailUrl, ensureDrawingThumbnail, uploadDrawingThumbnail } from './drawingThumbnail';

describe('drawingThumbnail api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('缩略图地址包含正文 revision，卡片可使用长期不可变缓存', () => {
    expect(drawingThumbnailUrl('drawing-1', 7)).toBe('/api/note/drawing-thumbnail/drawing-1/v3-7.webp');
    expect(drawingThumbnailUrl('', 7)).toBe('');
  });

  it('只在浏览器成功生成 WebP 后上传派生图', async () => {
    mocks.createDataUrl.mockReturnValue('data:image/webp;base64,AAAA');
    mocks.apiBasePost.mockResolvedValue({ status: 200 });

    await expect(uploadDrawingThumbnail('drawing-1', 7, '{"v":2}')).resolves.toBe(true);
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/note/uploadDrawingThumbnail',
      { id: 'drawing-1', revision: 7, rendererVersion: 3, thumbnail: 'data:image/webp;base64,AAAA' },
      { silent: true, feedback: false },
    );
  });

  it('打开历史笔记时先探测派生图，404 才从完整 scene 静默补传', async () => {
    mocks.apiBaseHead.mockRejectedValue({ status: 404 });
    mocks.createDataUrl.mockReturnValue('data:image/webp;base64,AAAA');
    mocks.apiBasePost.mockResolvedValue({ status: 200 });

    await expect(ensureDrawingThumbnail('legacy-drawing', 3, '{"v":3}')).resolves.toBe(true);
    expect(mocks.apiBaseHead).toHaveBeenCalledWith('/api/note/drawing-thumbnail/legacy-drawing/v3-3.webp', undefined, {
      silent: true,
      feedback: false,
    });
    expect(mocks.apiBasePost).toHaveBeenCalledTimes(1);
  });

  it('当前 revision 已有派生图时不重复编码上传', async () => {
    mocks.apiBaseHead.mockResolvedValue(200);
    await expect(ensureDrawingThumbnail('existing-drawing', 8, '{"v":4}')).resolves.toBe(true);
    expect(mocks.createDataUrl).not.toHaveBeenCalled();
    expect(mocks.apiBasePost).not.toHaveBeenCalled();
  });
});
