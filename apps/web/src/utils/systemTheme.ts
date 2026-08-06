/**
 * 「跟随系统」到底跟随什么。
 *
 * 网页默认用 `prefers-color-scheme` 判断系统深浅色，但在轻笺 Android App 里这个媒体查询不可信：
 * 它只反映宿主应用主题的 `isLightTheme`，跟系统的深色开关无关；旧 WebView 上还会被
 * `setForceDark(FORCE_DARK_OFF)` 直接钉死成 light。实测鸿蒙兼容层里它恒为 light，
 * 于是用户明明开着系统深色、也选了「跟随系统」，界面却一直停在浅色。
 *
 * 所以 App 内改用原生给的信号：启动时从 UA 读（`LightNoteSystemTheme/night|day`，UA 是唯一
 * 在首屏脚本求值前就可用的通道），运行中切换由原生 onConfigurationChanged 推过来。
 * 非 App 环境（手机浏览器、桌面）仍然走 prefers-color-scheme。
 */

import { getAndroidSystemTheme, onAndroidSystemThemeChange } from '@/utils/androidBridge';

export type SystemTheme = 'night' | 'day';

/** 浏览器侧的系统深浅色。无 matchMedia（SSR / 预渲染）时按浅色处理。 */
function mediaQuerySystemTheme(): SystemTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'day';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
}

/**
 * 当前系统主题。App 内优先原生信号，其余环境走媒体查询。
 * 只在用户把主题设为 'system' 时才应该调用它 —— 手动指定深色/浅色的用户不受系统开关影响。
 */
export function resolveSystemTheme(): SystemTheme {
  return getAndroidSystemTheme() || mediaQuerySystemTheme();
}

/**
 * 订阅系统主题变化，返回取消订阅函数。
 * 两个来源都挂上：App 内是原生推送，浏览器里是媒体查询 —— 同一个回调，调用方不必分环境。
 */
export function onSystemThemeChange(listener: (theme: SystemTheme) => void): () => void {
  const disposers: Array<() => void> = [];

  disposers.push(onAndroidSystemThemeChange(listener));

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      // App 内媒体查询不可信，此时以原生信号为准，忽略这一路
      if (getAndroidSystemTheme()) return;
      listener(mq.matches ? 'night' : 'day');
    };
    mq.addEventListener('change', handler);
    disposers.push(() => mq.removeEventListener('change', handler));
  }

  return () => disposers.forEach((dispose) => dispose());
}
