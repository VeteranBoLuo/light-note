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

import { ref } from 'vue';
import { getAndroidSystemTheme, onAndroidSystemThemeChange } from '@/utils/androidBridge';

export type SystemTheme = 'night' | 'day';

/** 浏览器侧的系统深浅色。无 matchMedia（SSR / 预渲染）时按浅色处理。 */
function mediaQuerySystemTheme(): SystemTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'day';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
}

/**
 * 当前系统主题，**必须是响应式的**。
 *
 * 这里踩过一个很隐蔽的坑：useUser 的 currentTheme 是 Pinia getter（本质是 computed，会缓存），
 * 它只追踪读到的响应式依赖。若本值是个普通模块级变量，getter 求值一次后就再也不会失效 ——
 * 因为 preferences.theme 始终是 'system' 没变过。表现为「系统主题切换只有第一次生效，
 * 之后无论原生推多少次都不动」，而且怎么查原生侧都查不出问题，因为原生一直在正常推送。
 *
 * 值的来源：App 内是原生推送（UA 只提供启动时的初值，它是快照、永不更新），
 * 其余环境是 prefers-color-scheme。
 */
const systemTheme = ref<SystemTheme>('day');
let initialized = false;

/** 首次读取时才初始化：模块加载时机可能早于 DOM/navigator 就绪（预渲染）。 */
function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  systemTheme.value = getAndroidSystemTheme() || mediaQuerySystemTheme();

  // 原生推送：这一路要在模块内部常驻，不能只挂在订阅者身上 —— 即使没有任何组件订阅，
  // resolveSystemTheme() 也必须能读到最新值
  onAndroidSystemThemeChange((theme) => {
    systemTheme.value = theme;
  });

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      // App 内媒体查询不可信（只反映宿主主题的 isLightTheme），以原生推送为准
      if (getAndroidSystemTheme()) return;
      systemTheme.value = mq.matches ? 'night' : 'day';
    });
  }
}

/** 仅测试用：模块级状态不随用例自动复位。 */
export function resetSystemThemeForTest() {
  initialized = false;
  systemTheme.value = 'day';
}

/**
 * 当前系统主题。
 * 只在用户把主题设为 'system' 时才应该调用它 —— 手动指定深色/浅色的用户不受系统开关影响。
 */
export function resolveSystemTheme(): SystemTheme {
  ensureInitialized();
  return systemTheme.value;
}

/**
 * 订阅系统主题变化，返回取消订阅函数。
 *
 * 数据源的维护统一在 ensureInitialized 里，这里只负责把变化通知出去：
 * 两条来源（原生推送 / 媒体查询）各挂一次，调用方不必分环境。
 */
export function onSystemThemeChange(listener: (theme: SystemTheme) => void): () => void {
  ensureInitialized();
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
