export type NoteWorkspaceLayoutMode = 'wide' | 'standard' | 'compact' | 'mobile';

export interface NoteWorkspaceLayoutState {
  mode: NoteWorkspaceLayoutMode;
  sidebarPresentation: 'dock' | 'rail' | 'overlay' | 'hidden';
  aiPresentation: 'dock' | 'overlay' | 'hidden';
}

/**
 * 依据工作区容器宽度而非 window 宽度决定双侧栏呈现，避免外层导航、缩放或分屏
 * 让编辑区被压缩到不可用。编辑正文始终优先保留至少约 680px 的可用宽度。
 */
export function resolveNoteWorkspaceLayout(width: number, mobile = false): NoteWorkspaceLayoutState {
  const value = Math.max(0, Number(width || 0));
  if (mobile || value < 768) {
    return { mode: 'mobile', sidebarPresentation: 'hidden', aiPresentation: 'hidden' };
  }
  if (value >= 1420) {
    return { mode: 'wide', sidebarPresentation: 'dock', aiPresentation: 'dock' };
  }
  if (value >= 1180) {
    return { mode: 'standard', sidebarPresentation: 'dock', aiPresentation: 'overlay' };
  }
  if (value >= 960) {
    return { mode: 'compact', sidebarPresentation: 'rail', aiPresentation: 'overlay' };
  }
  return { mode: 'compact', sidebarPresentation: 'overlay', aiPresentation: 'overlay' };
}
