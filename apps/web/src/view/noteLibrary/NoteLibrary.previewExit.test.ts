import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteLibrary.vue'), 'utf8');

describe('笔记库桌面预览退出', () => {
  it('预览态点击笔记库只退出预览，普通态仍执行原有重置', () => {
    expect(source).toContain('@title-click="handleNoteLibraryTitleClick"');
    expect(source).toMatch(
      /async function handleNoteLibraryTitleClick\(\)[\s\S]*if \(desktopPreviewOpen\.value\)[\s\S]*closeDesktopPreview\(\);[\s\S]*return;[\s\S]*await resetNoteLibrary\(\);/,
    );
  });

  it('进入预览前记录列表滚动位置，退出后在原视图恢复', () => {
    expect(source).toMatch(/function openLibraryNote[\s\S]*captureDesktopPreviewScroll\(\);/);
    expect(source).toContain("querySelector<HTMLElement>('.note-main-panel [data-mobile-resource-scroll]')");
    expect(source).toContain('top: element.scrollTop');
    expect(source).toContain('left: element.scrollLeft');
    expect(source).toContain('snapshot.viewMode !== currentViewMode.value');
    expect(source).toContain('element.scrollTop = snapshot.top');
    expect(source).toContain('element.scrollLeft = snapshot.left');
  });

  it('切换目录、标签和完整重置不会错误恢复旧列表位置', () => {
    const discardCalls = source.match(/closeDesktopPreview\(false\);/g) || [];
    expect(discardCalls.length).toBeGreaterThanOrEqual(3);
    expect(source).toMatch(/async function selectDirectory[\s\S]*closeDesktopPreview\(false\);/);
    expect(source).toMatch(/function selectMobileDirectoryTag[\s\S]*closeDesktopPreview\(false\);/);
    expect(source).toMatch(/async function resetNoteLibrary[\s\S]*closeDesktopPreview\(false\);/);
  });
});
