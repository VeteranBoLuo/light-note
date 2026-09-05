import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import CommunityChatAttachmentsHarness from './CommunityChatAttachmentsHarness.vue';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const mobileProfile = params.get('renderProfile') === 'mobile' || window.innerWidth <= 767;

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobileProfile);
document.body.dataset.visualState = `community-chat-attachments-${theme}-${mobileProfile ? 'mobile' : 'desktop'}`;

createApp(CommunityChatAttachmentsHarness)
  .use(
    createI18n({
      legacy: false,
      locale,
      fallbackLocale: 'zh-CN',
      messages: { 'zh-CN': zhCN, 'en-US': enUS },
    }),
  )
  .mount('#app');
