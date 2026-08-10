import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/base/Viewer/BViewer.vue'), 'utf8');

describe('BViewer 全局图片预览布局', () => {
  it('开启 viewer.js 工具栏时把保存按钮上移，避免两组操作重叠', () => {
    expect(source).toContain(':class="{ \'has-viewer-toolbar\': viewerToolbarVisible }"');
    expect(source).toContain('viewerToolbarVisible.value = Boolean(options.toolbar)');
    expect(source).toContain('.viewer-save-btn.has-viewer-toolbar');
    expect(source).toContain('bottom: calc(64px + env(safe-area-inset-bottom, 0px));');
  });

  it('图片预览遵循全站覆盖层级，保存按钮只高一层', () => {
    expect(source).toContain('zIndex: 900');
    expect(source).toContain('z-index: 901');
    expect(source).not.toContain('z-index: 2020');
  });
});
