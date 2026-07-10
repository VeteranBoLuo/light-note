import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
import { getAdminLoginPreviewPreferences, isAdminLoginPreview } from '@/utils/authStorage.ts';

// 游客/首次访问且无偏好时,按浏览器语言定默认——老外看英文而非永远中文(判断首选语言是否 zh 开头)
function detectBrowserLang(): 'zh-CN' | 'en-US' {
  if (typeof navigator === 'undefined') return 'zh-CN';
  const lang = (navigator.language || (navigator.languages && navigator.languages[0]) || '').toLowerCase();
  return lang.startsWith('zh') ? 'zh-CN' : 'en-US';
}

// 创建 i18n 实例
const i18n = createI18n({
  legacy: false, // 使用组合式 API
  // 默认语言:已设偏好(登录用户/切换过的游客)优先;否则按浏览器语言(zh→中文,其余→英文)
  locale:
    getAdminLoginPreviewPreferences().lang ||
    JSON.parse(localStorage.getItem('preferences') || '{}').lang ||
    detectBrowserLang(),
  fallbackLocale: 'zh-CN', // 回退语言
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

// 切换语言的方法
export function setLocale(lang: 'zh-CN' | 'en-US') {
  i18n.global.locale.value = lang;
  if (isAdminLoginPreview()) {
    return;
  }
  localStorage.setItem(
    'preferences',
    JSON.stringify({
      ...JSON.parse(localStorage.getItem('preferences') || '{}'),
      lang: lang,
    }),
  );
}

// 导出 i18n 实例
export default i18n;
