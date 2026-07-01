import { describe, it, expect, vi, beforeEach } from 'vitest';

// 可变登录态,模拟游客 / 登录用户
const userState: any = { id: '', role: 'visitor', preferences: { theme: 'day', lang: 'zh-CN' } };
vi.mock('@/store', () => ({ useUserStore: () => userState }));

const { applyPreferenceLocally, isGuestUser } = await import('@/utils/savePreference');

describe('applyPreferenceLocally', () => {
  beforeEach(() => {
    userState.id = '';
    userState.role = 'visitor';
    userState.preferences = { theme: 'day', lang: 'zh-CN' };
    localStorage.clear();
  });

  it('把 patch 合并进 preferences,并写入 localStorage', () => {
    applyPreferenceLocally({ theme: 'night' });
    expect(userState.preferences.theme).toBe('night');
    expect(userState.preferences.lang).toBe('zh-CN'); // 其它字段保留
    const stored = JSON.parse(localStorage.getItem('preferences') || '{}');
    expect(stored.theme).toBe('night');
    expect(stored.lang).toBe('zh-CN');
  });

  it('多字段可多次合并', () => {
    applyPreferenceLocally({ lang: 'en-US' });
    applyPreferenceLocally({ noteViewMode: 'card' });
    expect(userState.preferences.lang).toBe('en-US');
    expect(userState.preferences.noteViewMode).toBe('card');
    expect(userState.preferences.theme).toBe('day');
  });
});

describe('isGuestUser', () => {
  beforeEach(() => {
    userState.id = '';
    userState.role = 'visitor';
  });

  it('visitor 角色 → 游客', () => {
    userState.id = 'visitor-id';
    userState.role = 'visitor';
    expect(isGuestUser()).toBe(true);
  });

  it('无 id → 游客', () => {
    userState.id = '';
    userState.role = 'admin';
    expect(isGuestUser()).toBe(true);
  });

  it('已登录(有 id 且非 visitor)→ 非游客', () => {
    userState.id = 'u1';
    userState.role = 'admin';
    expect(isGuestUser()).toBe(false);
  });
});
