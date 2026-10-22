import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { useUserStore } from '@/store';
import { densityCssVariables, type UiDensity } from '@/config/uiDensity';
import {
  updateNativeNotificationStatus,
  updateNativeNotificationOnline,
  updateNativeNotificationDevice,
} from '@/composables/useNativeNotificationStatus';
import type { NativeNotificationState } from '@/utils/nativeNotificationSync';
import NativeNotificationStatus from '@/components/notification/NativeNotificationStatus.vue';
import SettingsSectionCard from '@/view/settings/components/SettingsSectionCard.vue';
import SettingsFieldRow from '@/view/settings/components/SettingsFieldRow.vue';
import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
import NotificationCenterPanel from '@/components/notification/NotificationCenterPanel.vue';
import type { NotificationItem } from '@/composables/useNotification';
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
document.getElementById('app')!.style.cssText = 'width:100%;max-width:none;margin:0';
// Isolated fixture: never initialize an SDK, transmit a token or call a real API.
const settingsOpen = ref(false);
if (!params.has('browser'))
  window.LightNoteAndroid = {
    postMessage: (raw) => {
      const request = JSON.parse(raw);
      if (request.action !== 'settings') return;
      settingsOpen.value = !params.has('settingsFail');
      window.__lightNoteNativeNotificationResult?.({ token: request.token, ok: settingsOpen.value });
    },
  };
const states: NativeNotificationState[] = [
  'checking',
  'connecting',
  'connected',
  'disabled',
  'retrying',
  'unavailable',
  'deviceLimit',
  'accountRequired',
  'serviceDisabled',
  'storageUnavailable',
];
const state = params.get('state') as NativeNotificationState;
updateNativeNotificationStatus(states.includes(state) ? state : 'connected', 'fixture-user');
updateNativeNotificationOnline(!params.has('offline'));
updateNativeNotificationDevice(
  params.has('oldShell')
    ? null
    : {
        systemEnabled: params.has('systemOn') || state !== 'disabled',
        settingsAvailable: true,
        pushSupport:
          params.get('support') === 'unsupported'
            ? 'unsupported'
            : params.get('support') === 'unknown'
              ? 'unknown'
              : 'supported',
      },
  'fixture-user',
);
function returnFromSettings(enabled: boolean) {
  updateNativeNotificationDevice({ systemEnabled: enabled, settingsAvailable: true }, 'fixture-user');
  updateNativeNotificationStatus(enabled ? 'connecting' : 'disabled', 'fixture-user');
  settingsOpen.value = false;
}
const sampleItems: NotificationItem[] = [
  {
    id: 'fixture-todo',
    type: 'todo_reminder',
    title: lang === 'zh-CN' ? '待办提醒' : 'Task reminder',
    content: lang === 'zh-CN' ? '整理本周笔记' : 'Organize this week’s notes',
    link: null,
    meta: { todoId: 'fixture-todo' },
    isRead: 0,
    createTime: '',
  },
  {
    id: 'fixture-system',
    type: 'system',
    title: lang === 'zh-CN' ? '轻笺更新' : 'Light Note update',
    content: lang === 'zh-CN' ? '查看最新功能与使用提示' : 'Explore the latest features and tips',
    link: null,
    meta: {},
    isRead: 1,
    createTime: '',
  },
];
const pinia = createPinia();
const app = createApp({
  render: () =>
    h(
      'main',
      {
        style: {
          maxWidth: '100%',
          width: mobile ? '100%' : 'var(--ui-layout-960,960px)',
          margin: 'auto',
          boxSizing: 'border-box',
          padding: params.get('view') === 'center' ? '0' : 'var(--ui-space-16,16px)',
        },
      },
      [
        params.get('view') === 'center'
          ? h(
              NotificationCenterPanel,
              {
                mobile,
                desktopPage: !mobile,
                items: sampleItems,
                groups: [{ key: 'today', label: lang === 'zh-CN' ? '今天' : 'Today', items: sampleItems }],
                tabs: [
                  { value: 'all', label: messages.notification.tabAll },
                  { value: 'todo', label: messages.notification.tabTodo },
                  { value: 'system', label: messages.notification.tabSystem },
                ],
                activeTab: 'all',
                unreadTotal: 1,
                total: sampleItems.length,
                loading: false,
                completingTodoId: '',
                tabUnread: () => 0,
                renderTitle: (item: NotificationItem) => item.title,
                renderContent: (item: NotificationItem) => item.content || '',
                formatTime: () => (lang === 'zh-CN' ? '2 小时前' : '2 hours ago'),
                todoId: (item: NotificationItem) => String(item.meta?.todoId || ''),
                todoActionState: () => 'pending' as const,
              },
              { 'browser-push-prompt': () => h(NativeNotificationStatus) },
            )
          : h(
              SettingsSectionCard,
              { title: messages.settingsRefine.channels, description: messages.settingsRefine.channelsDesc },
              () => [
                h(
                  SettingsFieldRow,
                  {
                    label: messages.settings.notificationsInApp,
                    description: messages.settings.notificationsInAppDesc,
                  },
                  { default: () => h(BSwitch, { checked: !params.has('off'), controlled: true }) },
                ),
                h(NativeNotificationStatus),
              ],
            ),
        h(
          BModal,
          {
            visible: settingsOpen.value,
            'onUpdate:visible': (value: boolean) => {
              settingsOpen.value = value;
            },
            title: '系统通知设置（测试替身）',
            showFooter: false,
          },
          () => [
            h('p', '此处仅验证返回后的状态展示，真实设置跳转须在手机上验收。'),
            h(BButton, { onClick: () => returnFromSettings(true) }, () => '允许通知并返回'),
            h(BButton, { onClick: () => returnFromSettings(false) }, () => '关闭通知并返回'),
          ],
        ),
      ],
    ),
});
app.use(pinia).use(createI18n({ legacy: false, locale: lang, messages: { 'zh-CN': zh, 'en-US': en } }));
app.directive('click-log', {});
useUserStore(pinia).$patch({
  id: 'fixture-user',
  role: 'user',
  preferences: { notificationsInApp: !params.has('off') },
});
app.mount('#app');
