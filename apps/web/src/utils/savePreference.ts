import { useUserStore } from '@/store';
import { setLocale } from '@/i18n';

/**
 * 本地应用并持久化用户偏好(主题/语言/视图模式等),不触发后端。
 * 游客换主题/语言/视图时用:偏好本地生效并存 localStorage(本浏览器留存),
 * 但不保存账号专属的默认首页，也不调 saveUserInfo
 * (游客写接口会被 ensureNotVisitor 拦成 'preview' 而误弹注册墙)。
 */
export function applyPreferenceLocally(patch: Record<string, any>): void {
  const user = useUserStore();
  const nextPreferences = { ...user.preferences, ...patch };
  if (!user.id || user.role === 'visitor') {
    delete nextPreferences.homePage;
  }
  user.preferences = nextPreferences;
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
export function applyDisplaySettings(options: { forceStandard?: boolean } = {}): void {
  const user = useUserStore();
  const root = document.documentElement;
  const scale = options.forceStandard ? 1 : (UI_SCALE[(user.preferences as any).uiScale] ?? 1);
  (root.style as any).zoom = scale === 1 ? '' : String(scale);
  /*
   * 给「按视觉坐标定位、又把结果写进布局坐标」的第三方浮层用的反向缩放系数。
   * TinyMCE 的 tooltip/菜单就是这样:它用 getBoundingClientRect(已含 zoom)算好位置写进 style.left,
   * 而 style.left 会再被 <html> 的 zoom 放大一次 —— 缩放开到 1.25 时 tooltip 实测偏出按钮 109px。
   * 容器套一层 1/scale 把这次多余的放大抵消掉(见 common.less 的 .tox-tinymce-aux)。
   * 自研的 BPopover 按实时 rect 定位、与 zoom 自洽,不需要这个。
   */
  root.style.setProperty('--ln-aux-zoom', scale === 1 ? '1' : String(1 / scale));
  // 清掉上一版"字号+密度"分离实现的残留
  root.style.fontSize = '';
  root.removeAttribute('data-density');
}

/**
 * 统一偏好写入口 —— 收口原先散落多套的 theme / lang / noteViewMode / homePage 写逻辑。
 * 顺序:本地立即生效 + localStorage → lang 变化同步 i18n → 游客到此为止
 * (homePage 会被过滤，其余偏好只存本地)→
 * 登录用户以「整对象 preferences JSON」同步后端(权威口径),失败回滚本地。
 * 所有偏好入口(设置中心 / 头像下拉 / 各切换组件)都应只调这一个,避免口径漂移。
 */
export async function updatePreference(patch: Record<string, any>): Promise<void> {
  const user = useUserStore();
  const previous = { ...user.preferences };
  applyPreferenceLocally(patch);
  if (patch.lang) {
    try {
      await setLocale(patch.lang); // 英文词典按需加载完成后再切换，避免短暂显示翻译 key
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
        await setLocale(previous.lang as 'zh-CN' | 'en-US');
        document.documentElement.lang = previous.lang;
      } catch {
        /* ignore */
      }
    }
    console.error('保存偏好失败,已回滚:', err);
    throw err;
  }
}
