import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { useUserStore } from '@/store';
import { densityCssVariables, type UiDensity } from '@/config/uiDensity';
import {
  updateNativeNotificationStatus,
  updateNativeNotificationOnline,
} from '@/composables/useNativeNotificationStatus';
import type { NativeNotificationState } from '@/utils/nativeNotificationSync';
import NativeNotificationStatus from '@/components/notification/NativeNotificationStatus.vue';
import SettingsSectionCard from '@/view/settings/components/SettingsSectionCard.vue';
import SettingsFieldRow from '@/view/settings/components/SettingsFieldRow.vue';
import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const lang = params.get('lang') === 'en' ? 'en-US' : 'zh-CN';
const messages = lang === 'en-US' ? en : zh;
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
for (const [key, value] of Object.entries(
  densityCssVariables(mobile ? 'standard' : ((params.get('density') || 'standard') as UiDensity)),
))
  document.documentElement.style.setProperty(key, value);
document.body.style.cssText = 'display:block;margin:0;background:var(--background-color);color:var(--text-color)';
// Isolated presentation fixture: never initialize an SDK, transmit a token or call a real API.
if (!params.has('browser')) window.LightNoteAndroid = { postMessage: () => {} };
const states: NativeNotificationState[] = [
  'checking',
  'connecting',
  'connected',
  'disabled',
  'retrying',
  'unavailable',
];
const state = params.get('state') as NativeNotificationState;
updateNativeNotificationStatus(states.includes(state) ? state : 'connected', 'fixture-user');
updateNativeNotificationOnline(!params.has('offline'));
window.addEventListener('light-note:native-notification-retry', () =>
  updateNativeNotificationStatus('connected', 'fixture-user'),
);
const pinia = createPinia();
const app = createApp({
  render: () =>
    h(
      'main',
      {
        style: 'max-width:var(--ui-layout-640,640px);margin:auto;padding:var(--ui-space-16,16px);box-sizing:border-box',
      },
      [
        h(
          SettingsSectionCard,
          { title: messages.settingsRefine.channels, description: messages.settingsRefine.channelsDesc },
          () => [
            h(
              SettingsFieldRow,
              { label: messages.settings.notificationsInApp, description: messages.settings.notificationsInAppDesc },
              { default: () => h(BSwitch, { checked: true, controlled: true }) },
            ),
            h(NativeNotificationStatus),
          ],
        ),
      ],
    ),
});
app.use(pinia).use(createI18n({ legacy: false, locale: lang, messages: { 'zh-CN': zh, 'en-US': en } }));
useUserStore(pinia).$patch({
  id: 'fixture-user',
  role: 'user',
  preferences: { notificationsInApp: !params.has('off') },
});
app.mount('#app');
