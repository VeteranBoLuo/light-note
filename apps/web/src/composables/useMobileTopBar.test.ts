import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { getMobilePageBack, handleMobilePageBack, registerMobileTopBarBinding } from './useMobileTopBar';

describe('移动页面系统返回', () => {
  it('带底栏的二级页也执行页面动作，并消费原生返回', () => {
    const back = vi.fn();
    const unregister = registerMobileTopBarBinding(['organizeCenter'], { onBack: back });
    try {
      const event = new Event('light-note-system-back', { cancelable: true });
      expect(handleMobilePageBack('organizeCenter', event)).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(back).toHaveBeenCalledOnce();
      expect(handleMobilePageBack('organizeCenter', event)).toBe(false);
      expect(back).toHaveBeenCalledOnce();
      expect(getMobilePageBack('home')).toBeNull();
    } finally {
      unregister();
    }
  });

  it('动态批量态退出后恢复一级入口，且不使用其他缓存页面动作', () => {
    const batch = ref(true);
    const back = vi.fn(() => {
      batch.value = false;
    });
    const unregister = registerMobileTopBarBinding(['inbox'], { onBack: back, canGoBack: () => batch.value });
    try {
      expect(getMobilePageBack('inbox')).toBe(back);
      handleMobilePageBack('inbox', new Event('light-note-system-back', { cancelable: true }));
      expect(getMobilePageBack('inbox')).toBeNull();
      expect(getMobilePageBack('searchCenter')).toBeNull();
    } finally {
      unregister();
    }
    expect(getMobilePageBack('inbox')).toBeNull();
  });
});

// 执行 Android 实际注入的脚本，验证返回优先级，而非匹配源码文字。
const nativeSource = readFileSync(resolve(process.cwd(), '../android/app/src/main/java/top/boluo66/lightnote/MainActivity.java'), 'utf8');
const nativeScript = JSON.parse(nativeSource.split('\n').find((line) => line.includes('light-note-system-back'))!.trim().replace(/,$/, ''));
const nativeBack = () => new Function('return ' + nativeScript)();

it('原生返回先关闭 history 浮层和菜单，未消费时才回退到页面或首页', () => {
  const pageBack = vi.fn((event: Event) => event.preventDefault());
  const closeMenu = vi.fn((event: Event) => event.preventDefault());
  window.addEventListener('light-note-system-back', pageBack);
  try {
    window.history.replaceState({ __lnMobileOverlayId: 'overlay' }, '');
    expect(nativeBack()).toBe('overlay');
    expect(pageBack).not.toHaveBeenCalled();
    window.history.replaceState({}, '');
    document.addEventListener('keydown', closeMenu);
    expect(nativeBack()).toBe('handled');
    expect(closeMenu).toHaveBeenCalledOnce();
    expect(pageBack).not.toHaveBeenCalled();
    document.removeEventListener('keydown', closeMenu);
    expect(nativeBack()).toBe('handled');
    expect(pageBack).toHaveBeenCalledOnce();
    window.removeEventListener('light-note-system-back', pageBack);
    document.documentElement.dataset.lightNotePrimaryRoot = 'true';
    expect(nativeBack()).toBe('root');
    document.documentElement.dataset.lightNotePrimaryRoot = 'false';
    expect(nativeBack()).toBe('page');
  } finally {
    document.removeEventListener('keydown', closeMenu);
    window.removeEventListener('light-note-system-back', pageBack);
    window.history.replaceState({}, '');
    delete document.documentElement.dataset.lightNotePrimaryRoot;
  }
});
