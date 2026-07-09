import { useUserStore } from '@/store';
import { setLocale } from '@/i18n';

/**
 * 本地应用并持久化用户偏好(主题/语言/视图模式等),不触发后端。
 * 游客换主题/语言/视图时用:偏好本地生效并存 localStorage(本浏览器留存),
 * 但不调 saveUserInfo(游客写接口会被 ensureNotVisitor 拦成 'preview' 而误弹注册墙)。
 */
export function applyPreferenceLocally(patch: Record<string, any>): void {
  const user = useUserStore();
  user.preferences = { ...user.preferences, ...patch };
  try {
    localStorage.setItem('preferences', JSON.stringify(user.preferences));
  } catch {
    /* 隐私模式下 localStorage 不可用,忽略 */
  }
}

/** 是否游客(未登录或 visitor 角色)。用于决定偏好是否同步到服务器。 */
export function isGuestUser(): boolean {
  const user = useUserStore();
  return !user.id || user.role === 'visitor';
}

// 界面缩放:把"字号+密度"合并为单一"界面风格"(小/标准/大),用 <html> zoom 整体等比缩放
// (px 项目下 font-size/行距生效面太窄、几乎看不出;zoom 才直观)。
// 浮层(通知中心/个人中心)一律改用自研 BPopover——它按实时 getBoundingClientRect 定位、与 zoom 自洽,
// 不再出现之前 a-popover 在缩放下错位的问题。
const UI_SCALE: Record<string, number> = { small: 0.9, medium: 1, large: 1.1 };
export function applyDisplaySettings(): void {
  const user = useUserStore();
  const root = document.documentElement;
  const scale = UI_SCALE[(user.preferences as any).uiScale] ?? 1;
  (root.style as any).zoom = scale === 1 ? '' : String(scale);
  // 清掉上一版"字号+密度"分离实现的残留
  root.style.fontSize = '';
  root.removeAttribute('data-density');
}

/**
 * 统一偏好写入口 —— 收口原先散落多套的 theme / lang / noteViewMode / homePage 写逻辑。
 * 顺序:本地立即生效 + localStorage → lang 变化同步 i18n → 游客到此为止(只本地)→
 * 登录用户以「整对象 preferences JSON」同步后端(权威口径),失败回滚本地。
 * 所有偏好入口(设置中心 / 头像下拉 / 各切换组件)都应只调这一个,避免口径漂移。
 */
export async function updatePreference(patch: Record<string, any>): Promise<void> {
  const user = useUserStore();
  const previous = { ...user.preferences };
  applyPreferenceLocally(patch);
  if (patch.lang) {
    try {
      setLocale(patch.lang); // 即时切换 i18n(legacy:false,响应式生效),无需刷新页面
      document.documentElement.lang = patch.lang; // 同步 <html lang> 供 a11y / CSS :lang 使用
    } catch {
      /* i18n 尚未就绪时忽略 */
    }
  }
  if (isGuestUser()) return; // 游客本地化即可,不调后端、不触发注册墙
  try {
    // 动态引入:userApi 经请求拦截器牵入 BMessage(.vue),放顶层会拖累本文件的纯逻辑单测转换
    const { default: userApi } = await import('@/api/userApi.ts');
    await userApi.updateUserInfo({ id: user.id, preferences: JSON.stringify(user.preferences) });
  } catch (err) {
    // 后端失败:回滚本地,保持前后端一致
    applyPreferenceLocally(previous);
    if (patch.lang && previous.lang) {
      try {
        setLocale(previous.lang as 'zh-CN' | 'en-US');
        document.documentElement.lang = previous.lang;
      } catch {
        /* ignore */
      }
    }
    console.error('保存偏好失败,已回滚:', err);
    throw err;
  }
}
