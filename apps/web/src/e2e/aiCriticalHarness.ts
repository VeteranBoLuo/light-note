import { computed, createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n, useI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import '@/assets/css/index.less';
import ChatInputSection from '@/components/aiAssistant/ChatInputSection.vue';
import MainQuestionPrompt from '@/components/aiAssistant/MainQuestionPrompt.vue';
import AiToolConfirmationCard from '@/components/aiAssistant/AiToolConfirmationCard.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import useAiAssistantStore, { type AiAssistantIdentity } from '@/store/aiAssistant';
import {
  AI_ASSISTANT_OPEN_EVENT,
  normalizeAiAssistantLaunchPayload,
  openAiAssistant,
  type AiAssistantLaunchPayload,
} from '@/utils/aiEntry';
import zhCN from '@/i18n/locales/zh-CN';
import {
  buildAiCapabilityModuleOptions,
  normalizeAiCapabilityModule,
  type AiCapabilityModule,
} from '@/types/aiCapabilityScope';
import type { AiAttachment, AiAttachmentStatus } from '@/api/aiAttachmentApi';
import {
  buildAiCapabilityPolicyOptions,
  normalizeAiCapabilityPolicyProfile,
  type AiCapabilityPolicyProfile,
} from '@/types/aiCapabilityPolicy';
import type { AiToolConfirmation } from '@/types/aiAgent';
import { applyDocumentTheme } from '@/utils/theme';

const harnessParams = new URLSearchParams(window.location.search);
const harnessTheme = harnessParams.get('theme') === 'night' ? 'night' : 'day';
const harnessMobile = harnessParams.get('mobile') === '1';
const harnessInitialPolicy = normalizeAiCapabilityPolicyProfile(harnessParams.get('policy'));
const harnessInitialModule = normalizeAiCapabilityModule(harnessParams.get('module'));
const harnessAttachmentStatus = harnessParams.get('attachment') as AiAttachmentStatus | null;
applyDocumentTheme(harnessTheme);
document.documentElement.classList.toggle('light-note-mobile-rendering', harnessMobile);

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
    const { t } = useI18n();
    const store = useAiAssistantStore();
    store.switchConversation(identity, '你好');
    const input = ref('');
    const contexts = ref<Array<{ type: 'bookmark'; id: string; title: string }>>(
      harnessParams.get('material') === '1'
        ? [{ type: 'bookmark', id: 'synthetic-bookmark-1', title: '合成书签' }]
        : [],
    );
    const attachments = ref<AiAttachment[]>(
      harnessAttachmentStatus
        ? [
            {
              id: 'synthetic-attachment-1',
              sourceType: 'temporary',
              fileName: '产品需求说明.pdf',
              fileType: 'application/pdf',
              fileSize: 128_000,
              status: harnessAttachmentStatus,
              errorMessage: harnessAttachmentStatus === 'failed' ? '文件解析失败，请重试' : undefined,
            },
          ]
        : [],
    );
    const capabilityModule = ref<AiCapabilityModule>(harnessInitialModule);
    const capabilityPolicyProfile = ref<AiCapabilityPolicyProfile>(harnessInitialPolicy);
    const sendCount = ref(0);
    const launch = ref<AiAssistantLaunchPayload | null>(null);
    const capabilityModuleOptions = computed(() => buildAiCapabilityModuleOptions((key) => t(key)));
    const capabilityPolicyOptions = computed(() => buildAiCapabilityPolicyOptions((key) => t(key)));
    const syntheticConfirmation: AiToolConfirmation = {
      id: 'synthetic-policy-confirmation',
      token: 'synthetic-policy-token',
      sessionId: 'synthetic-e2e-session',
      toolName: 'create_bookmark',
      args: { title: '合成测试书签', url: 'https://example.com' },
      expiresIn: 300,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      riskLevel: 'low',
      preview: {
        target: '合成测试书签',
        impact: '确认后将创建 1 条书签',
      },
    };
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

    function updateCapabilityPolicy(value: AiCapabilityPolicyProfile) {
      capabilityPolicyProfile.value = normalizeAiCapabilityPolicyProfile(value);
      if (capabilityPolicyProfile.value === 'chat_only') {
        capabilityModule.value = 'auto';
        contexts.value = [];
      }
    }

    return () =>
      h(
        'main',
        { class: ['ai-critical-harness', { 'is-mobile': harnessMobile }], 'data-testid': 'ai-critical-harness' },
        [
          h('section', { 'data-testid': 'mention-flow' }, [
            h(ChatInputSection, {
              modelValue: input.value,
              'onUpdate:modelValue': (value: string) => (input.value = value),
              isLoading: harnessParams.get('loading') === '1',
              quota: null,
              showTranslation: false,
              enableTranslation: false,
              translationConfig: { source: 'auto', target: 'zh-CN' },
              isMobile: harnessMobile,
              sendFn: () => (sendCount.value += 1),
              stopFn: () => undefined,
              contexts: contexts.value,
              'onUpdate:contexts': (value: typeof contexts.value) => (contexts.value = value),
              attachments: attachments.value,
              'onUpdate:attachments': (value: AiAttachment[]) => (attachments.value = value),
              capabilityModule: capabilityModule.value,
              capabilityModuleOptions: capabilityModuleOptions.value,
              capabilityPolicyProfile: capabilityPolicyProfile.value,
              capabilityPolicyOptions: capabilityPolicyOptions.value,
              'onUpdate:capabilityModule': (value: AiCapabilityModule) => (capabilityModule.value = value),
              'onUpdate:capabilityPolicyProfile': updateCapabilityPolicy,
              prepareAttachmentActionFn: async () => undefined,
            }),
            h('output', { 'data-testid': 'send-count' }, String(sendCount.value)),
            h('output', { 'data-testid': 'selected-context' }, contexts.value.map((item) => item.title).join(',')),
            h('output', { 'data-testid': 'capability-policy' }, capabilityPolicyProfile.value),
          ]),
          h('section', { 'data-testid': 'recommendation-flow' }, [
            h(MainQuestionPrompt, {
              round: 1,
              usedQuestions: [],
              items: ['总结我今天新增的笔记', '列出最近 7 天新增的书签', '哪些待办今天需要处理？'],
            }),
          ]),
          h('section', { class: 'ai-critical-harness__confirmation', 'data-testid': 'policy-confirmation-flow' }, [
            h(AiToolConfirmationCard, {
              confirmation: syntheticConfirmation,
              capabilityPolicyProfile: capabilityPolicyProfile.value,
            }),
          ]),
          h('section', { 'data-testid': 'confirmation-flow' }, [
            h(BButton, { 'data-testid': 'seed-confirmation', onClick: seedConfirmation }, () => '写入确认卡'),
            restoredConfirmation.value
              ? h(
                  'article',
                  { 'data-testid': 'restored-confirmation' },
                  restoredConfirmation.value.args?.title as string,
                )
              : null,
          ]),
          h('section', { 'data-testid': 'bookmark-launch-flow' }, [
            h(BButton, { 'data-testid': 'launch-bookmark', onClick: launchBookmark }, () => '书签生成笔记'),
            h('output', { 'data-testid': 'launch-context-id' }, launch.value?.contextRefs?.[0]?.id || ''),
            h('output', { 'data-testid': 'launch-intent' }, launch.value?.suggestedIntent || ''),
            h('output', { 'data-testid': 'launch-prompt' }, input.value),
          ]),
        ],
      );
  },
});

app.use(pinia);
app.use(router);
app.use(createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
app.directive('click-log', () => undefined);
app.mount('#app');
