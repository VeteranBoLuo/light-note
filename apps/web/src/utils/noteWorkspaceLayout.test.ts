import { describe, expect, it } from 'vitest';
import { NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH, resolveNoteWorkspaceLayout } from './noteWorkspaceLayout';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const shellSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/workspace/NoteWorkspaceShell.vue'), 'utf8');

describe('resolveNoteWorkspaceLayout', () => {
  it('统一页面侧栏默认宽度', () => {
    expect(NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH).toBe(270);
  });

  it('宽屏同时停靠页面树与 AI', () => {
    expect(resolveNoteWorkspaceLayout(1420)).toEqual({
      mode: 'wide',
      sidebarPresentation: 'dock',
      aiPresentation: 'dock',
    });
  });

  it('标准桌面保留页面树并把 AI 切成浮层', () => {
    expect(resolveNoteWorkspaceLayout(1180)).toEqual({
      mode: 'standard',
      sidebarPresentation: 'dock',
      aiPresentation: 'overlay',
    });
  });

  it('紧凑桌面先把页面树收成轨道，继续变窄再使用浮层', () => {
    expect(resolveNoteWorkspaceLayout(960).sidebarPresentation).toBe('rail');
    expect(resolveNoteWorkspaceLayout(959).sidebarPresentation).toBe('overlay');
  });

  it('手机强制关闭桌面双侧栏', () => {
    expect(resolveNoteWorkspaceLayout(1600, true)).toEqual({
      mode: 'mobile',
      sidebarPresentation: 'hidden',
      aiPresentation: 'hidden',
    });
  });

  it('工作区允许页面显式启用桌面双停靠，并保留可配置的中栏下限', () => {
    expect(shellSource).toContain('forceDockedPanels?: boolean');
    expect(shellSource).toContain("if (!props.forceDockedPanels || props.mobile) return resolved");
    expect(shellSource).toContain("sidebarPresentation: props.hasSidebar ? ('dock' as const) : ('hidden' as const)");
    expect(shellSource).toContain("aiPresentation: props.hasAi ? ('dock' as const) : ('hidden' as const)");
    expect(shellSource).toContain("'--note-workspace-main-min-width'");
  });
});
