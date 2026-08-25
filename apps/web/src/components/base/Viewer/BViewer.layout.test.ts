import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/base/Viewer/BViewer.vue'), 'utf8');

describe('BViewer 全局图片预览适配层', () => {
  it('把全局 store 请求交给共享 BImageViewer，不再直接创建第三方查看器', () => {
    expect(source).toContain('<BImageViewer');
    expect(source).toContain('bookmark.viewerKey');
    expect(source).not.toContain('viewerjs');
    expect(source).not.toContain('new Viewer');
  });

  it('默认提供完整工具栏和保存能力，同时保留调用方显式关闭能力', () => {
    expect(source).toContain('bookmark.viewer.options.toolbar !== false');
    expect(source).toContain('bookmark.viewer.options.download !== false');
    expect(source).toContain(':show-toolbar="showToolbar"');
    expect(source).toContain(':allow-download="allowDownload"');
  });
});
