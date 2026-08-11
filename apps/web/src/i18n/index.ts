import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import { getAdminLoginPreviewPreferences, isAdminLoginPreview } from '@/utils/authStorage.ts';

export type AppLocale = 'zh-CN' | 'en-US';

// 游客/首次访问且无偏好时,按浏览器语言定默认——老外看英文而非永远中文(判断首选语言是否 zh 开头)
function detectBrowserLang(): AppLocale {
  if (typeof navigator === 'undefined') return 'zh-CN';
  const lang = (navigator.language || (navigator.languages && navigator.languages[0]) || '').toLowerCase();
  return lang.startsWith('zh') ? 'zh-CN' : 'en-US';
}

function readStoredLocale(): AppLocale | null {
  try {
    const locale = JSON.parse(localStorage.getItem('preferences') || '{}')?.lang;
    return locale === 'en-US' || locale === 'zh-CN' ? locale : null;
  } catch {
    // 隐私模式、存储损坏都不能阻断应用启动。
    return null;
  }
}

const initialLocale =
  (getAdminLoginPreviewPreferences().lang as AppLocale | undefined) || readStoredLocale() || detectBrowserLang();

// 创建 i18n 实例
const i18n = createI18n({
  legacy: false, // 使用组合式 API
  // 默认语言:已设偏好(登录用户/切换过的游客)优先;否则按浏览器语言(zh→中文,其余→英文)
  locale: initialLocale,
  fallbackLocale: 'zh-CN', // 回退语言
  messages: {
    'zh-CN': zhCN,
  },
});

let englishLocaleRequest: Promise<void> | null = null;

function applyLocale(lang: AppLocale): void {
  // createI18n 会依据首批 messages 把 locale 窄化为 zh-CN；运行时仍允许按需注册后的 en-US。
  (i18n.global.locale.value as string) = lang;
}

function ensureLocaleMessages(lang: AppLocale): Promise<void> {
  if (lang === 'zh-CN' || Object.keys(i18n.global.getLocaleMessage(lang)).length > 0) {
    return Promise.resolve();
  }
  if (!englishLocaleRequest) {
    // 英文词典比中文词典还大，绝大多数 App 用户却不会使用。按需加载可让中文首屏
    // 少解析约 26 万字节源码，同时语言切换仍然只下载一次并由浏览器长期缓存。
    englishLocaleRequest = import('@/i18n/locales/en-US')
      .then(({ default: messages }) => {
        i18n.global.setLocaleMessage('en-US', messages);
      })
      .catch((error) => {
        englishLocaleRequest = null;
        throw error;
      });
  }
  return englishLocaleRequest;
}

/** 首次挂载前准备当前词典；中文无额外请求，英文用户才等待英文分包。 */
export async function prepareInitialLocale(): Promise<void> {
  try {
    await ensureLocaleMessages(initialLocale);
  } catch {
    applyLocale('zh-CN');
  }
}

// 切换语言的方法
export function setLocale(lang: AppLocale): Promise<void> {
  if (isAdminLoginPreview()) {
    return ensureLocaleMessages(lang).then(() => {
      applyLocale(lang);
    });
  }
  try {
    localStorage.setItem(
      'preferences',
      JSON.stringify({
        ...JSON.parse(localStorage.getItem('preferences') || '{}'),
        lang,
      }),
    );
  } catch {
    // 存储不可用时仍允许本次会话切换语言。
  }
  return ensureLocaleMessages(lang).then(() => {
    applyLocale(lang);
  });
}

// 导出 i18n 实例
export default i18n;
