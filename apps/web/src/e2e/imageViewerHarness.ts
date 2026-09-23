import { applyUiDensity } from '@/composables/useUiDensity';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { bookmarkStore } from '@/store';
import { resolveViewportDeviceType } from '@/config/responsive';
import { createI18n } from 'vue-i18n';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import ImageViewerHarness from './ImageViewerHarness.vue';

const params = new URLSearchParams(window.location.search);
const mobile = resolveViewportDeviceType(innerWidth) !== 'desktop';
(window as any).setDensity = (value: string) => applyUiDensity(value, mobile);
(window as any).setDensity(params.get('density'));
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const reduceMotion = params.get('motion') === 'reduce';

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', window.innerWidth <= 767);
document.documentElement.classList.toggle('disable-animations', reduceMotion);

const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});

const pinia = createPinia();
const app = createApp(ImageViewerHarness).use(pinia).use(i18n);
bookmarkStore(pinia).$patch({ screenWidth: innerWidth });
app.mount('#app');
