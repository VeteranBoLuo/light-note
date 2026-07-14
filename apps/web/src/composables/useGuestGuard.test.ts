import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const apiBasePost = vi.fn().mockResolvedValue({});
vi.mock('@/http/request', () => ({ apiBasePost: (...a: any[]) => apiBasePost(...a) }));
const showGuestNudge = vi.fn();
vi.mock('@/composables/guestNudge', () => ({ showGuestNudge: (...a: any[]) => showGuestNudge(...a) }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
// 可变的登录态,供各用例切换游客/登录
const userState = { id: '', role: 'visitor', visitorWorkspace: false };
vi.mock('@/store', () => ({
  useUserStore: () => userState,
  bookmarkStore: () => ({ openAuthModal: vi.fn() }),
}));

const { blockGuestWrite, recordWallHit } = await import('@/composables/useGuestGuard');

describe('blockGuestWrite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiBasePost.mockClear();
    showGuestNudge.mockClear();
    userState.id = '';
    userState.role = 'visitor';
    userState.visitorWorkspace = false;
  });
  afterEach(() => {
    vi.runAllTimers(); // 释放 wall_hit / 引导的 1.5s 锁,避免污染下一个用例
    vi.useRealTimers();
  });

  it('游客:记 wall_hit + 弹注册引导,返回 true', () => {
    const blocked = blockGuestWrite('add-bookmark');
    expect(blocked).toBe(true);
    expect(showGuestNudge).toHaveBeenCalledTimes(1);
    expect(apiBasePost).toHaveBeenCalledWith(
      '/api/common/recordConversion',
      expect.objectContaining({ event: 'wall_hit', source: 'add-bookmark' }),
    );
  });

  it('按 source 出不同场景文案 + 归因 source 透传到 nudge', () => {
    blockGuestWrite('add-bookmark');
    const [bookmarkMsg, bookmarkSrc] = showGuestNudge.mock.calls[0];
    showGuestNudge.mockClear();
    vi.advanceTimersByTime(1600); // 释放 showPreviewGuide 的 1.5s 防抖锁
    blockGuestWrite('upload-file');
    const [cloudMsg, cloudSrc] = showGuestNudge.mock.calls[0];
    showGuestNudge.mockClear();
    vi.advanceTimersByTime(1600);
    blockGuestWrite('client-guard');
    const [genericMsg, genericSrc] = showGuestNudge.mock.calls[0];
    // 文案按场景不同(书签/云空间/通用两两不同)
    expect(bookmarkMsg).toBeTruthy();
    expect(bookmarkMsg).not.toBe(cloudMsg);
    expect(bookmarkMsg).not.toBe(genericMsg);
    // 归因 source 透传:撞墙操作 → 渠道 source(都在白名单内),未命中回退 preview_guide,保证 CTA 打开注册同源
    expect(bookmarkSrc).toBe('write_add_bookmark');
    expect(cloudSrc).toBe('write_upload_file');
    expect(genericSrc).toBe('preview_guide');
  });

  it('已登录用户:放行,返回 false,不弹不记', () => {
    userState.id = 'u1';
    userState.role = 'admin';
    const blocked = blockGuestWrite('add-bookmark');
    expect(blocked).toBe(false);
    expect(showGuestNudge).not.toHaveBeenCalled();
    expect(apiBasePost).not.toHaveBeenCalled();
  });

  it('游客维护工作区:放行书签/笔记/标签写操作', () => {
    userState.id = 'visitor-1';
    userState.role = 'visitor';
    userState.visitorWorkspace = true;
    expect(blockGuestWrite('save-note')).toBe(false);
    expect(showGuestNudge).not.toHaveBeenCalled();
    expect(apiBasePost).not.toHaveBeenCalled();
  });

  it('游客维护工作区:继续拦截云空间等范围外操作且不记录转化', () => {
    userState.id = 'visitor-1';
    userState.role = 'visitor';
    userState.visitorWorkspace = true;
    expect(blockGuestWrite('upload-file')).toBe(true);
    expect(showGuestNudge).not.toHaveBeenCalled();
    expect(apiBasePost).not.toHaveBeenCalled();
  });
});

describe('recordWallHit 节流', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiBasePost.mockClear();
  });
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('1.5s 内重复调用只上报一次', () => {
    recordWallHit('a');
    recordWallHit('a');
    recordWallHit('a');
    expect(apiBasePost).toHaveBeenCalledTimes(1);
  });

  it('超过 1.5s 后可再次上报', () => {
    recordWallHit('a');
    expect(apiBasePost).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1600);
    recordWallHit('a');
    expect(apiBasePost).toHaveBeenCalledTimes(2);
  });
});
