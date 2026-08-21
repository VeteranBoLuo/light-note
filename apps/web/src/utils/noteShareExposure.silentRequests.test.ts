import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('公开分享目录写入确认', () => {
  it('创建与拖拽请求关闭全局错误条，只保留业务确认弹框', () => {
    const detail = read('src/view/noteLibrary/NoteDetail.vue');
    const library = read('src/view/noteLibrary/NoteLibrary.vue');
    expect(detail.match(/'\/api\/note\/addNote'[\s\S]{0,220}\{ silent: true \}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(library).toMatch(/'\/api\/note\/moveNoteNode',[\s\S]{0,320}\{ silent: true \}/);
  });

  it('目录树和详情页在进入新建子页面前都执行分享状态预检', () => {
    const exposure = read('src/utils/noteShareExposure.ts');
    const detail = read('src/view/noteLibrary/NoteDetail.vue');
    const library = read('src/view/noteLibrary/NoteLibrary.vue');
    expect(exposure).toContain("'/api/note/previewNoteCreateTarget'");
    expect(exposure).toContain('{ silent: true }');
    expect(detail).toMatch(/createChildPageWithType[\s\S]*?await confirmNoteCreateShareExposure\(parentId\)/);
    expect(library).toMatch(/gotoNewNote[\s\S]*?await confirmNoteCreateShareExposure\(parentId\)/);
    expect(detail).toMatch(/shareExposureAcknowledged[\s\S]*?shareExposureAcknowledged:\s*true/);
    expect(library).toContain("targetQuery.shareExposureAcknowledged = 'true'");
  });

  it('移动与关联已有页面也只显示同一个分享暴露确认', () => {
    const move = read('src/components/noteLibrary/tree/NoteMoveModal.vue');
    const attach = read('src/components/noteLibrary/tree/NoteAttachPagesModal.vue');
    expect(move).toMatch(/'\/api\/note\/moveNoteNodes',[\s\S]{0,320}\{ silent: true \}/);
    expect(move).toMatch(/'\/api\/note\/moveNoteNode',[\s\S]{0,320}\{ silent: true \}/);
    expect(attach).toContain('{ silent: true }');
  });
});
