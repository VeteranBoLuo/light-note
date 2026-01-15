import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
// 创建 i18n 实例
const i18n = createI18n({
  legacy: false, // 使用组合式 API
  locale: JSON.parse(localStorage.getItem('preferences') || '{}').lang || 'zh-CN', // 默认语言
  fallbackLocale: 'zh-CN', // 回退语言
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

// 切换语言的方法
export function setLocale(lang: 'zh-CN' | 'en-US') {
  i18n.global.locale.value = lang;
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
