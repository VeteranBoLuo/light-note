import { computed, createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import ChatInputSection from '@/components/aiAssistant/ChatInputSection.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import useAiAssistantStore, { type AiAssistantIdentity } from '@/store/aiAssistant';
import {
  AI_ASSISTANT_OPEN_EVENT,
  normalizeAiAssistantLaunchPayload,
  openAiAssistant,
  type AiAssistantLaunchPayload,
} from '@/utils/aiEntry';
import zhCN from '@/i18n/locales/zh-CN';

const identity: AiAssistantIdentity = {
  actorUserId: 'synthetic-e2e-user',
  subjectUserId: 'synthetic-e2e-user',
  adminContextMode: 'self',
  adminContextId: '',
};

const pinia = createPinia();
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { render: () => null } }],
});
await router.push('/');

const app = createApp({
  setup() {
    const store = useAiAssistantStore();
    store.switchConversation(identity, '你好');
    const input = ref('');
    const contexts = ref<Array<{ type: 'bookmark'; id: string; title: string }>>([]);
    const sendCount = ref(0);
    const launch = ref<AiAssistantLaunchPayload | null>(null);
    const restoredConfirmation = computed(() =>
      store.messages.flatMap((message) => message.confirmations || []).find((item) => item.toolName === 'create_note'),
    );

    window.addEventListener(AI_ASSISTANT_OPEN_EVENT, (event) => {
      launch.value = normalizeAiAssistantLaunchPayload((event as CustomEvent).detail);
      input.value = '分析这个书签的内容，生成一篇笔记';
    });

    function seedConfirmation() {
      const expiresAt = new Date(Date.now() + 120_000).toISOString();
      store.sessionId = 'synthetic-e2e-session';
      store.messages = [
        {
          id: 'synthetic-user-pending',
          role: 'user',
          content: '生成一篇笔记',
          timestamp: new Date(),
          transient: true,
          transientGroupId: 'synthetic-group',
        },
        {
          id: 'synthetic-assistant-pending',
          role: 'assistant',
          content: '请确认创建笔记',
          timestamp: new Date(),
          transient: true,
          transientGroupId: 'synthetic-group',
          pendingConfirmationIds: ['synthetic-confirmation'],
          confirmations: [
            {
              id: 'synthetic-confirmation',
              token: 'synthetic-token',
              sessionId: 'synthetic-e2e-session',
              toolName: 'create_note',
              args: { title: '合成测试笔记' },
              expiresIn: 120,
              expiresAt,
            },
          ],
        },
      ];
      store.persistCurrentConversation();
    }

    function launchBookmark() {
      openAiAssistant({
        contextRefs: [{ type: 'bookmark', id: 'synthetic-bookmark-1', title: '合成书签' }],
        suggestedIntent: 'create_note',
        surface: 'bookmark_manage',
      });
    }

    return () =>
      h('main', { 'data-testid': 'ai-critical-harness' }, [
        h('section', { 'data-testid': 'mention-flow' }, [
          h(ChatInputSection, {
            modelValue: input.value,
            'onUpdate:modelValue': (value: string) => (input.value = value),
            isLoading: false,
            quota: null,
            showTranslation: false,
            enableTranslation: false,
            translationConfig: { source: 'auto', target: 'zh-CN' },
            isMobile: false,
            sendFn: () => (sendCount.value += 1),
            stopFn: () => undefined,
            contexts: contexts.value,
            'onUpdate:contexts': (value: typeof contexts.value) => (contexts.value = value),
            attachments: [],
            prepareAttachmentActionFn: async () => undefined,
          }),
          h('output', { 'data-testid': 'send-count' }, String(sendCount.value)),
          h('output', { 'data-testid': 'selected-context' }, contexts.value.map((item) => item.title).join(',')),
        ]),
        h('section', { 'data-testid': 'confirmation-flow' }, [
          h(BButton, { 'data-testid': 'seed-confirmation', onClick: seedConfirmation }, () => '写入确认卡'),
          restoredConfirmation.value
            ? h('article', { 'data-testid': 'restored-confirmation' }, restoredConfirmation.value.args?.title as string)
            : null,
        ]),
        h('section', { 'data-testid': 'bookmark-launch-flow' }, [
          h(BButton, { 'data-testid': 'launch-bookmark', onClick: launchBookmark }, () => '书签生成笔记'),
          h('output', { 'data-testid': 'launch-context-id' }, launch.value?.contextRefs?.[0]?.id || ''),
          h('output', { 'data-testid': 'launch-intent' }, launch.value?.suggestedIntent || ''),
          h('output', { 'data-testid': 'launch-prompt' }, input.value),
        ]),
      ]);
  },
});

app.use(pinia);
app.use(router);
app.use(createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
app.directive('click-log', () => undefined);
app.mount('#app');
