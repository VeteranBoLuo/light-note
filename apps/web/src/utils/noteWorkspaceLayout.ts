export type NoteWorkspaceLayoutMode = 'wide' | 'standard' | 'compact' | 'mobile';

export interface NoteWorkspaceLayoutState {
  mode: NoteWorkspaceLayoutMode;
  sidebarPresentation: 'dock' | 'rail' | 'overlay' | 'hidden';
  aiPresentation: 'dock' | 'overlay' | 'hidden';
}

export const NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH = 270;
export const NOTE_WORKSPACE_SIDEBAR_MIN_WIDTH = 220;
export const NOTE_WORKSPACE_SIDEBAR_MAX_WIDTH = 360;
/** 拖过最小宽度后再多拖这段距离才松手收起，避免调宽时误收起。 */
export const NOTE_WORKSPACE_COLLAPSE_DRAG_DISTANCE = 48;
/**
 * 右侧卡片（AI 助手 / 参考）共用一个宽度，切页签时编辑区不重排；按实际 CSS 像素记忆。
 * 没有参考内容时默认 360px；有参考内容时默认占可用宽度的 45%，并给编辑区留足 480px。
 */
export const NOTE_WORKSPACE_SIDE_PANEL_MIN_WIDTH = 360;
export const NOTE_WORKSPACE_SIDE_PANEL_DEFAULT_WIDTH = 360;
export const NOTE_REFERENCE_PANEL_DEFAULT_RATIO = 0.45;
export const NOTE_REFERENCE_MAIN_MIN_WIDTH = 480;
/** 窄于该宽度时放不下编辑区与参考并排，参考退回浮层。 */
export const NOTE_REFERENCE_DOCK_MIN_WIDTH = 960;

export function clampNoteWorkspaceSidebarWidth(width: number) {
  return Math.min(NOTE_WORKSPACE_SIDEBAR_MAX_WIDTH, Math.max(NOTE_WORKSPACE_SIDEBAR_MIN_WIDTH, Math.round(width)));
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

export interface NoteWorkspaceDockedAiInput {
  width: number;
  mobile?: boolean;
  /** 右侧卡片有参考内容时需要与编辑区并排，不能再作为浮层盖住正文。 */
  preferDockedAi: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
  aiMinWidth: number;
  mainMinWidth: number;
}

/**
 * 在基础断点之上处理参考并排：容器足够宽时右侧卡片改为常驻；若页面树与最窄的右侧卡片
 * 仍会把编辑区挤到下限以下，页面树先让位成窄条。没有参考时保持基础断点不变。
 */
export function resolveNoteWorkspaceDockedLayout(input: NoteWorkspaceDockedAiInput): NoteWorkspaceLayoutState {
  const base = resolveNoteWorkspaceLayout(input.width, input.mobile);
  if (!input.preferDockedAi || base.mode === 'mobile' || input.width < NOTE_REFERENCE_DOCK_MIN_WIDTH) return base;
  const sidebarSpace = base.sidebarPresentation === 'dock' && input.sidebarOpen ? input.sidebarWidth : 0;
  const sidebarPresentation =
    sidebarSpace && input.width - sidebarSpace - input.aiMinWidth < input.mainMinWidth ? 'rail' : base.sidebarPresentation;
  return { ...base, sidebarPresentation, aiPresentation: 'dock' };
}

export interface NoteWorkspacePanelWidthInput {
  /** 去掉页面树后，编辑区与右侧卡片共享的宽度。 */
  available: number;
  /** 用户拖动记住的宽度；null 表示使用默认值。 */
  preferred: number | null;
  minWidth: number;
  maxWidth?: number;
  defaultWidth: number;
  /** 大于 0 时默认宽度按可用宽度比例计算。 */
  defaultRatio?: number;
  mainMinWidth: number;
}

/** 窗口变窄时只在展示上收窄，不改写已记住的宽度；最小宽度优先于编辑区下限。 */
export function resolveNoteWorkspacePanelWidth(input: NoteWorkspacePanelWidthInput) {
  const target =
    input.preferred ?? (input.defaultRatio ? input.available * input.defaultRatio : input.defaultWidth);
  const upper = Math.min(input.maxWidth ?? Number.POSITIVE_INFINITY, input.available - input.mainMinWidth);
  return Math.round(Math.max(input.minWidth, Math.min(target, Math.max(input.minWidth, upper))));
}
