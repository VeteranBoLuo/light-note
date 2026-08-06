import { describe, expect, it } from 'vitest';
import { resolveNoteWorkspaceLayout } from './noteWorkspaceLayout';

describe('resolveNoteWorkspaceLayout', () => {
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
});
