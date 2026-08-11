import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshViewer = vi.fn();

vi.mock('@/store', () => ({
  bookmarkStore: () => ({ refreshViewer }),
}));

import {
  handleNoteContentImagePreviewEvent,
  openNoteContentImagePreview,
  prepareNoteContentPreviewImages,
} from './noteImagePreview';

describe('noteImagePreview', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    refreshViewer.mockReset();
  });

  it('使用全局查看器按视口打开笔记图片，不继承 200px 的默认限制', () => {
    expect(openNoteContentImagePreview('/uploads/small.png')).toBe(true);
    expect(refreshViewer).toHaveBeenCalledWith(
      '/uploads/small.png',
      expect.objectContaining({
        navbar: false,
        toolbar: true,
        title: false,
        viewed: expect.any(Function),
      }),
    );
  });

  it('正文图片支持鼠标点击和键盘打开，并阻止图片外层链接继续跳转', () => {
    const anchor = document.createElement('a');
    const image = document.createElement('img');
    image.src = 'https://example.com/note.png';
    anchor.appendChild(image);
    document.body.appendChild(anchor);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: image });

    expect(handleNoteContentImagePreviewEvent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(refreshViewer).toHaveBeenCalledTimes(1);
  });

  it('预览正文把动态插入的图片补成可聚焦按钮', () => {
    const container = document.createElement('div');
    container.innerHTML = '<img src="/one.png"><p>正文</p>';

    prepareNoteContentPreviewImages(container, '查看大图');

    const image = container.querySelector('img');
    expect(image?.tabIndex).toBe(0);
    expect(image?.getAttribute('role')).toBe('button');
    expect(image?.getAttribute('aria-label')).toBe('查看大图');
  });
});
