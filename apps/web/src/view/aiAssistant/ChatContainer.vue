<template>
  <div class="ai-chat-container">
    <!-- 主聊天容器 -->
    <div class="chat-wrapper">
      <AiConversationLineageNavigator
        v-if="lineageConversationId"
        :conversation-id="lineageConversationId"
        @open="openConversation"
        @unavailable="clearMissingCloudConversation"
      />
      <!-- 消息区域 -->
      <main
        class="messages-container"
        ref="messagesContainer"
        @scroll="handleScroll"
        @wheel.passive="handleWheel"
        @touchstart.passive="handleTouchStart"
        @touchmove.passive="handleTouchMove"
        @touchend.passive="handleTouchEnd"
        @touchcancel.passive="handleTouchEnd"
      >
        <template v-for="(message, index) in messages" :key="message.id">
          <ChatMessageItem
            v-if="shouldRenderMessageItem(message)"
            :message="message"
            :data-ai-message-id="message.cloudId || message.id"
            tabindex="-1"
            :is-streaming="isLoading && index === messages.length - 1 && message.role === 'assistant'"
            :can-regenerate="!regenerationPreparing && (!cloudHistoryEnabled() || Boolean(message.cloudId))"
            @edit="handleEditMessage"
            @regenerate="() => handleRegenerate(index)"
            @source-navigate="handleMessageSourceNavigate"
          />
          <AiAnswerVersionSwitcher
            v-if="message.role === 'assistant' && message.cloudId && message.versionGroupId && conversationId"
            :conversation-id="conversationId"
            :message-id="message.cloudId"
            :version-group-id="message.versionGroupId"
            :refresh-token="answerVersionRefreshToken(message.versionGroupId)"
            :is-mobile="bookmark.isMobile"
            @navigate="focusAiAnswerVersion"
          />
          <AiActivitySummary
            v-if="message.role === 'assistant' && (message.activity?.length || message.toolEvents?.length)"
            :activity="message.activity || []"
            :tool-events="message.toolEvents || []"
            :streaming="isLoading && index === messages.length - 1"
          />
          <AiSourceCards
            v-if="message.sources?.length || message.evidence?.length || message.coverage"
            :sources="message.sources || []"
            :evidence="message.evidence || []"
            :coverage="messageCoverage(message)"
            :anchor-scope="message.id"
            :is-mobile="bookmark.isMobile"
            :revealed="shouldShowAiMessageSources(message, index, messages.length, isLoading)"
            @source-navigate="handleSourceNavigate"
          />
          <AiResultActions
            v-if="
              message.role === 'assistant' &&
              message.cloudId &&
              conversationId &&
              !(isLoading && index === messages.length - 1) &&
              !hasPendingAgentActions(message)
            "
            :conversation-id="conversationId"
            :message-id="message.cloudId"
            :feedback="message.feedback"
            :busy="isLoading"
            :content="message.content"
            :content-length="message.content.length"
            :source-count="message.sources?.length || 0"
            :evidence-count="message.evidence?.length || 0"
            @feedback="message.feedback = $event"
            @branched="openConversation"
          />
          <div v-if="message.interactions?.length || message.confirmations?.length" class="ai-message-action-stack">
            <AiInteractionCard
              v-for="interaction in message.interactions || []"
              :key="interaction.id"
              :interaction="interaction"
              @resolved="(resolution) => handleInteractionResolved(index, interaction, resolution)"
              @settled="(settlement) => handleInteractionSettled(index, settlement)"
            />
            <AiToolConfirmationCard
              v-for="confirmation in message.confirmations || []"
              :key="confirmation.id"
              :confirmation="confirmation"
              @resolved="(resolution) => handleConfirmationResolved(index, resolution)"
              @edit="handleConfirmationEdit"
              @settled="(settlement) => handleConfirmationSettled(index, settlement)"
            />
          </div>
        </template>
        <!-- 智能滚动提示  -->
        <ScrollPrompt
          v-if="showScrollToBottom"
          :is-loading="isLoading"
          @scroll-to-bottom-click="handleScrollToBottomClick"
        />
      </main>

      <!-- 回答后的快捷提问固定在输入区上方，不再异步撑高消息滚动区。 -->
      <div v-if="showRecommendationDock" class="recommendation-dock">
        <Transition name="ai-recommendation-fade">
          <MainQuestionPrompt
            v-if="showRecommendation"
            :used-questions="usedQuestions"
            :round="conversationRound"
            :items="displayRecommendationItems"
            @recommendation-click="handleRecommendationClick"
          />
        </Transition>
      </div>

      <!-- 「回答范围」条已整块移除:联网检索未上线只剩占位,已选材料在输入区 @添加资源 的 chips 里即可查看/移除(桌面+移动一致) -->

      <!-- 输入区域 -->
      <ChatInputSection
        ref="chatInputRef"
        v-model="userInput"
        :is-loading="isLoading"
        :quota="aiQuota"
        :show-translation="user.role === 'root'"
        :enable-translation="enableTranslation"
        :translation-config="translationConfig"
        :is-mobile="bookmark.isMobile"
        :send-fn="sendMessage"
        :stop-fn="stopResponse"
        :contexts="contexts"
        :attachments="attachments"
        :prepare-attachment-action-fn="prepareAttachmentAction"
        @update:enable-translation="enableTranslation = $event"
        @update:translation-config="translationConfig = $event"
        @update:contexts="contexts = $event"
        @update:attachments="attachments = $event"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, onBeforeUnmount, onMounted, nextTick, watch } from 'vue';
  import { storeToRefs } from 'pinia';
  import { bookmarkStore, useAiAssistantStore, useUserStore } from '@/store';
  import ChatMessageItem from '@/components/aiAssistant/ChatMessageItem.vue';
  import ChatInputSection from '@/components/aiAssistant/ChatInputSection.vue';
  import ScrollPrompt from '@/components/aiAssistant/ScrollPrompt.vue';
  import MainQuestionPrompt from '@/components/aiAssistant/MainQuestionPrompt.vue';
  import AiInteractionCard from '@/components/aiAssistant/AiInteractionCard.vue';
  import AiToolConfirmationCard from '@/components/aiAssistant/AiToolConfirmationCard.vue';
  import AiActivitySummary from '@/components/aiAssistant/AiActivitySummary.vue';
  import AiAnswerVersionSwitcher from '@/components/aiAssistant/AiAnswerVersionSwitcher.vue';
  import AiConversationLineageNavigator from '@/components/aiAssistant/AiConversationLineageNavigator.vue';
  import AiResultActions from '@/components/aiAssistant/AiResultActions.vue';
  import AiSourceCards, { type AiSource } from '@/components/aiAssistant/AiSourceCards.vue';
  import type { AiCoverageReport, AiSourceCoverage } from '@/components/aiAssistant/aiSourceNavigation';
  import type { AiToolStatusItem } from '@/components/aiAssistant/AiToolStatusList.vue';
  import type { AiResourceContext } from '@/components/aiAssistant/AiContextPicker.vue';
  import {
    clearAiTemporaryAttachments,
    fetchAiAttachmentStatuses,
    prepareAiAttachmentAction,
    AI_AGENT_CLIENT_CAPABILITIES,
  } from '@/api/aiAttachmentApi';
  import type { AiAttachmentActionRequest } from '@/components/aiAssistant/attachmentActions';
  import {
    hasPendingAgentActions,
    markConversationConfirmationPending,
    markConversationInteractionPending,
    promoteConversationInteractionToConfirmation,
    settleConversationConfirmation,
    settleConversationInteraction,
    shouldShowAiMessageSources,
  } from '@/components/aiAssistant/aiConversationState';
  import { createQuickQuestionDispatcher } from '@/components/aiAssistant/quickQuestionDispatch';
  import { shouldUseAiCloudHistory } from '@/components/aiAssistant/aiUiContracts';
  import {
    getAiChatBottomDistance,
    getAiChatMaxScrollTop,
    isAiChatUpwardScroll,
    isAiChatUpwardTouch,
    isAiChatUpwardWheel,
    resolveAiChatPostAnswerViewport,
    shouldPauseAiChatFollow,
    shouldResumeAiChatFollow,
    shouldShowAiChatScrollPrompt,
  } from '@/components/aiAssistant/aiAutoScroll';
  import {
    appendAiStreamMessageContent,
    createAiStreamTypewriter,
    type AiStreamTypewriter,
  } from '@/components/aiAssistant/aiStreamTypewriter';
  import { isEditableAttachmentTool, type AiAttachmentDirectActionName } from '@/config/aiTools';
  import type {
    AiAgentInteraction,
    AiAgentInteractionResolution,
    AiAgentInteractionSettlement,
    AiToolConfirmation,
    AiToolConfirmationResolution,
    AiToolConfirmationSettlement,
  } from '@/types/aiAgent';
  import { useI18n } from 'vue-i18n';
  import axios from 'axios';
  import { apiBasePost } from '@/http/request';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { consumeAiSseChunk, flushAiSseBuffer, type AiSseEvent } from '@/utils/aiSse';
  import { fetchAiFollowUps } from '@/api/aiFollowUpApi';
  import {
    createAiConversation as createAiCloudConversation,
    getAiConversation as getAiCloudConversation,
    listAiConversations as listAiCloudConversations,
    prepareAiMessageVersionGroup,
    recoverAiAgentResponse,
    recoverAiLocalConversation,
    saveAiCloudMessage,
    type AiConversation,
    type AiConversationSummary,
    type AiCloudMessage,
    type AiLocalConversationRecoveryMessage,
    type AiPersistedSource,
  } from '@/api/aiWorkspaceApi';
  import {
    aiDurationBucket,
    aiLengthBucket,
    recordAiProductEvent,
    type AiProductEventDimensions,
  } from '@/api/aiTelemetry';
  import { resolveHelpSources, type ResolvedHelpSource } from '@/api/helpApi';
  import {
    buildAiAssistantRuntimeIdentityKey,
    createAiAssistantMaterialSnapshot,
    createAiAssistantMessageId,
    resolveAiAssistantRequestEdgeStatus,
    resolveAiAssistantIdentity,
    type AiAssistantMaterialSnapshot,
    type AiAssistantMessage,
    type AiAssistantRequestLease,
  } from '@/store/aiAssistant';
  import type { AiAssistantLaunchPayload } from '@/utils/aiEntry';
  import { applyAiRecoverySnapshot, shouldAttemptAiStreamRecovery } from '@/utils/aiStreamRecovery';
  import { toAiMemoryInfluenceActivity } from '@/utils/aiMemoryInfluence';
  import { scrollIntoContainer } from '@/utils/zoom';
  import { decideAiConversationContinuity, type AiConversationRecency } from '@/utils/aiConversationContinuity';

  const { t, locale } = useI18n();

  const emit = defineEmits<{
    (event: 'source-navigate', source?: AiSource): void;
  }>();

  defineExpose({
    applyLaunchContext,
    clearHistory,
    focusInput,
    openConversation,
    refreshCloudConversation,
  });
  const bookmark = bookmarkStore();

  const user = useUserStore();

  function handleSourceNavigate(source: AiSource) {
    emit('source-navigate', source);
  }

  function handleMessageSourceNavigate() {
    emit('source-navigate');
  }

  function messageCoverage(message: ChatMessage): AiCoverageReport | null {
    const value = message.coverage;
    if (!value || typeof value !== 'object') return null;
    const documents = Array.isArray(value.documents) ? value.documents : [];
    const overall = value.overall && typeof value.overall === 'object' ? value.overall : null;
    if (!documents.length && !overall) return null;
    return value as unknown as AiCoverageReport;
  }

  type ChatMessage = AiAssistantMessage;

  // 确认卡/选择卡本身就是这轮助手消息的可见主体。若只剩等待确认或等待选择，
  // 不渲染一个没有内容的助手气泡，避免留下无意义的纵向空白。
  function shouldRenderMessageItem(message: ChatMessage) {
    if (message.role !== 'assistant' || message.content || !message.toolEvents?.length) return true;
    return message.toolEvents.some(
      (item) => item.status !== 'confirmation_required' && item.status !== 'interaction_required',
    );
  }

  const aiAssistant = useAiAssistantStore();
  const {
    draft: userInput,
    messages,
    isLoading,
    hasAnswerStarted,
    contextRefs: contexts,
    attachmentRefs: attachments,
    shouldFollowMessages,
    showScrollToBottom,
    scrollTop,
    sessionId,
    conversationId,
    staleCloudConversationId,
    cloudConversationCheckpointId,
    cloudConversationCheckpointAt,
    longChatHinted,
    scopeMode,
    temporarySession,
    activeAssistantMessageId,
  } = storeToRefs(aiAssistant);

  // 仅 DOM 引用和当前组件显示偏好留在组件内；可恢复的会话态统一由 Pinia 管理。
  const messagesContainer = ref<HTMLElement | null>(null);
  const chatInputRef = ref<{
    focus: () => void;
    openAttachmentAction: (toolName: AiAttachmentDirectActionName, args?: Record<string, unknown>) => boolean;
  } | null>(null);
  const enableTranslation = ref(false);
  const translationConfig = ref({ source: 'auto', target: 'zh' });
  const regenerationPreparing = ref(false);
  const cloudRecoveryPending = ref(false);
  // 本地持久化可能保留了已删除、过期或换号后不再归属的云端会话 ID。
  // 只有 get 会话成功后才允许请求谱系，避免打开 AI 时用未经校验的旧 ID 直接触发 404。
  const lineageConversationId = ref('');

  function isConversationNotFoundError(error: unknown) {
    return String((error as { code?: unknown } | null)?.code || '') === 'CONVERSATION_NOT_FOUND';
  }

  function clearMissingCloudConversation(cloudId: string, runtimeKey = aiAssistant.runtimeIdentityKey) {
    const normalizedId = String(cloudId || '').trim();
    if (!normalizedId || aiAssistant.runtimeIdentityKey !== runtimeKey) return;
    if (conversationId.value === normalizedId) aiAssistant.markCloudConversationMissing(normalizedId);
    if (lineageConversationId.value === normalizedId) lineageConversationId.value = '';
  }

  // 任意地方切换/清空云端会话时，先撤下上一个会话的谱系导航；等新会话读取成功后再恢复。
  watch(conversationId, (currentId) => {
    if (lineageConversationId.value && lineageConversationId.value !== String(currentId || '').trim()) {
      lineageConversationId.value = '';
    }
  });

  function focusInput() {
    chatInputRef.value?.focus();
  }

  function applyLaunchContext(payload: AiAssistantLaunchPayload = {}) {
    if (payload.contextRefs?.length) {
      const merged = [...payload.contextRefs, ...contexts.value];
      contexts.value = merged
        .filter(
          (item, index, all) =>
            all.findIndex((candidate) => candidate.type === item.type && candidate.id === item.id) === index,
        )
        .slice(0, 5);
    }
    if (payload.attachmentRefs?.length) {
      const merged = [...payload.attachmentRefs, ...attachments.value];
      attachments.value = merged
        .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
        .slice(0, 5);
    }
    if (payload.suggestedIntent) {
      const key = `ai.intentPrompts.${payload.suggestedIntent}`;
      userInput.value = t(key, { query: payload.query || '' });
    } else if (payload.query) {
      userInput.value = t('ai.intentPrompts.find', { query: payload.query });
    }
    focusInput();
  }

  // AI 今日额度(按成长等级下发;root/本机自测豁免返回 exempt)。进页与每轮回复结束后刷新,展示「已用 / 剩余」
  const aiQuota = ref<{ exempt?: boolean; role?: string; used?: number; quota?: number; remaining?: number } | null>(
    null,
  );
  async function fetchAiQuota() {
    try {
      const res = await apiBasePost('/api/chat/aiQuota');
      if (res?.status === 200) aiQuota.value = res.data;
    } catch {
      /* 额度展示失败不影响主流程 */
    }
  }

  // 默认跟随流式正文；只有用户明确向上浏览时暂停，回到底部后自动恢复。
  const usedQuestions = computed(() =>
    messages.value
      .filter((message) => message.role === 'user' && !message.transient)
      .map((message) => message.content.trim()),
  );
  const conversationRound = computed(() => usedQuestions.value.length);
  const latestAssistantMessage = computed(() => {
    const latest = messages.value[messages.value.length - 1];
    return latest?.role === 'assistant' ? latest : null;
  });
  const displayRecommendationItems = computed<string[] | null>(() => {
    if (conversationRound.value === 0) return null;
    const latest = latestAssistantMessage.value;
    if (!latest?.recommendationReady) return [];
    return latest.recommendations?.length ? latest.recommendations : null;
  });
  const showRecommendationDock = computed(() => {
    const latest = latestAssistantMessage.value;
    if (!latest || hasPendingAgentActions(latest)) return false;
    // 用户开始输入时收起追问 dock,把纵向空间让给回答区(方案 §8.6:进入对话后不长期占用输入区高度)。
    if (userInput.value.trim()) return false;
    // 生成回答期间追问内容本来就不可用，不保留一个空的 40px dock；否则发送后消息区会先被挤矮，
    // 看起来像滚动越过底部再回弹。回答完成并真正开始生成追问后，再进入 pending/ready 状态。
    return Boolean(conversationRound.value === 0 || latest.recommendationPending || latest.recommendationReady);
  });
  const showRecommendation = computed(() => {
    if (isLoading.value || !messages.value.length) return false;
    const latest = latestAssistantMessage.value;
    return Boolean(
      latest && !hasPendingAgentActions(latest) && (conversationRound.value === 0 || latest.recommendationReady),
    );
  });

  let scrollFrame: number | null = null;
  let touchStartY: number | null = null;

  // 流式输出控制
  let activeAnswerTypewriter: AiStreamTypewriter | null = null;

  type AiRoundTelemetry = {
    assistantMessageId: string;
    startedAt: number;
    requestId: string;
    materialCount: number;
    materialType: NonNullable<AiProductEventDimensions['materialType']>;
    scopeMode: NonNullable<AiProductEventDimensions['scopeMode']>;
    firstActivityRecorded: boolean;
    firstTokenRecorded: boolean;
    finalized: boolean;
  };

  let activeRoundTelemetry: AiRoundTelemetry | null = null;

  function aiTelemetryDevice(): NonNullable<AiProductEventDimensions['device']> {
    if (bookmark.isMobile) return 'mobile';
    if (bookmark.isTablet) return 'tablet';
    if (bookmark.isDesktop) return 'desktop';
    return 'unknown';
  }

  function aiTelemetryMaterialType(
    contextSnapshot: AiResourceContext[],
    attachmentCount: number,
  ): NonNullable<AiProductEventDimensions['materialType']> {
    const types = new Set<string>(contextSnapshot.map((item) => item.type));
    if (attachmentCount > 0) types.add('attachment');
    if (!types.size) return 'unknown';
    if (types.size > 1) return 'mixed';
    const only = [...types][0];
    return ['note', 'bookmark', 'file', 'tag', 'attachment'].includes(only)
      ? (only as NonNullable<AiProductEventDimensions['materialType']>)
      : 'unknown';
  }

  function aiTelemetryStage(data: AiSseEvent): NonNullable<AiProductEventDimensions['stage']> {
    const raw = String(data.stage || data.phase || data.event || '').toLowerCase();
    if (raw.includes('fail') || raw === 'error') return 'failed';
    if (raw.includes('complete') || raw === 'done') return 'completed';
    if (raw.includes('answer') || raw.includes('final') || raw === 'delta') return 'answering';
    if (raw.includes('read') || raw.includes('parse')) return 'reading';
    if (raw.includes('retriev') || raw.includes('search') || raw.includes('tool') || raw === 'sources') {
      return 'retrieving';
    }
    return 'planning';
  }

  function aiRoundDimensions(round: AiRoundTelemetry): AiProductEventDimensions {
    return {
      surface: 'conversation',
      device: aiTelemetryDevice(),
      mode: 'ask',
      intent: 'ask',
      materialType: round.materialType,
      scopeMode: round.scopeMode,
      materialCount: round.materialCount,
      temporarySession: temporarySession.value,
      externalWeb: false,
      messageId: round.assistantMessageId,
      ...(conversationId.value ? { conversationId: conversationId.value } : {}),
      ...(round.requestId ? { requestId: round.requestId } : {}),
    };
  }

  function updateAiRoundRequestId(requestId: unknown) {
    const normalized = String(requestId || '').trim();
    if (activeRoundTelemetry && normalized) activeRoundTelemetry.requestId = normalized;
  }

  function markAiFirstActivity(data: AiSseEvent) {
    const round = activeRoundTelemetry;
    if (!round || round.firstActivityRecorded || round.finalized) return;
    round.firstActivityRecorded = true;
    void recordAiProductEvent('ai_first_activity', {
      ...aiRoundDimensions(round),
      durationBucket: aiDurationBucket(Date.now() - round.startedAt),
      stage: aiTelemetryStage(data),
    });
  }

  function markAiFirstToken() {
    const round = activeRoundTelemetry;
    if (!round || round.firstTokenRecorded || round.finalized) return;
    round.firstTokenRecorded = true;
    void recordAiProductEvent('ai_first_token', {
      ...aiRoundDimensions(round),
      durationBucket: aiDurationBucket(Date.now() - round.startedAt),
      stage: 'answering',
    });
  }

  function safeAiErrorCode(value: unknown) {
    const normalized = String(value || 'AI_STREAM_FAILED')
      .trim()
      .replace(/[^A-Za-z0-9._:@/-]/g, '_')
      .slice(0, 128);
    return normalized || 'AI_STREAM_FAILED';
  }

  function finalizeAiRound(
    status: 'completed' | 'failed' | 'stopped',
    currentMessage: ChatMessage | null,
    options: { errorCode?: unknown; cancelled?: boolean } = {},
  ) {
    const round = activeRoundTelemetry;
    if (!round || round.finalized) return;
    round.finalized = true;
    // 身份切换、切会话与组件卸载不是用户主动“停止”；不跨主体补发产品事件。
    if (options.cancelled) {
      if (activeRoundTelemetry === round) activeRoundTelemetry = null;
      return;
    }
    const dimensions: AiProductEventDimensions = {
      ...aiRoundDimensions(round),
      durationBucket: aiDurationBucket(Date.now() - round.startedAt),
      lengthBucket: aiLengthBucket(currentMessage?.content.length || 0),
      sourceCount: currentMessage?.sources?.length || 0,
      stage: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'answering',
      outcome: status === 'completed' ? 'success' : status === 'failed' ? 'failed' : 'stopped',
      ...(status === 'failed' ? { errorCode: safeAiErrorCode(options.errorCode) } : {}),
    };
    void recordAiProductEvent(status === 'stopped' ? 'ai_stopped' : 'ai_completed', dimensions);
    if (activeRoundTelemetry === round) activeRoundTelemetry = null;
  }

  const conversationIdentity = computed(() => resolveAiAssistantIdentity(user));
  const conversationRuntimeIdentityKey = computed(() => buildAiAssistantRuntimeIdentityKey(conversationIdentity.value));

  function persistHistory() {
    aiAssistant.persistCurrentConversation();
  }

  async function repairLegacyKnowledgeSources() {
    const legacySources = messages.value
      .flatMap((chatMessage) => chatMessage.sources || [])
      .filter((source) => source.type === 'knowledge' && (!source.id || !source.target));
    const titles = [...new Set(legacySources.map((source) => source.title.trim()).filter(Boolean))].slice(0, 20);
    if (!titles.length) return;
    try {
      const response = await resolveHelpSources(titles);
      if (response?.status !== 200 || !Array.isArray(response.data)) return;
      const byTitle = new Map(
        (response.data as ResolvedHelpSource[]).map((source) => [String(source.title || '').trim(), source]),
      );
      let repaired = false;
      messages.value.forEach((chatMessage) => {
        chatMessage.sources?.forEach((source) => {
          if (source.type !== 'knowledge' || (source.id && source.target)) return;
          const resolved = byTitle.get(source.title.trim());
          if (!resolved) return;
          source.id = resolved.id;
          source.category = resolved.category;
          source.status = resolved.status;
          source.target = resolved.target;
          repaired = true;
        });
      });
      if (repaired) persistHistory();
    } catch {
      // 旧会话修复失败不影响聊天；下次进入页面仍会再次尝试。
    }
  }

  function restoreConversationViewport() {
    nextTick(() => {
      const container = messagesContainer.value;
      if (!container) return;
      if (scrollTop.value > 0) {
        container.scrollTop = scrollTop.value;
        return;
      }
      scheduleScrollToBottom(true);
    });
  }

  function activateConversation() {
    const nextRuntimeIdentityKey = conversationRuntimeIdentityKey.value;
    if (aiAssistant.initialized && aiAssistant.runtimeIdentityKey !== nextRuntimeIdentityKey && isLoading.value) {
      stopResponse('cancelled');
    }
    if (aiAssistant.initialized && aiAssistant.runtimeIdentityKey !== nextRuntimeIdentityKey) {
      cancelLatestConversationChoice();
    }
    const switched = aiAssistant.switchConversation(conversationIdentity.value, t('ai.greeting'));
    lineageConversationId.value = '';
    if (!cloudHistoryEnabled()) aiAssistant.setCloudConversationId('');
    if (!switched) {
      void requestCloudConversationHydration(nextRuntimeIdentityKey);
      return;
    }
    activeAnswerTypewriter = null;
    void repairLegacyKnowledgeSources();
    restoreConversationViewport();
    void requestCloudConversationHydration(nextRuntimeIdentityKey);
  }

  let cloudConversationCreation: { runtimeKey: string; promise: Promise<string | null> } | null = null;
  const MAX_LOCAL_RECOVERY_MESSAGES = 200;
  const MAX_LOCAL_RECOVERY_CONTENT_CHARS = 2_000_000;
  const MAX_LOCAL_RECOVERY_MESSAGE_CHARS = 1_000_000;

  type StaleCloudConversationChoice = 'new' | 'restore' | 'cancel';
  type CloudConversationPreparation = 'ready' | 'replaced' | 'cancelled';

  function cloudHistoryEnabled() {
    return shouldUseAiCloudHistory(user.id, user.role, user.preferences.aiCloudHistory);
  }

  function createGreetingMessage(): ChatMessage {
    return {
      id: createAiAssistantMessageId('greeting'),
      role: 'assistant',
      content: t('ai.greeting'),
      timestamp: new Date(),
      recommendationReady: true,
      recommendations: [],
    };
  }

  function isInitialLocalGreeting(chatMessage: ChatMessage, index: number) {
    return Boolean(
      index === 0 &&
      chatMessage.role === 'assistant' &&
      !chatMessage.cloudId &&
      !chatMessage.parentMessageId &&
      !chatMessage.versionGroupId &&
      !chatMessage.contextRefs?.length &&
      !chatMessage.contexts?.length &&
      !chatMessage.attachmentRefs?.length &&
      !chatMessage.sources?.length &&
      !chatMessage.evidence?.length,
    );
  }

  function buildLocalConversationRecovery() {
    const candidates = messages.value.filter(
      (chatMessage, index) =>
        chatMessage.content &&
        !chatMessage.transient &&
        !hasPendingAgentActions(chatMessage) &&
        (chatMessage.role === 'user' || chatMessage.role === 'assistant') &&
        !isInitialLocalGreeting(chatMessage, index),
    );
    const selected: ChatMessage[] = [];
    let contentLength = 0;
    // 以最新上下文优先：恢复接口与会话读取都封顶 200 条，且服务端总正文有 200 万字符保护。
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const chatMessage = candidates[index];
      const nextLength = chatMessage.content.length;
      if (
        selected.length >= MAX_LOCAL_RECOVERY_MESSAGES ||
        nextLength > MAX_LOCAL_RECOVERY_MESSAGE_CHARS ||
        contentLength + nextLength > MAX_LOCAL_RECOVERY_CONTENT_CHARS
      ) {
        continue;
      }
      selected.push(chatMessage);
      contentLength += nextLength;
    }
    selected.reverse();
    // 截断刚好落在一条回答上时，不把缺少提问的孤立回答作为新会话的第一段上下文。
    while (selected[0]?.role === 'assistant') selected.shift();
    const clientIdByMessage = new Map<ChatMessage, string>();
    const clientIdByReference = new Map<string, string>();
    selected.forEach((chatMessage, index) => {
      const clientId = `local-recovery-${index}`;
      clientIdByMessage.set(chatMessage, clientId);
      clientIdByReference.set(chatMessage.id, clientId);
      if (chatMessage.cloudId) clientIdByReference.set(chatMessage.cloudId, clientId);
    });
    const recoveryMessages: AiLocalConversationRecoveryMessage[] = selected.map((chatMessage) => {
      const sources = (chatMessage.sources || []).map(localSourceToCloud);
      const knownSourceIds = new Set(sources.map((source) => source.sourceId));
      return {
        clientId: clientIdByMessage.get(chatMessage) || createAiAssistantMessageId('local-recovery'),
        parentClientId: chatMessage.parentMessageId
          ? clientIdByReference.get(chatMessage.parentMessageId) || null
          : null,
        versionGroupClientId: chatMessage.versionGroupId
          ? clientIdByReference.get(chatMessage.versionGroupId) || null
          : null,
        role: chatMessage.role,
        status: chatMessage.terminal?.status === 'failed' ? 'failed' : 'completed',
        content: chatMessage.content,
        contextRefs: chatMessage.contextRefs || chatMessage.contexts || [],
        attachmentRefs: chatMessage.attachmentRefs || [],
        activity: chatMessage.activity || [],
        coverage: chatMessage.coverage || null,
        modelMeta: chatMessage.recovered
          ? { recovered: true, stage: chatMessage.stage || null, terminal: chatMessage.terminal || null }
          : null,
        sources,
        evidence: (chatMessage.evidence || []).filter((item) => knownSourceIds.has(item.sourceId)),
        traceId: chatMessage.traceId || null,
      };
    });
    return {
      messages: recoveryMessages,
      localMessageCount: candidates.length,
      truncated: recoveryMessages.length !== candidates.length,
    };
  }

  function askStaleCloudConversationChoice(recovery: ReturnType<typeof buildLocalConversationRecovery>) {
    return new Promise<StaleCloudConversationChoice>((resolve) => {
      const canRestore = recovery.messages.length > 0;
      const content = !canRestore
        ? t('ai.conversations.remoteDeletedContentNoHistory')
        : recovery.truncated
          ? t('ai.conversations.remoteDeletedContentLimited', {
              count: recovery.localMessageCount,
              restoredCount: recovery.messages.length,
            })
          : t('ai.conversations.remoteDeletedContentWithHistory', { count: recovery.localMessageCount });
      Alert.alert({
        title: t('ai.conversations.remoteDeletedTitle'),
        content,
        footer: [
          { label: t('common.cancel'), type: 'dashed', function: () => resolve('cancel') },
          ...(canRestore
            ? [
                {
                  label: t('ai.conversations.restoreLocalHistory'),
                  type: 'dashed' as const,
                  function: () => resolve('restore'),
                },
              ]
            : []),
          {
            label: t('ai.conversations.continueAsNew'),
            type: 'primary' as const,
            function: () => resolve('new'),
          },
        ],
      });
    });
  }

  function applyRecoveredCloudConversation(cloudConversation: { id: string; messages: AiCloudMessage[] }) {
    const cloudMessages = normalizeVisibleVersionGroups(
      cloudConversation.messages.map(cloudMessageToLocal).filter((item): item is ChatMessage => Boolean(item)),
    );
    messages.value = cloudMessages.length ? cloudMessages : [createGreetingMessage()];
    sessionId.value = '';
    longChatHinted.value = false;
    temporarySession.value = false;
    aiAssistant.setCloudConversationId(cloudConversation.id);
    aiAssistant.clearCloudConversationRecovery();
    lineageConversationId.value = cloudConversation.id;
    persistHistory();
    resetScrollState();
  }

  async function startFreshCloudConversationAfterDeletion(runtimeKey: string) {
    const created = await createAiCloudConversation({ retentionMode: 'standard' });
    if (aiAssistant.runtimeIdentityKey !== runtimeKey) return false;
    applyRecoveredCloudConversation({ id: created.id, messages: [] });
    message.success(t('ai.conversations.remoteDeletedStartedNew'));
    return true;
  }

  async function restoreLocalCloudConversationAfterDeletion(
    runtimeKey: string,
    recovery: ReturnType<typeof buildLocalConversationRecovery>,
  ) {
    const result = await recoverAiLocalConversation({ messages: recovery.messages });
    if (aiAssistant.runtimeIdentityKey !== runtimeKey) return false;
    applyRecoveredCloudConversation(result.conversation);
    message.success(t('ai.conversations.remoteDeletedRestored', { count: result.restoredMessageCount }));
    return true;
  }

  async function prepareCloudConversationForSend(runtimeKey: string): Promise<CloudConversationPreparation> {
    if (!cloudHistoryEnabled() || aiAssistant.runtimeIdentityKey !== runtimeKey) return 'ready';
    const existingId = String(conversationId.value || '').trim();
    if (existingId && !staleCloudConversationId.value) {
      try {
        // 发送前做一次只读取会话元数据的轻量确认，避免另一台设备刚删除后继续把消息发向失效 ID。
        await getAiCloudConversation(existingId, 0);
        if (aiAssistant.runtimeIdentityKey !== runtimeKey) return 'cancelled';
        lineageConversationId.value = existingId;
        return 'ready';
      } catch (error) {
        if (isConversationNotFoundError(error)) clearMissingCloudConversation(existingId, runtimeKey);
        else return 'ready'; // 网络暂时不可用时不阻断本地问答；后续保存仍会再次确认。
      }
    }
    if (!staleCloudConversationId.value) return 'ready';
    cloudRecoveryPending.value = true;
    const recovery = buildLocalConversationRecovery();
    try {
      const choice = await askStaleCloudConversationChoice(recovery);
      if (choice === 'cancel' || aiAssistant.runtimeIdentityKey !== runtimeKey) return 'cancelled';
      if (choice === 'new') {
        try {
          return (await startFreshCloudConversationAfterDeletion(runtimeKey)) ? 'replaced' : 'cancelled';
        } catch {
          message.warning(t('ai.conversations.remoteDeletedStartNewFailed'));
          return 'cancelled';
        }
      }
      try {
        return (await restoreLocalCloudConversationAfterDeletion(runtimeKey, recovery)) ? 'replaced' : 'cancelled';
      } catch {
        message.warning(t('ai.conversations.remoteDeletedRestoreFailed'));
        return 'cancelled';
      }
    } finally {
      cloudRecoveryPending.value = false;
    }
  }

  async function ensureCloudConversation(runtimeKey: string) {
    if (!cloudHistoryEnabled() || aiAssistant.runtimeIdentityKey !== runtimeKey) return null;
    // 已发现跨设备删除时必须先由用户在发送前选择恢复策略，禁止这里静默创建并复活旧上下文。
    if (staleCloudConversationId.value) return null;
    if (conversationId.value) {
      const existingId = conversationId.value;
      if (lineageConversationId.value === existingId) return existingId;
      try {
        // 刷新后恢复的 ID 还没有经过本轮身份/保留策略校验，先轻量读取；不覆盖当前本机历史。
        await getAiCloudConversation(existingId, 0);
        if (aiAssistant.runtimeIdentityKey === runtimeKey) lineageConversationId.value = existingId;
        return existingId;
      } catch (error) {
        if (isConversationNotFoundError(error)) clearMissingCloudConversation(existingId, runtimeKey);
        return null;
      }
    }
    if (cloudConversationCreation?.runtimeKey === runtimeKey) return cloudConversationCreation.promise;
    // 不传本地化的"未命名"标题:让后端用固定哨兵默认标题(新会话),这样首条用户消息保存时
    // 后端的"标题==默认→改成首句提问"自动改名才会触发(修复会话全叫"新对话"、无法区分的问题)。
    const promise = createAiCloudConversation({ retentionMode: 'standard' })
      .then((created) => {
        if (aiAssistant.runtimeIdentityKey !== runtimeKey) return null;
        aiAssistant.setCloudConversationId(created.id);
        lineageConversationId.value = created.id;
        return created.id;
      })
      .catch(() => null)
      .finally(() => {
        if (cloudConversationCreation?.promise === promise) cloudConversationCreation = null;
      });
    cloudConversationCreation = { runtimeKey, promise };
    return promise;
  }

  function persistedSourceToLocal(source: AiPersistedSource): AiSource {
    const target = source.target && typeof source.target === 'object' ? source.target : null;
    return {
      type: source.resourceType as AiSource['type'],
      id: String(source.resourceId || source.sourceId),
      title: source.title,
      sourceId: source.sourceId,
      resourceId: source.resourceId || undefined,
      resourceVersion: source.resourceVersion || undefined,
      target: (typeof source.target === 'string' ? source.target : target?.type) as AiSource['target'],
      url: typeof target?.url === 'string' ? target.url : undefined,
      fileId: typeof target?.fileId === 'string' ? target.fileId : undefined,
      coverage: persistedCoverageToLocal(source.coverage),
    };
  }

  function persistedCoverageToLocal(value: Record<string, unknown> | null): AiSourceCoverage | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const countGroup = (raw: unknown) => {
      const group = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      return {
        chars: Math.max(0, Number(group.chars || 0)),
        pages: Math.max(0, Number(group.pages || 0)),
        chunks: Math.max(0, Number(group.chunks || 0)),
      };
    };
    const ratioValue = value.coverageRatio == null ? null : Number(value.coverageRatio);
    return {
      metadataAvailable: value.metadataAvailable !== false,
      complete: value.complete === true,
      truncated: value.truncated === true,
      coverageRatio: Number.isFinite(ratioValue) ? Math.max(0, Math.min(1, Number(ratioValue))) : null,
      total: countGroup(value.total),
      processed: countGroup(value.processed),
      failedRanges: Array.isArray(value.failedRanges) ? (value.failedRanges as AiSourceCoverage['failedRanges']) : [],
      reasons: Array.isArray(value.reasons) ? (value.reasons as AiSourceCoverage['reasons']) : [],
      parserVersion: typeof value.parserVersion === 'string' ? value.parserVersion : undefined,
    };
  }

  function cloudMessageToLocal(cloudMessage: AiCloudMessage): ChatMessage | null {
    if (cloudMessage.role !== 'user' && cloudMessage.role !== 'assistant') return null;
    const contexts = (cloudMessage.contextRefs || [])
      .filter((item) => item && ['bookmark', 'note', 'file', 'tag'].includes(String(item.type)))
      .map((item) => ({
        type: item.type as AiResourceContext['type'],
        id: String(item.id),
        title: String(item.title || ''),
      }));
    return {
      id: cloudMessage.id,
      cloudId: cloudMessage.id,
      parentMessageId: cloudMessage.parentMessageId || undefined,
      versionGroupId: cloudMessage.versionGroupId || undefined,
      role: cloudMessage.role,
      content: cloudMessage.content,
      timestamp: new Date(cloudMessage.createdAt),
      contexts,
      contextRefs: contexts,
      attachmentRefs: (cloudMessage.attachmentRefs || [])
        .filter(
          (item) =>
            item && ['temporary', 'cloud'].includes(String(item.sourceType)) && Boolean(String(item.id || '').trim()),
        )
        .map((item) => ({
          id: String(item.id),
          sourceType: item.sourceType === 'cloud' ? 'cloud' : 'temporary',
          fileId: item.fileId == null ? null : String(item.fileId),
          fileName: String(item.fileName || ''),
          fileType: String(item.fileType || ''),
          fileSize: Math.max(0, Number(item.fileSize || 0)),
          status: ['awaiting_upload', 'queued', 'parsing', 'ready', 'no_text', 'failed'].includes(String(item.status))
            ? (item.status as NonNullable<ChatMessage['attachmentRefs']>[number]['status'])
            : 'failed',
        })),
      sources: (cloudMessage.sources || []).map(persistedSourceToLocal),
      evidence: cloudMessage.evidence || [],
      feedback: cloudMessage.feedback || undefined,
      coverage: cloudMessage.coverage,
      activity: cloudMessage.activity,
      requestId: cloudMessage.requestId || undefined,
      traceId: cloudMessage.traceId || undefined,
      recovered: cloudMessage.modelMeta?.recovered === true,
      stage: typeof cloudMessage.modelMeta?.stage === 'string' ? cloudMessage.modelMeta.stage : undefined,
      terminal:
        cloudMessage.modelMeta?.terminal && typeof cloudMessage.modelMeta.terminal === 'object'
          ? (cloudMessage.modelMeta.terminal as ChatMessage['terminal'])
          : undefined,
      recommendations: [],
      recommendationReady: true,
      recommendationPending: false,
    };
  }

  function normalizeVisibleVersionGroups(items: ChatMessage[]) {
    const anchors = new Map(
      items.filter((item) => item.role === 'assistant' && item.cloudId).map((item) => [item.cloudId!, item]),
    );
    for (const item of items) {
      if (item.role !== 'assistant' || !item.versionGroupId) continue;
      const anchor = anchors.get(item.versionGroupId);
      if (anchor && !anchor.versionGroupId) anchor.versionGroupId = item.versionGroupId;
    }
    return items;
  }

  type LatestConversationChoice = 'stay' | 'switch';
  let latestConversationChoicePending = false;
  let resolveLatestConversationChoice: ((choice: LatestConversationChoice) => void) | null = null;
  let cloudHydrationTask: { runtimeKey: string; promise: Promise<void> } | null = null;

  function conversationRecency(conversation: AiConversationSummary): AiConversationRecency {
    return {
      id: String(conversation.id || ''),
      lastMessageAt: String(conversation.lastMessageAt || ''),
    };
  }

  function cloudConversationCheckpoint(): AiConversationRecency | null {
    if (!cloudConversationCheckpointId.value || !cloudConversationCheckpointAt.value) return null;
    return {
      id: cloudConversationCheckpointId.value,
      lastMessageAt: cloudConversationCheckpointAt.value,
    };
  }

  function markCloudConversationSeen(conversation: AiConversationSummary) {
    aiAssistant.markCloudConversationCheckpoint(conversation.id, conversation.lastMessageAt);
  }

  function askLatestConversationChoice(
    current: AiConversationSummary,
    latest: AiConversationSummary,
  ): Promise<LatestConversationChoice> {
    if (latestConversationChoicePending) return Promise.resolve('stay');
    latestConversationChoicePending = true;
    return new Promise<LatestConversationChoice>((resolve) => {
      const settle = (choice: LatestConversationChoice) => {
        latestConversationChoicePending = false;
        resolveLatestConversationChoice = null;
        resolve(choice);
      };
      resolveLatestConversationChoice = settle;
      Alert.alert({
        title: t('ai.conversations.latestAvailableTitle'),
        content: t('ai.conversations.latestAvailableContent', {
          current: current.title || t('ai.conversations.untitled'),
          latest: latest.title || t('ai.conversations.untitled'),
        }),
        footer: [
          {
            label: t('ai.conversations.stayCurrent'),
            type: 'dashed',
            function: () => settle('stay'),
          },
          {
            label: t('ai.conversations.switchToLatest'),
            type: 'primary',
            function: () => settle('switch'),
          },
        ],
      });
    });
  }

  function cancelLatestConversationChoice() {
    if (!resolveLatestConversationChoice) return;
    const settle = resolveLatestConversationChoice;
    Alert.destroy();
    settle('stay');
  }

  async function hydrateCloudConversation(runtimeKey: string) {
    if (!cloudHistoryEnabled() || aiAssistant.runtimeIdentityKey !== runtimeKey || isLoading.value) return;
    // 云端已明确找不到旧会话时，保留本机历史直到用户在发送前作出选择，不能再被“最近会话”覆盖。
    if (staleCloudConversationId.value) return;
    const localHasUnsyncedMessages = messages.value
      .slice(1)
      .some((item) => !item.cloudId && (Boolean(item.content) || hasPendingAgentActions(item)));
    if (localHasUnsyncedMessages) return;
    try {
      const currentCloudId = String(conversationId.value || '').trim();
      if (!currentCloudId) {
        const listed = await listAiCloudConversations({ status: 'active', limit: 1 });
        const latest = listed.items[0] || null;
        if (!latest || aiAssistant.runtimeIdentityKey !== runtimeKey) return;
        const loaded = await loadCloudConversation(latest.id, runtimeKey);
        if (loaded) markCloudConversationSeen(latest);
        return;
      }

      const current = await loadCloudConversation(currentCloudId, runtimeKey);
      if (!current || aiAssistant.runtimeIdentityKey !== runtimeKey) return;
      const listed = await listAiCloudConversations({ status: 'active', limit: 1 });
      const latest = listed.items[0] || null;
      if (!latest || aiAssistant.runtimeIdentityKey !== runtimeKey || isLoading.value) return;
      const decision = decideAiConversationContinuity({
        current: conversationRecency(current),
        latest: conversationRecency(latest),
        checkpoint: cloudConversationCheckpoint(),
      });
      if (decision !== 'offer_latest') {
        markCloudConversationSeen(latest);
        return;
      }

      const choice = await askLatestConversationChoice(current, latest);
      if (aiAssistant.runtimeIdentityKey !== runtimeKey || isLoading.value) return;
      if (choice === 'stay') {
        markCloudConversationSeen(latest);
        return;
      }
      try {
        const switched = await loadCloudConversation(latest.id, runtimeKey);
        if (switched) markCloudConversationSeen(latest);
      } catch {
        message.warning(t('ai.conversations.loadFailed'));
      }
    } catch {
      // 云端历史不可用时保留本地会话，聊天主流程继续可用。
    }
  }

  function requestCloudConversationHydration(runtimeKey = aiAssistant.runtimeIdentityKey) {
    if (cloudHydrationTask?.runtimeKey === runtimeKey) return cloudHydrationTask.promise;
    const promise = hydrateCloudConversation(runtimeKey).finally(() => {
      if (cloudHydrationTask?.promise === promise) cloudHydrationTask = null;
    });
    cloudHydrationTask = { runtimeKey, promise };
    return promise;
  }

  function applyCloudConversation(cloudConversation: AiConversation, runtimeKey: string) {
    if (aiAssistant.runtimeIdentityKey !== runtimeKey || isLoading.value) return false;
    const cloudMessages = normalizeVisibleVersionGroups(
      cloudConversation.messages.map(cloudMessageToLocal).filter((item): item is ChatMessage => Boolean(item)),
    );
    aiAssistant.setCloudConversationId(cloudConversation.id);
    aiAssistant.clearCloudConversationRecovery();
    lineageConversationId.value = cloudConversation.id;
    messages.value = cloudMessages.length ? cloudMessages : [createGreetingMessage()];
    persistHistory();
    restoreConversationViewport();
    return true;
  }

  async function loadCloudConversation(
    cloudId: string,
    runtimeKey = aiAssistant.runtimeIdentityKey,
  ): Promise<AiConversation | null> {
    let cloudConversation: AiConversation;
    try {
      cloudConversation = await getAiCloudConversation(cloudId, 200);
    } catch (error) {
      if (isConversationNotFoundError(error)) clearMissingCloudConversation(cloudId, runtimeKey);
      throw error;
    }
    return applyCloudConversation(cloudConversation, runtimeKey) ? cloudConversation : null;
  }

  async function markLatestCloudConversationSeen(runtimeKey = aiAssistant.runtimeIdentityKey) {
    try {
      const listed = await listAiCloudConversations({ status: 'active', limit: 1 });
      const latest = listed.items[0] || null;
      if (latest && aiAssistant.runtimeIdentityKey === runtimeKey) markCloudConversationSeen(latest);
    } catch {
      // 用户已明确选择会话，检查点刷新失败只会让下次打开时再次核对，不影响本次切换。
    }
  }

  async function openConversation(cloudId: string) {
    const normalizedId = String(cloudId || '').trim();
    if (!normalizedId) return false;
    if (isLoading.value) stopResponse('cancelled');
    try {
      const runtimeKey = aiAssistant.runtimeIdentityKey;
      const loaded = await loadCloudConversation(normalizedId, runtimeKey);
      if (!loaded) return false;
      await markLatestCloudConversationSeen(runtimeKey);
      return true;
    } catch {
      message.warning(t('ai.conversations.loadFailed'));
      return false;
    }
  }

  async function refreshCloudConversation() {
    await requestCloudConversationHydration(aiAssistant.runtimeIdentityKey);
  }

  function answerVersionRefreshToken(versionGroupId: string) {
    return messages.value
      .filter((item) => item.role === 'assistant' && item.versionGroupId === versionGroupId)
      .map((item) => item.cloudId || item.id)
      .join('|');
  }

  async function focusAiAnswerVersion(messageId: string) {
    await nextTick();
    const container = messagesContainer.value;
    if (!container) return;
    const target = Array.from(container.querySelectorAll<HTMLElement>('[data-ai-message-id]')).find(
      (element) => element.dataset.aiMessageId === messageId,
    );
    if (!target) {
      message.warning(t('ai.versions.unavailable'));
      return;
    }
    scrollIntoContainer(container, target, 12);
    target.focus({ preventScroll: true });
  }

  function localSourceToCloud(source: AiSource) {
    const extended = source as AiSource & {
      sourceId?: string;
      resourceId?: string;
      resourceVersion?: string;
      coverage?: Record<string, unknown>;
    };
    return {
      sourceId: extended.sourceId || `${source.type}:${extended.resourceId || source.id}`,
      resourceType: source.type,
      resourceId: extended.resourceId || source.id,
      resourceVersion: extended.resourceVersion || null,
      title: source.title,
      target: source.target || null,
      url: source.url,
      fileId: source.fileId,
      coverage: extended.coverage || null,
    };
  }

  async function persistCloudUserMessage(runtimeKey: string, chatMessage: ChatMessage) {
    const cloudConversationId = await ensureCloudConversation(runtimeKey);
    if (!cloudConversationId || aiAssistant.runtimeIdentityKey !== runtimeKey) return null;
    try {
      const saved = await saveAiCloudMessage(cloudConversationId, {
        parentMessageId: chatMessage.parentMessageId,
        requestId: `user:${chatMessage.id}`,
        role: 'user',
        content: chatMessage.content,
        status: 'completed',
        contextRefs: chatMessage.contextRefs || chatMessage.contexts || [],
        attachmentRefs: chatMessage.attachmentRefs || [],
      });
      if (aiAssistant.runtimeIdentityKey === runtimeKey) chatMessage.cloudId = saved.id;
      return saved;
    } catch (error) {
      if (isConversationNotFoundError(error)) clearMissingCloudConversation(cloudConversationId, runtimeKey);
      return null;
    }
  }

  async function persistCloudAssistantMessage(
    runtimeKey: string,
    cloudConversationId: string | null,
    chatMessage: ChatMessage,
    status: 'completed' | 'failed' | 'stopped',
  ) {
    if (!cloudConversationId || aiAssistant.runtimeIdentityKey !== runtimeKey || !chatMessage.content) return null;
    const sources = (chatMessage.sources || []).map(localSourceToCloud);
    const knownSourceIds = new Set(sources.map((source) => source.sourceId));
    const evidence = (chatMessage.evidence || []).filter((item) => knownSourceIds.has(item.sourceId));
    try {
      const saved = await saveAiCloudMessage(cloudConversationId, {
        requestId: chatMessage.requestId || `assistant:${chatMessage.id}`,
        parentMessageId: chatMessage.parentMessageId,
        versionGroupId: chatMessage.versionGroupId,
        traceId: chatMessage.traceId,
        role: 'assistant',
        content: chatMessage.content,
        status,
        activity: chatMessage.activity || [],
        coverage: chatMessage.coverage || null,
        modelMeta: chatMessage.recovered
          ? { recovered: true, stage: chatMessage.stage || null, terminal: chatMessage.terminal || null }
          : null,
        sources,
        evidence,
      });
      if (aiAssistant.runtimeIdentityKey === runtimeKey) {
        chatMessage.cloudId = saved.id;
        chatMessage.versionGroupId = saved.versionGroupId || chatMessage.versionGroupId;
      }
      return saved;
    } catch (error) {
      if (isConversationNotFoundError(error)) clearMissingCloudConversation(cloudConversationId, runtimeKey);
      // 云端保存失败只影响跨端历史；本地持久化仍保留当前结果。
      return null;
    }
  }

  onMounted(() => {
    aiAssistant.initializePersistence();
    activateConversation();
    fetchAiQuota();
    void nextTick(() => startFollowObservers());
  });

  watch(conversationRuntimeIdentityKey, () => {
    activateConversation();
  });

  watch(
    () => user.preferences.aiCloudHistory,
    (enabled) => {
      if (enabled !== false) return;
      cloudConversationCreation = null;
      lineageConversationId.value = '';
      aiAssistant.setCloudConversationId('');
    },
  );

  // 每轮回复结束(isLoading 落定)后刷新额度,数字实时反映本次消耗
  watch(isLoading, (v) => {
    if (!v) {
      fetchAiQuota();
      persistHistory(); // 一轮回复落定后落地历史
    }
  });

  // 清空对话
  async function clearHistory() {
    // 新建对话时先明确中止旧流，避免旧回答在新会话清空后继续写入，也避免 UI 保持“处理中”。
    if (isLoading.value) stopResponse('cancelled');
    activeAnswerTypewriter = null;
    aiAssistant.clearCurrentConversation(t('ai.greeting'));
    resetScrollState();
    if (!user.id || user.role === 'visitor') return true;
    try {
      const attachmentResult = await clearAiTemporaryAttachments();
      return attachmentResult.failed === 0;
    } catch {
      return false;
    }
  }

  const cancelScheduledScroll = () => {
    if (scrollFrame === null) return;
    window.cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
  };

  // 回答后的来源属于正文尾部：原本在底部就继续跟随，主动向上阅读时才冻结位置。
  const prepareViewportForPostAnswerContent = () => {
    const container = messagesContainer.value;
    const preservedScrollTop = container?.scrollTop ?? null;
    const wasFollowing = Boolean(
      shouldFollowMessages.value || (container && shouldResumeAiChatFollow(getAiChatBottomDistance(container))),
    );
    cancelScheduledScroll();

    return () => {
      const currentContainer = messagesContainer.value;
      if (!currentContainer || preservedScrollTop === null) return;
      const viewport = resolveAiChatPostAnswerViewport(currentContainer, preservedScrollTop, wasFollowing);
      currentContainer.scrollTop = viewport.scrollTop;
      scrollTop.value = viewport.scrollTop;
      shouldFollowMessages.value = viewport.shouldFollow;
      showScrollToBottom.value = viewport.showScrollToBottom;
    };
  };

  const pauseFollowing = () => {
    shouldFollowMessages.value = false;
    const container = messagesContainer.value;
    showScrollToBottom.value = Boolean(
      container && shouldShowAiChatScrollPrompt(getAiChatBottomDistance(container), false),
    );
    cancelScheduledScroll();
  };

  // 流式渲染每帧全量重建消息 DOM,Markdown 结构在中途变化(表格成型、标题/代码块闭合等)会让渲染高度
  // 偶发非单调,把 scrollTop 瞬时 clamp 变小 —— handleScroll 会把这类抖动误判成"用户上滚"而暂停跟随。
  // 凡内容重渲染/程序滚动都标记一小段"抑制暂停"窗口:窗口内不据 scroll 事件暂停(但仍允许贴底 resume);
  // 用户真正的上滚由 wheel/touch 事件即时捕获(见 handleWheel/handleTouchMove),不受此窗口影响。
  const AI_SCROLL_PAUSE_SUPPRESS_MS = 250;
  let suppressScrollPauseUntil = 0;
  const suppressScrollPause = () => {
    suppressScrollPauseUntil = performance.now() + AI_SCROLL_PAUSE_SUPPRESS_MS;
  };

  // 一帧最多滚动一次，连续 token 不再叠加多个 smooth 动画。
  const scheduleScrollToBottom = (force = false) => {
    if (!messagesContainer.value || (!force && !shouldFollowMessages.value)) return;
    // 明确发送新问题时，前一帧可能还排着“点击追问后输入框布局变化”的旧滚动。
    // 此时必须以实际插入消息后的滚动替换它，不能因为已有 rAF 而错过新消息。
    if (scrollFrame !== null) {
      if (!force) return;
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = null;
    }
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null;
      const container = messagesContainer.value;
      if (!container || (!force && !shouldFollowMessages.value)) return;
      // scrollTop 的合法最大值是 scrollHeight - clientHeight。直接赋 scrollHeight 会依赖浏览器
      // 自动钳制，在容器高度同帧变化时可能产生一次越界回弹。
      container.scrollTop = getAiChatMaxScrollTop(container);
      scrollTop.value = container.scrollTop;
      showScrollToBottom.value = false;
      suppressScrollPause();
    });
  };

  // 回答落定后,来源揭示、以及 cloudId 落库后才挂出的操作按钮(点赞/保存笔记等)会在"消息条数不变"的
  // 情况下撑高当前这条消息 —— messages.length 监听器看不到、单次滚动也够不到,这正是"回答完看不到底部按钮"
  // 的根因。用 MutationObserver 盯消息区 DOM 变化(揭示/挂按钮)+ ResizeObserver 盯滚动区被兄弟节点
  // (推荐条/@材料区/输入框)挤矮:只要用户仍在跟随底部,任何后到内容都续贴到底;用户一上滚
  // (shouldFollowMessages 置否)即自动停贴,不打扰主动向上阅读。
  let followMutation: MutationObserver | null = null;
  let followResize: ResizeObserver | null = null;
  const startFollowObservers = () => {
    const container = messagesContainer.value;
    if (!container) return;
    if (!followMutation && typeof MutationObserver !== 'undefined') {
      followMutation = new MutationObserver(() => {
        suppressScrollPause();
        if (shouldFollowMessages.value) scheduleScrollToBottom();
      });
      followMutation.observe(container, { childList: true, subtree: true, characterData: true });
    }
    if (!followResize && typeof ResizeObserver !== 'undefined') {
      followResize = new ResizeObserver(() => {
        suppressScrollPause();
        if (shouldFollowMessages.value) scheduleScrollToBottom();
      });
      followResize.observe(container);
    }
  };
  const stopFollowObservers = () => {
    followMutation?.disconnect();
    followMutation = null;
    followResize?.disconnect();
    followResize = null;
  };

  const handleScroll = () => {
    const container = messagesContainer.value;
    if (!container) return;
    const distance = getAiChatBottomDistance(container);
    const movedUp = isAiChatUpwardScroll(scrollTop.value, container.scrollTop);
    scrollTop.value = container.scrollTop;
    // 流式重渲染/程序滚动引起的 scrollTop 抖动不当作用户上滚(见 suppressScrollPause 注释);
    // 但仍保留"贴底即恢复跟随",这样抖动后 distance 仍≤阈值时会稳稳留在跟随态。
    const suppressPause = performance.now() < suppressScrollPauseUntil;
    // 触摸设备由累计手势阈值判断意图，避免回弹或几像素抖动立即弹出“到底部”。
    if (movedUp && !suppressPause && touchStartY === null && !bookmark.isTouchDevice) {
      pauseFollowing();
      return;
    }
    if (shouldResumeAiChatFollow(distance)) shouldFollowMessages.value = true;
    else if (shouldPauseAiChatFollow(distance) && !suppressPause) shouldFollowMessages.value = false;
    showScrollToBottom.value = shouldShowAiChatScrollPrompt(distance, shouldFollowMessages.value);
  };

  const handleWheel = (event: WheelEvent) => {
    if (isAiChatUpwardWheel(event.deltaY)) pauseFollowing();
  };

  const handleTouchStart = (event: TouchEvent) => {
    touchStartY = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: TouchEvent) => {
    const currentY = event.touches[0]?.clientY;
    if (typeof currentY !== 'number') return;
    if (isAiChatUpwardTouch(touchStartY, currentY)) pauseFollowing();
  };

  const handleTouchEnd = () => {
    touchStartY = null;
  };

  // 处理点击跳转到底部
  const handleScrollToBottomClick = () => {
    shouldFollowMessages.value = true;
    showScrollToBottom.value = false;
    scheduleScrollToBottom(true);
  };

  // 重置滚动状态
  const resetScrollState = () => {
    shouldFollowMessages.value = true;
    showScrollToBottom.value = false;
    nextTick(() => scheduleScrollToBottom(true));
  };

  // 暂停响应
  const stopResponse = (reason: 'user' | 'cancelled' = 'user') => {
    if (!isLoading.value) return; // 已完成的消息不加暂停标记
    const currentMessageId = activeAssistantMessageId.value;
    const currentMsg = currentMessageId ? messages.value.find((item) => item.id === currentMessageId) : null;
    const restoreViewport = currentMsg?.sources?.length ? prepareViewportForPostAnswerContent() : null;
    finalizeAiRound('stopped', currentMsg || null, { cancelled: reason === 'cancelled' });
    aiAssistant.abortActiveRequest();
    activeAnswerTypewriter = null;
    if (currentMsg?.role === 'assistant') {
      const suffix = t('ai.responsePaused');
      if (!currentMsg.content || currentMsg.content === '') {
        currentMsg.content = suffix;
      } else if (!currentMsg.content.endsWith(suffix)) {
        currentMsg.content += suffix;
      }
      currentMsg.recommendationPending = false;
      currentMsg.recommendationReady = true;
      currentMsg.recommendations = [];
    }
    if (restoreViewport) nextTick(restoreViewport);
    persistHistory();
  };

  async function prepareAttachmentAction(request: AiAttachmentActionRequest) {
    if (isLoading.value) throw new Error(t('ai.attachmentAction.waitForReply'));
    const runtimeKey = aiAssistant.runtimeIdentityKey;
    const prepared = await prepareAiAttachmentAction({
      sessionId: sessionId.value,
      toolName: request.toolName,
      args: request.args,
    });
    // 往返期间若发生身份切换(管理员切换代管上下文 / 登录态刷新 / 退出),旧主体的确认卡与 sessionId
    // 不得写入已切换到新主体的 UI(四维隔离:旧请求晚到不进新 subject)。
    if (aiAssistant.runtimeIdentityKey !== runtimeKey) return;
    sessionId.value = prepared.sessionId;

    const confirmation = 'confirmation' in prepared ? prepared.confirmation : null;
    const interaction = 'interaction' in prepared ? prepared.interaction : null;
    const target =
      confirmation?.preview?.target ||
      String(request.args.fileName || request.args.title || t('ai.attachmentAction.currentAttachment'));
    const actionId = confirmation?.id || interaction?.id;
    if (!actionId) throw new Error(t('ai.attachmentAction.prepareFailed'));
    const transientGroupId = `attachment-action:${actionId}`;
    messages.value.push({
      id: createAiAssistantMessageId('user'),
      role: 'user',
      content: t('ai.attachmentAction.requestSummary', {
        action: t(`ai.tools.${request.toolName}`, request.toolName),
        target,
      }),
      timestamp: new Date(),
      transient: true,
      transientGroupId,
    });
    messages.value.push({
      id: createAiAssistantMessageId('assistant'),
      role: 'assistant',
      content: confirmation ? t('ai.attachmentAction.confirmationReady') : t('ai.attachmentAction.choiceRequired'),
      timestamp: new Date(),
      confirmations: confirmation ? [confirmation] : [],
      interactions: interaction ? [interaction] : [],
      transient: true,
      transientGroupId,
      pendingConfirmationIds: confirmation ? [confirmation.id] : [],
      pendingInteractionIds: interaction ? [interaction.id] : [],
    });
    aiAssistant.markEdgeNeedsAttention();
    persistHistory();
    resetScrollState();
  }

  // 重新设计打字机效果，确保内容完整且逐字显示
  const sendMessage = async (
    options: {
      inputText?: string;
      materialSnapshot?: AiAssistantMaterialSnapshot;
      clearComposer?: boolean;
      parentMessageId?: string;
      versionGroupId?: string;
      historySnapshot?: ChatMessage[];
    } = {},
  ) => {
    if (isLoading.value || cloudRecoveryPending.value || latestConversationChoicePending) return;
    // 每次开始新的提问时，重置自动滚动状态，确保本轮对话自动跟随到底部
    shouldFollowMessages.value = true;
    showScrollToBottom.value = false;
    // 重置当前轮消息的思考状态，仅影响新创建的AI消息
    hasAnswerStarted.value = false;
    const inputText = (options.inputText ?? userInput.value).trim();
    if (!inputText) return;
    const materialSnapshot =
      options.materialSnapshot || createAiAssistantMaterialSnapshot(contexts.value, attachments.value);
    const contextSnapshot = materialSnapshot.contextRefs;
    const attachmentSnapshot = materialSnapshot.attachmentRefs;
    if (attachmentSnapshot.some((item) => item.status === 'awaiting_upload')) return;
    const cloudPreparation = await prepareCloudConversationForSend(aiAssistant.runtimeIdentityKey);
    if (cloudPreparation === 'cancelled') return;
    activeAnswerTypewriter?.cancel();
    activeAnswerTypewriter = null;

    // 会话上下文快照:本轮问题「之前」的完整对话(显示多少发多少,保证 AI 记得的=你看得到的)。
    // 后端会按预算截最近部分兜底。此处在推入本轮问题前取,故不含当前这句。
    const historyForRequest = (
      cloudPreparation === 'replaced' ? messages.value : options.historySnapshot || messages.value
    )
      .filter(
        (m) => m.content && !m.transient && !hasPendingAgentActions(m) && (m.role === 'user' || m.role === 'assistant'),
      )
      .map((m) => ({ role: m.role, content: String(m.content) }));
    // 对话较长时提醒新建会话(一次性):更快、更省 AI 额度
    const histChars = historyForRequest.reduce((n, m) => n + m.content.length, 0);
    if (histChars > 11000 && !longChatHinted.value) {
      longChatHinted.value = true;
      message.info(t('ai.longConversationHint'));
    }

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: createAiAssistantMessageId('user'),
      role: 'user',
      content: inputText,
      timestamp: new Date(),
      contexts: contextSnapshot.map((item) => ({ ...item })),
      contextRefs: contextSnapshot,
      attachmentRefs: attachmentSnapshot,
      parentMessageId: cloudPreparation === 'replaced' ? undefined : options.parentMessageId,
    };
    messages.value.push(userMessage);

    // 添加AI消息占位
    const aiMessage: ChatMessage = {
      id: createAiAssistantMessageId('assistant'),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      recommendations: [],
      recommendationReady: false,
      // 回答完成且服务端明确提供 follow-up requestId 后才进入 pending。
      // 提前置 true 会让空追问栏在“正在理解”阶段重新占回 40px，造成滚动回弹。
      recommendationPending: false,
      parentMessageId: userMessage.id,
      versionGroupId: cloudPreparation === 'replaced' ? undefined : options.versionGroupId,
    };
    messages.value.push(aiMessage);
    const requestLease = aiAssistant.beginRequest(aiMessage.id);
    const requestController = requestLease.controller;
    const cloudRuntimeKey = requestLease.runtimeIdentityKey;
    const cloudUserSavePromise = persistCloudUserMessage(cloudRuntimeKey, userMessage);
    let savedCloudUserMessage: AiCloudMessage | null = null;
    activeRoundTelemetry = {
      assistantMessageId: aiMessage.id,
      startedAt: Date.now(),
      requestId: '',
      materialCount: contextSnapshot.length + attachmentSnapshot.length,
      materialType: aiTelemetryMaterialType(contextSnapshot, attachmentSnapshot.length),
      scopeMode: scopeMode.value === 'workspace' ? 'all_resources' : 'selected',
      firstActivityRecorded: false,
      firstTokenRecorded: false,
      finalized: false,
    };
    void recordAiProductEvent('ai_prompt_submitted', {
      ...aiRoundDimensions(activeRoundTelemetry),
      lengthBucket: aiLengthBucket(inputText.length),
      stage: 'planning',
    });

    if (options.clearComposer !== false) userInput.value = '';
    await nextTick();
    if (!aiAssistant.isRequestCurrent(requestLease)) return;
    // 用户主动发送后，消息已经真正插入 DOM；无论此前是否因上滚暂停跟随，都应让本轮问题进入视口。
    scheduleScrollToBottom(true);

    // 网络分片只负责入队，屏幕按固定绘制帧稳定吐字。这样即使 XHR 一次回调积攒了整段文本，
    // 用户看到的仍是连续打字效果，而不是忽快忽慢的整段跳出。
    const answerTypewriter = createAiStreamTypewriter({
      onText: (content) => {
        if (!aiAssistant.isRequestCurrent(requestLease)) return;
        // aiMessage 是 push 前的普通对象；必须从响应式数组中取 Proxy 再修改，否则内容只会在
        // isLoading 结束时一次性渲染，用户看不到逐帧打字过程。
        const aiMessageIndex = messages.value.findIndex((item) => item.id === aiMessage.id);
        if (!appendAiStreamMessageContent(messages.value, aiMessageIndex, content)) return;
        if (shouldFollowMessages.value) scheduleScrollToBottom();
      },
      // 后台标签页没有可见动画，直接排空，避免浏览器暂停 rAF 后请求迟迟无法完成清理。
      shouldFlushImmediately: () =>
        (typeof document !== 'undefined' && document.visibilityState === 'hidden') ||
        (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true),
    });
    activeAnswerTypewriter = answerTypewriter;
    aiAssistant.attachRequestTypewriter(requestLease, answerTypewriter);

    let streamError: string | null = null; // 后端流式返回的错误帧(data.error)，流结束后统一处理
    let responseStatus: 'completed' | 'failed' | 'stopped' = 'completed';
    let followUpRequestId = '';
    let followUpAvailable = false;
    let shouldLoadFollowUp = false;
    let lastEventId = 0;
    let reliableTerminalReceived = false;
    let recoveryAttempted = false;
    let recoveryApplied = false;
    let authoritativeAnswerSnapshot: string | null = null;
    let terminalErrorCode: unknown = '';
    const handleNewContent = (content: string) => {
      if (!content) return;
      if (!aiAssistant.isRequestCurrent(requestLease)) return;
      answerTypewriter.enqueue(content);
    };

    try {
      let buffer = '';
      let processedLength = 0;

      const handleData = (data: AiSseEvent) => {
        // 用户中断后可能仍收到最后一个网络分片；旧请求的工具/确认事件不能挂到新一轮消息上。
        if (!aiAssistant.isRequestCurrent(requestLease)) return;
        const aiMessageIndex = messages.value.findIndex((item) => item.id === aiMessage.id);
        const userMessageIndex = messages.value.findIndex((item) => item.id === userMessage.id);
        if (aiMessageIndex < 0) return;
        try {
          const currentMsg = messages.value[aiMessageIndex];
          if (currentMsg && data.requestId) currentMsg.requestId = String(data.requestId);
          updateAiRoundRequestId(data.requestId);
          const eventId = Number(data.eventId);
          if (Number.isSafeInteger(eventId) && eventId > lastEventId) lastEventId = eventId;
          if (['response.completed', 'done', 'response.failed', 'error'].includes(String(data.event || ''))) {
            reliableTerminalReceived = true;
          }
          if (data.event === 'response.failed' || data.event === 'error') {
            responseStatus = 'failed';
            terminalErrorCode = data.error || 'AI_RESPONSE_FAILED';
            if (data.message) streamError = data.message;
          }
          if (data.event !== 'heartbeat') markAiFirstActivity(data);

          // 后端流式出错时会推送 { error, message } 帧：记下来、标记已开始(停思考流)，
          // 交给流结束后统一显示 —— 不在此直接改内容，避免与打字机争用当前消息
          if (data.error) {
            streamError = data.message || data.error || t('ai.errorMessage');
            terminalErrorCode = data.error;
            responseStatus = 'failed';
            hasAnswerStarted.value = true;
            return;
          }

          if (currentMsg && (data.event === 'stage.changed' || data.event === 'heartbeat') && data.stage) {
            const activity = [...(currentMsg.activity || [])];
            const existing = activity.findIndex(
              (item) => typeof item === 'object' && item.kind === 'stage' && item.stage === data.stage,
            );
            const nextActivity = {
              kind: 'stage',
              stage: data.stage,
              status: data.event === 'heartbeat' ? 'running' : 'started',
              elapsedMs: Number(data.elapsedMs || 0),
            };
            if (existing >= 0) activity[existing] = nextActivity;
            else activity.push(nextActivity);
            currentMsg.activity = activity;
          }

          if (currentMsg && data.event === 'memory_context') {
            const memoryActivity = toAiMemoryInfluenceActivity(data);
            if (memoryActivity) {
              currentMsg.activity = [
                ...(currentMsg.activity || []).filter(
                  (item) => typeof item !== 'object' || String(item.event || '') !== 'memory_context',
                ),
                memoryActivity,
              ];
            }
          }

          if (data.event === 'tool_confirmation' && data.confirmation) {
            const currentMsg = messages.value[aiMessageIndex];
            // 按 id 去重:SSE 重连/重放/后端补发时,同一确认不重复入列(避免重复 Vue key 与重复渲染)。
            if (currentMsg && !(currentMsg.confirmations || []).some((item) => item.id === data.confirmation.id)) {
              currentMsg.confirmations = [...(currentMsg.confirmations || []), data.confirmation];
              markConversationConfirmationPending(
                messages.value,
                userMessageIndex,
                aiMessageIndex,
                data.confirmation.id,
                `agent-action:${requestLease.epoch}`,
              );
            }
          }

          if (data.event === 'interaction_required' && data.interaction) {
            const currentMsg = messages.value[aiMessageIndex];
            if (currentMsg) {
              const interactions = [...(currentMsg.interactions || []), data.interaction];
              currentMsg.interactions = interactions.filter(
                (interaction, interactionIndex, all) =>
                  all.findIndex((item) => item.id === interaction.id) === interactionIndex,
              );
              markConversationInteractionPending(
                messages.value,
                userMessageIndex,
                aiMessageIndex,
                data.interaction.id,
                `agent-action:${requestLease.epoch}`,
              );
            }
          }

          if ((data.event === 'tool_start' || data.event === 'tool_result') && typeof data.tool === 'string') {
            const currentMsg = messages.value[aiMessageIndex];
            if (currentMsg) {
              const round = Number(data.round || 1);
              const status =
                data.event === 'tool_start'
                  ? 'running'
                  : data.status === 'confirmation_required'
                    ? 'confirmation_required'
                    : data.status === 'interaction_required'
                      ? 'interaction_required'
                      : data.status === 'success'
                        ? 'success'
                        : 'error';
              const items = [...(currentMsg.toolEvents || [])];
              const existing = items.findIndex((item) => item.name === data.tool && Number(item.round || 1) === round);
              const nextItem: AiToolStatusItem = { name: data.tool, status, round };
              if (existing >= 0) items[existing] = nextItem;
              else items.push(nextItem);
              currentMsg.toolEvents = items;
            }
          }

          if (data.event === 'sources' && Array.isArray(data.sources)) {
            if (currentMsg) {
              const merged = [...(currentMsg.sources || []), ...data.sources];
              currentMsg.sources = merged.filter(
                (source, index, all) =>
                  all.findIndex((item) => item.type === source.type && item.id === source.id) === index,
              );
              if (Array.isArray(data.evidence)) {
                const mergedEvidence = [...(currentMsg.evidence || []), ...data.evidence];
                currentMsg.evidence = mergedEvidence.filter(
                  (item, index, all) =>
                    all.findIndex((candidate) => candidate.evidenceRef === item.evidenceRef) === index,
                );
              }
              if (data.coverage && typeof data.coverage === 'object') currentMsg.coverage = data.coverage;
              if (data.citationAudit) currentMsg.citationAudit = data.citationAudit;
              if (shouldFollowMessages.value) void nextTick(() => scheduleScrollToBottom());
            }
          }

          if (currentMsg && data.event === 'citations' && Array.isArray(data.evidence)) {
            currentMsg.evidence = data.evidence;
            if (data.citationAudit) currentMsg.citationAudit = data.citationAudit;
          }

          if (currentMsg && data.event === 'coverage' && data.coverage && typeof data.coverage === 'object') {
            currentMsg.coverage = data.coverage;
          }

          if (currentMsg && data.event === 'response.completed') {
            if (data.coverage && typeof data.coverage === 'object') currentMsg.coverage = data.coverage;
            if (data.citationAudit) currentMsg.citationAudit = data.citationAudit;
            if (typeof data.answer === 'string') authoritativeAnswerSnapshot = data.answer;
          }

          if (data.event === 'done') {
            followUpRequestId = String(data.requestId || '').trim();
            followUpAvailable = data.followUpAvailable === true;
          }

          const content = data.output?.text || data.text || data.content || '';

          if (content && typeof content === 'string') {
            markAiFirstToken();
            handleNewContent(content);
            // 一旦答案开始输出，标记并停止后续思考流
            hasAnswerStarted.value = true;
          }

          if (data.output?.session_id) {
            aiAssistant.setSessionIdForRequest(requestLease, data.output.session_id);
          }
        } catch (e) {
          console.warn('处理 AI 流式事件失败，已跳过:', data.event || 'unknown');
        }
      };

      const handleChunk = (chunk: string) => {
        const parsed = consumeAiSseChunk(buffer, chunk);
        buffer = parsed.buffer;
        parsed.events.forEach(handleData);
      };

      // Agent 模式：统一走 DeepSeek，不再区分 DashScope
      // 候选记忆只允许引用服务端已归属校验的云端消息；保存失败时保持普通聊天，不下发伪造的本地 ID。
      savedCloudUserMessage = await cloudUserSavePromise;
      if (!aiAssistant.isRequestCurrent(requestLease)) return;
      await apiBasePost(
        '/api/chat/agent',
        {
          message: inputText,
          stream: true,
          sessionId: sessionId.value,
          enableTranslation: enableTranslation.value,
          translationConfig: translationConfig.value,
          aiStyle: (user.preferences as any)?.aiStyle || 'balanced',
          history: historyForRequest,
          contexts: contextSnapshot,
          attachmentIds: attachmentSnapshot.map((item) => item.id),
          scope: { mode: scopeMode.value, externalWeb: false },
          // 长期记忆已关闭:不再请求 active(否则后端会读取/注入/推断并写入候选,而前端已无任何查看/停用/删除入口——
          // 属隐私控制面与运行面脱节)。临时会话本就不涉记忆,保持 temporary。
          memoryMode: temporarySession.value ? 'temporary' : 'off',
          ...(savedCloudUserMessage?.conversationId && savedCloudUserMessage.id
            ? {
                conversationId: savedCloudUserMessage.conversationId,
                sourceMessageId: savedCloudUserMessage.id,
              }
            : {}),
          clientCapabilities: [...AI_AGENT_CLIENT_CAPABILITIES],
          locale: locale.value,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          responseType: 'text',
          signal: requestController.signal,
          onDownloadProgress: (progressEvent) => {
            const event = (progressEvent as any).event ?? progressEvent;
            const responseText = (event?.target as XMLHttpRequest | null)?.responseText ?? '';
            if (!responseText) return;

            const newText = responseText.slice(processedLength);
            if (!newText) return;

            processedLength = responseText.length;
            handleChunk(newText);
          },
        },
      );

      // 处理缓冲区剩余数据
      flushAiSseBuffer(buffer).forEach(handleData);

      // HTTP 正常结束但缺少协议终态同样属于流异常，不能把截断回答误标成成功。
      if (!reliableTerminalReceived) {
        const terminalError = new Error('AI stream ended without a terminal event') as Error & { code?: string };
        terminalError.code = 'AI_STREAM_TERMINAL_MISSING';
        throw terminalError;
      }

      // 后端结束不等于视觉输出结束；等逐帧队列排空后再切换为最终 Markdown，避免尾部突然跳出。
      await answerTypewriter.drain();
      if (!aiAssistant.isRequestCurrent(requestLease)) return;
      if (authoritativeAnswerSnapshot !== null) {
        const current = messages.value.find((item) => item.id === aiMessage.id);
        if (current) current.content = authoritativeAnswerSnapshot;
      }

      // 后端流式返回错误帧：已有半截内容则保留并追加友好提示。
      if (streamError && aiAssistant.isRequestCurrent(requestLease)) {
        const errText = streamError || t('ai.errorMessage');
        const current = messages.value.find((item) => item.id === aiMessage.id);
        if (current) current.content = current.content ? `${current.content}\n\n${errText}` : errText;
      }
      // @资源改为粘性(与本地上传文件一致):回答后不再自动清除,chip 保留在输入框、每轮继续随请求携带,
      // 后端每轮重新注入正文 → AI 后续轮持续可见;用户可手动移除。输入框文本仍在发送前清空(见 clearComposer 分支)。
    } catch (error: any) {
      // 旧请求的异常，不再修改当前消息
      if (!aiAssistant.isRequestCurrent(requestLease)) return;

      if (axios.isCancel(error) || error?.code === 'ERR_CANCELED' || requestController.signal.aborted) {
        responseStatus = 'stopped';
        // stopResponse 已处理消息标记，这里只需清理
      } else {
        responseStatus = 'failed';
        terminalErrorCode = error?.code || 'AI_STREAM_FAILED';
        console.warn('AI 流异常:', safeAiErrorCode(terminalErrorCode));
        await answerTypewriter.drain();
        if (!aiAssistant.isRequestCurrent(requestLease)) return;
        const current = messages.value.find((item) => item.id === aiMessage.id);
        const recoveryRequestId = String(current?.requestId || activeRoundTelemetry?.requestId || '').trim();
        if (
          current &&
          shouldAttemptAiStreamRecovery({
            attempted: recoveryAttempted,
            requestCurrent: aiAssistant.isRequestCurrent(requestLease),
            requestId: recoveryRequestId,
            reliableTerminalReceived,
            cancelled: requestController.signal.aborted,
          })
        ) {
          recoveryAttempted = true;
          // 给服务端 close → 终态聚合 → 短期快照落库留出一个很小的窗口；仍只发起一次恢复请求。
          await new Promise((resolve) => setTimeout(resolve, 160));
          if (aiAssistant.isRequestCurrent(requestLease)) {
            try {
              const recovered = await recoverAiAgentResponse(
                { requestId: recoveryRequestId, ...(lastEventId > 0 ? { lastEventId } : {}) },
                { signal: requestController.signal },
              );
              if (
                recovered.recovered !== true ||
                recovered.requestId !== recoveryRequestId ||
                recovered.snapshot.requestId !== recoveryRequestId
              ) {
                throw new Error('AI_RESPONSE_RECOVERY_REQUEST_MISMATCH');
              }
              if (!aiAssistant.isRequestCurrent(requestLease)) return;
              answerTypewriter.cancel();
              responseStatus = applyAiRecoverySnapshot(current, recovered.snapshot);
              recoveryApplied = true;
              reliableTerminalReceived = true;
              lastEventId = Math.max(lastEventId, Number(recovered.lastEventId || recovered.snapshot.lastEventId || 0));
              updateAiRoundRequestId(recoveryRequestId);
              if (recovered.snapshot.sessionId) {
                aiAssistant.setSessionIdForRequest(requestLease, recovered.snapshot.sessionId);
              }
              if (current.content) {
                hasAnswerStarted.value = true;
                markAiFirstToken();
              }
              terminalErrorCode = recovered.snapshot.terminal.error || terminalErrorCode;
              streamError =
                responseStatus === 'failed'
                  ? recovered.snapshot.terminal.message || streamError || t('ai.errorMessage')
                  : null;
              const round = activeRoundTelemetry;
              if (round) {
                void recordAiProductEvent('ai_error_recovered', {
                  ...aiRoundDimensions(round),
                  durationBucket: aiDurationBucket(Date.now() - round.startedAt),
                  lengthBucket: aiLengthBucket(current.content.length),
                  sourceCount: current.sources?.length || 0,
                  stage: responseStatus === 'completed' ? 'completed' : 'failed',
                  outcome: responseStatus === 'completed' ? 'recovered' : 'failed',
                  retryable: false,
                });
              }
            } catch {
              // 快照不存在、尚未形成终态、过期或再次断网时，保留原始流错误与已显示的部分内容。
            }
          }
        }

        if (!aiAssistant.isRequestCurrent(requestLease)) return;
        if (!recoveryApplied || responseStatus === 'failed') {
          const errorText = streamError || t('ai.errorMessage');
          if (current && errorText && !current.content.endsWith(errorText)) {
            current.content = current.content ? `${current.content}\n\n${errorText}` : errorText;
          }
        }
      }
    } finally {
      // 仅最新请求才能更新状态，防止旧请求的 finally 提前关闭 loading
      if (!aiAssistant.isRequestCurrent(requestLease)) return;

      const wasLoading = isLoading.value;
      let followAtRoundEnd = false;
      const currentMessage = messages.value.find((item) => item.id === aiMessage.id);
      shouldLoadFollowUp = Boolean(
        responseStatus === 'completed' && !streamError && followUpAvailable && followUpRequestId,
      );
      if (currentMessage) {
        currentMessage.recommendationPending = shouldLoadFollowUp;
        if (!shouldLoadFollowUp) {
          currentMessage.recommendationReady = true;
          currentMessage.recommendations = [];
        }
      }
      const restoreViewport =
        wasLoading && currentMessage?.sources?.length ? prepareViewportForPostAnswerContent() : null;
      finalizeAiRound(responseStatus, currentMessage || null, { errorCode: terminalErrorCode });
      aiAssistant.finishRequest(
        requestLease,
        resolveAiAssistantRequestEdgeStatus(
          responseStatus,
          Boolean(currentMessage && hasPendingAgentActions(currentMessage)),
        ),
      );
      if (activeAnswerTypewriter === answerTypewriter) activeAnswerTypewriter = null;
      aiAssistant.clearRequestTypewriter(requestLease, answerTypewriter);
      if (wasLoading) {
        await nextTick();
        if (restoreViewport) restoreViewport();
        else scheduleScrollToBottom();
        // 记住"回答结束这一刻是否在跟随底部":cloudId 落库挂出按钮后据此决定要不要补滚到底(见下方持久化回调)。
        followAtRoundEnd = shouldFollowMessages.value;
      }
      if (currentMessage && !hasPendingAgentActions(currentMessage)) {
        if (savedCloudUserMessage?.id) currentMessage.parentMessageId = savedCloudUserMessage.id;
        const persistence = persistCloudAssistantMessage(
          cloudRuntimeKey,
          savedCloudUserMessage?.conversationId || conversationId.value || null,
          currentMessage,
          responseStatus,
        );
        // AiResultActions(点赞/点踩/保存/追加/合并)要等 cloudId 落定后才渲染;此前的滚动只到"参考来源"为止,
        // 之后这些按钮出现在折叠线以下就滚不到了。cloudId 落定后若用户仍在跟随底部,补滚一次让按钮进入视野。
        void persistence
          .then(() => {
            if (!aiAssistant.isRequestCurrent(requestLease)) return;
            // cloudId 落库这拍才挂出操作按钮。若回答结束时用户仍在跟随底部,则复位跟随态并补滚一次,
            // 保证按钮进入视野(其余后到内容由上面的 MutationObserver/ResizeObserver 兜住)。
            if (followAtRoundEnd) {
              shouldFollowMessages.value = true;
              void nextTick(() => scheduleScrollToBottom());
            }
          })
          .catch(() => {});
        if (recoveryApplied) await persistence;
      }
    }

    if (shouldLoadFollowUp) {
      void loadFollowUpRecommendations({
        requestId: followUpRequestId,
        messageId: aiMessage.id,
        requestLease,
      });
    }
  };

  async function loadFollowUpRecommendations({
    requestId,
    messageId,
    requestLease,
  }: {
    requestId: string;
    messageId: string;
    requestLease: AiAssistantRequestLease;
  }) {
    let suggestions: string[] = [];
    try {
      const result = await fetchAiFollowUps(requestId);
      suggestions = result.suggestions;
    } catch {
      // 动态生成失败时恢复当前页面的高价值固定问题，不弹全局错误打断阅读。
    }
    if (!aiAssistant.isRequestCurrent(requestLease)) return;
    const target = messages.value.find((item) => item.id === messageId);
    if (!target || target.role !== 'assistant' || target !== messages.value[messages.value.length - 1]) return;
    target.recommendations = suggestions;
    target.recommendationPending = false;
    target.recommendationReady = true;
    persistHistory();
  }

  // 常见问题与回答后的推荐项是一键提问；附件提示词仍由 ChatInputSection 负责回填并允许修改。
  const handleRecommendationClick = createQuickQuestionDispatcher({
    isBusy: () => isLoading.value,
    send: (question) => sendMessage({ inputText: question }),
  });

  // 编辑用户消息：把该条内容回填到输入框并聚焦，不自动发送（让用户改完再发）
  const handleEditMessage = (content: string, attachedContexts: AiResourceContext[] = []) => {
    userInput.value = content;
    contexts.value = attachedContexts.map((item) => ({ ...item }));
    nextTick(() => {
      chatInputRef.value?.focus();
    });
  };

  const handleConfirmationResolved = async (index: number, resolution: AiToolConfirmationResolution) => {
    const target = messages.value[index];
    if (!target || !resolution.summary) return;
    target.content = `${target.content}${target.content ? '\n\n' : ''}${resolution.summary}`;
    const sources = resolution.sources.filter(
      (source): source is AiSource =>
        Boolean(source) && typeof source === 'object' && typeof (source as AiSource).type === 'string',
    );
    if (sources.length) {
      const merged = [...(target.sources || []), ...sources];
      target.sources = merged.filter(
        (source, sourceIndex, all) =>
          all.findIndex((item) => item.type === source.type && item.id === source.id) === sourceIndex,
      );
    }
    if (resolution.toolName === 'save_attachment_to_cloud' && attachments.value.length) {
      try {
        const refreshed = await fetchAiAttachmentStatuses(attachments.value.map((attachment) => attachment.id));
        if (refreshed.length) attachments.value = refreshed;
      } catch {
        // 保存操作本身已经成功，状态刷新失败不应把确认结果改成失败；后续轮询/重进会恢复。
      }
    }
    persistHistory();
  };

  const handleInteractionResolved = (
    index: number,
    interaction: AiAgentInteraction,
    resolution: AiAgentInteractionResolution,
  ) => {
    const target = messages.value[index];
    if (!target) return;
    if (resolution.state === 'confirmation_required') {
      const confirmations = [...(target.confirmations || []), resolution.confirmation];
      target.confirmations = confirmations.filter(
        (confirmation, confirmationIndex, all) =>
          all.findIndex((item) => item.id === confirmation.id) === confirmationIndex,
      );
      promoteConversationInteractionToConfirmation(messages.value, index, interaction.id, resolution.confirmation.id);
      resetScrollState();
      return;
    }
    if (resolution.state === 'edit_required') {
      if (!isEditableAttachmentTool(resolution.toolName)) return;
      const opened = chatInputRef.value?.openAttachmentAction(resolution.toolName, resolution.args) || false;
      if (!opened) message.warning(t('ai.attachmentAction.attachmentUnavailable'));
      else resetScrollState();
      return;
    }
    if (resolution.state === 'resolved' && resolution.summary) {
      target.content = `${target.content}${target.content ? '\n\n' : ''}${resolution.summary}`;
    }
  };

  const handleInteractionSettled = (index: number, settlement: AiAgentInteractionSettlement) => {
    settleConversationInteraction(messages.value, index, settlement);
    persistHistory();
  };

  const handleConfirmationEdit = (confirmation: AiToolConfirmation) => {
    if (!isEditableAttachmentTool(confirmation.toolName)) return;
    const opened = chatInputRef.value?.openAttachmentAction(confirmation.toolName, confirmation.args) || false;
    if (!opened) {
      message.warning(t('ai.attachmentAction.attachmentUnavailable'));
      return;
    }
    resetScrollState();
  };

  const handleConfirmationSettled = (index: number, settlement: AiToolConfirmationSettlement) => {
    settleConversationConfirmation(messages.value, index, settlement);
    persistHistory();
  };

  // 重新生成保留旧答案，并用原消息的不可变材料快照创建同一版本组的新分支。
  const handleRegenerate = async (index: number) => {
    if (isLoading.value || regenerationPreparing.value) return; // 生成中不打断
    let userIdx = index - 1;
    while (userIdx >= 0 && messages.value[userIdx].role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const originalUserMessage = messages.value[userIdx];
    const originalAnswer = messages.value[index];
    const materialSnapshot = createAiAssistantMaterialSnapshot(
      originalUserMessage.contextRefs || originalUserMessage.contexts || [],
      originalUserMessage.attachmentRefs || [],
    );
    regenerationPreparing.value = true;
    try {
      let versionGroupId = originalAnswer.versionGroupId || originalAnswer.cloudId || originalAnswer.id;
      if (cloudHistoryEnabled() && conversationId.value && originalAnswer.cloudId) {
        try {
          const prepared = await prepareAiMessageVersionGroup(conversationId.value, originalAnswer.cloudId);
          versionGroupId = prepared.versionGroupId;
        } catch {
          message.warning(t('ai.versions.prepareFailed'));
          return;
        }
      }
      originalAnswer.versionGroupId = versionGroupId;
      await sendMessage({
        inputText: originalUserMessage.content,
        materialSnapshot,
        clearComposer: false,
        parentMessageId: originalUserMessage.cloudId || originalUserMessage.id,
        versionGroupId,
        historySnapshot: messages.value.slice(0, userIdx),
      });
    } finally {
      regenerationPreparing.value = false;
    }
  };

  // 新消息、确认卡等块级内容出现时跟随一次；正文增量由 handleNewContent 逐帧调度。
  watch(
    () => messages.value.length,
    async (newLength, oldLength) => {
      if (newLength > oldLength && shouldFollowMessages.value) {
        await nextTick();
        scheduleScrollToBottom();
      }
    },
    { flush: 'post' },
  );

  // 进入生成态时把刚插入的用户消息和回答占位带入视口。
  watch(isLoading, async (newVal) => {
    if (newVal && shouldFollowMessages.value) {
      await nextTick();
      scheduleScrollToBottom();
    }
  });

  onBeforeUnmount(() => {
    cancelLatestConversationChoice();
    const activeMessage = activeAssistantMessageId.value
      ? messages.value.find((item) => item.id === activeAssistantMessageId.value) || null
      : null;
    finalizeAiRound('stopped', activeMessage, { cancelled: true });
    activeAnswerTypewriter = null;
    aiAssistant.abortActiveRequest();
    aiAssistant.flushPersistence();
    cancelScheduledScroll();
    stopFollowObservers();
  });
</script>

<style scoped>
  /* 原有其他样式保持不变 */
  .ai-chat-container {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    background: var(--background-color);
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    padding: 0;
    box-sizing: border-box;
  }

  .chat-wrapper {
    width: 100%;
    max-width: 1200px;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--background-color);
    border-radius: 16px;
    overflow: hidden;
    container: ai-chat / inline-size;
  }

  .ai-message-action-stack {
    display: grid;
    width: min(680px, calc(100% - 44px));
    gap: 8px;
    margin: -10px 0 16px 44px;
  }

  .ai-message-action-stack :deep(.ai-interaction-card),
  .ai-message-action-stack :deep(.tool-confirmation-card) {
    width: 100%;
    margin: 0;
  }

  @container ai-chat (max-width: 520px) {
    .ai-message-action-stack {
      width: 100%;
      margin: 4px 0 14px;
    }
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    overflow-anchor: none;
    padding: 0.6rem 1.5rem;
    position: relative;
    color: var(--text-color);
    scroll-behavior: auto;
  }

  .recommendation-dock {
    display: flex;
    min-width: 0;
    min-height: 40px;
    flex: 0 0 40px;
    align-items: center;
    padding: 0 1.5rem 4px;
    box-sizing: border-box;
    overflow: hidden;
    background: var(--background-color);
  }

  .ai-recommendation-fade-enter-active,
  .ai-recommendation-fade-leave-active {
    transition: opacity 0.16s ease;
  }

  .ai-recommendation-fade-enter-from,
  .ai-recommendation-fade-leave-to {
    opacity: 0;
  }

  @container ai-chat (max-width: 520px) {
    .recommendation-dock {
      padding-inline: 0.5rem;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes bounce {
    0%,
    20%,
    50%,
    80%,
    100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-3px);
    }
    60% {
      transform: translateY(-2px);
    }
  }

  @media (max-width: 600px) {
    .ai-chat-container {
      padding: 0;
    }
    .chat-wrapper {
      height: 100%;
      border-radius: 0;
    }
    .messages-container {
      padding: 0.75rem 0.5rem;
    }
    .message-content {
      max-width: 85%;
    }
    .input-section {
      padding: 1rem;
    }
    .avatar {
      width: 2rem;
      height: 2rem;
      font-size: 1rem;
    }

    /* 移动端调整滚动提示位置 */
    .scroll-prompt {
      bottom: 80px;
      right: 15px;
    }
  }

  @media (max-width: 480px) {
    .scroll-prompt {
      bottom: 70px;
      right: 10px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ai-recommendation-fade-enter-active,
    .ai-recommendation-fade-leave-active {
      transition: none;
    }
  }
</style>
