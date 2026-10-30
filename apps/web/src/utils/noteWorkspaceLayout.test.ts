import { describe, expect, it } from 'vitest';
import {
  NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH,
  resolveNoteWorkspaceDockedLayout,
  resolveNoteWorkspaceLayout,
  resolveNoteWorkspacePanelWidth,
} from './noteWorkspaceLayout';
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

describe('参考并排布局', () => {
  const base = { sidebarOpen: true, sidebarWidth: 270, aiMinWidth: 360, mainMinWidth: 480 };

  it('没有参考时保持基础断点', () => {
    expect(resolveNoteWorkspaceDockedLayout({ ...base, width: 1280, preferDockedAi: false })).toEqual(
      resolveNoteWorkspaceLayout(1280),
    );
  });

  it('有参考时 960px 以上右侧卡片常驻，页面树按原断点呈现', () => {
    expect(resolveNoteWorkspaceDockedLayout({ ...base, width: 1280, preferDockedAi: true })).toMatchObject({
      sidebarPresentation: 'dock',
      aiPresentation: 'dock',
    });
    expect(resolveNoteWorkspaceDockedLayout({ ...base, width: 1000, preferDockedAi: true })).toMatchObject({
      sidebarPresentation: 'rail',
      aiPresentation: 'dock',
    });
  });

  it('页面树过宽会把编辑区挤到下限以下时先缩成窄条', () => {
    expect(
      resolveNoteWorkspaceDockedLayout({ ...base, width: 1190, sidebarWidth: 360, preferDockedAi: true }),
    ).toMatchObject({ sidebarPresentation: 'rail', aiPresentation: 'dock' });
  });

  it('窄于 960px 放不下并排，参考退回浮层；手机不显示', () => {
    expect(resolveNoteWorkspaceDockedLayout({ ...base, width: 900, preferDockedAi: true }).aiPresentation).toBe('overlay');
    expect(resolveNoteWorkspaceDockedLayout({ ...base, width: 1600, mobile: true, preferDockedAi: true }).aiPresentation).toBe(
      'hidden',
    );
  });

  it('参考默认占可用宽度 45%，并始终给编辑区留足下限', () => {
    const input = { minWidth: 360, defaultWidth: 328, defaultRatio: 0.45, mainMinWidth: 480 };
    expect(resolveNoteWorkspacePanelWidth({ ...input, available: 1170, preferred: null })).toBe(527);
    expect(resolveNoteWorkspacePanelWidth({ ...input, available: 1170, preferred: 900 })).toBe(690);
    expect(resolveNoteWorkspacePanelWidth({ ...input, available: 800, preferred: null })).toBe(360);
  });

  it('没有参考时共用宽度默认 360px，拖动上限只受编辑区 680px 下限约束', () => {
    const input = { minWidth: 360, defaultWidth: 360, mainMinWidth: 680, available: 1400 };
    expect(resolveNoteWorkspacePanelWidth({ ...input, preferred: null })).toBe(360);
    expect(resolveNoteWorkspacePanelWidth({ ...input, preferred: 900 })).toBe(720);
    expect(resolveNoteWorkspacePanelWidth({ ...input, preferred: 100 })).toBe(360);
  });
});
