<template>
  <footer class="input-section">
    <div class="input-container">
      <div class="composer-context-row">
        <div v-if="hasCustomCapabilitySettings" class="capability-status-list" role="status">
          <BButton
            v-if="capabilityPolicyProfile !== 'auto'"
            size="small"
            class="capability-status-pill"
            :title="t('ai.capabilitySettings.restoreAutomatic')"
            :aria-label="t('ai.capabilitySettings.restoreAutomatic')"
            @click="$emit('update:capabilityPolicyProfile', 'auto')"
          >
            <SvgIcon :src="icon.settings.privacy" size="13" aria-hidden="true" />
            <span>{{ selectedCapabilityPolicyLabel }}</span>
            <SvgIcon :src="icon.common.close" size="10" aria-hidden="true" />
          </BButton>
          <BButton
            v-if="hasActiveTurnScope"
            size="small"
            class="capability-status-pill is-turn-scope"
            :title="t('ai.capabilitySettings.clearTurnScope')"
            :aria-label="t('ai.capabilitySettings.clearTurnScope')"
            @click="$emit('update:capabilityModule', 'auto')"
          >
            <SvgIcon :src="icon.settings.general" size="13" aria-hidden="true" />
            <span>{{ t('ai.capabilityScope.applied', { module: selectedCapabilityModuleLabel }) }}</span>
            <SvgIcon :src="icon.common.close" size="10" aria-hidden="true" />
          </BButton>
        </div>
        <AiMaterialHub
          v-if="capabilityPolicyProfile !== 'chat_only'"
          ref="materialHub"
          :model-value="contexts"
          :scope-model-value="scopeRefs"
          :attachments="attachments"
          :is-mobile="isMobile"
          :prepare-action-fn="prepareAttachmentActionFn"
          @update:model-value="$emit('update:contexts', $event)"
          @update:scope-model-value="$emit('update:scopeRefs', $event)"
          @update:attachments="$emit('update:attachments', $event)"
          @prompt="applyAttachmentPrompt"
          @clear="$emit('clearMaterials')"
        />
      </div>
      <div class="text-input-wrap">
        <BInput
          v-model:value="inputValue"
          type="textarea"
          submit-on-enter
          @enter="handleComposerEnter"
          @paste="handlePaste"
          @keydown="handleMentionKeydown"
          :placeholder="t('ai.inputPlaceholder')"
          :rows="1"
          ref="textInput"
          class="text-input"
        />
        <!-- 输入 @ 唤起完整资源选择器(搜索框 + 分类列表),与「@ 添加资源」按钮形态一致 -->
        <div v-if="mentionQuery" v-show="mentionHasResults" class="ai-mention-layer" :style="mentionAnchorStyle">
          <ResourcePickerPanel
            ref="mentionPanel"
            :show-search="false"
            :keyword="mentionQuery.keyword"
            :pinned-items="mentionPinnedItems"
            include-note-scopes
            @select="applyMentionSelection"
            @select-scope="applyMentionScopeSelection"
            @close="closeMention"
            @results-count="mentionHasResults = $event > 0"
          />
        </div>
      </div>
      <div class="composer-toolbar">
        <div class="composer-meta">
          <span v-if="!isMobile" class="input-hint">{{ t('ai.inputHint') }}</span>
          <AiConversationSettings
            :capability-module="capabilityModule"
            :capability-module-options="capabilityModuleOptions"
            :capability-policy-profile="capabilityPolicyProfile"
            :capability-policy-options="capabilityPolicyOptions"
            @update:capability-module="$emit('update:capabilityModule', $event)"
            @update:capability-policy-profile="$emit('update:capabilityPolicyProfile', $event)"
          />
          <BPopover
            v-if="showQuota && quota"
            trigger="click"
            placement="top-left"
            overlay-class-name="ai-quota-popover"
          >
            <BButton class="ai-quota-summary" :aria-label="t('ai.quotaOpenDetails')">
              {{ t('ai.quotaCompact', { percent: quotaPercent, rounds: estimatedRoundsLabel }) }}
            </BButton>
            <template #content>
              <div class="ai-quota-detail">
                <strong>{{ t('ai.quotaToday') }}</strong>
                <div class="ai-quota-bar" aria-hidden="true">
                  <div class="ai-quota-fill" :style="{ width: quotaPercent + '%' }"></div>
                </div>
                <dl>
                  <div>
                    <dt>{{ t('ai.quotaUsed') }}</dt>
                    <dd>{{ fmtTokens(quota.used) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('ai.quotaRemaining') }}</dt>
                    <dd>{{ fmtTokens(quota.dailyRemaining ?? remainingTokens) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('ai.quotaTotal') }}</dt>
                    <dd>{{ fmtTokens(quota.dailyQuota ?? quota.quota) }}</dd>
                  </div>
                  <div v-if="Number(quota.bonusTokens || 0) > 0">
                    <dt>{{ t('ai.quotaBonusBalance') }}</dt>
                    <dd>{{ fmtTokens(quota.bonusTokens) }}</dd>
                  </div>
                </dl>
                <small>{{
                  Number(quota.bonusTokens || 0) > 0 ? t('ai.quotaBonusHint') : t('ai.quotaEstimateHint')
                }}</small>
              </div>
            </template>
          </BPopover>
        </div>
        <div class="input-actions">
          <TranslationToggle
            v-if="showTranslation"
            :enableTranslation="enableTranslation"
            :translationConfig="translationConfig"
            @update:enableTranslation="$emit('update:enableTranslation', $event)"
            @update:translationConfig="$emit('update:translationConfig', $event)"
          />
          <BButton
            @click="isLoading ? stopFn() : sendFn()"
            v-click-log="{ module: 'AI助手', operation: isLoading ? '暂停' : '发送' }"
            :disabled="(!modelValue.trim() || attachmentBlocked) && !isLoading"
            class="send-btn"
            :class="{ stop: isLoading }"
          >
            {{ isLoading ? t('ai.pause') : t('ai.send') }}
          </BButton>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, nextTick, watch, computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import TranslationToggle from './TranslationToggle.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import AiConversationSettings from './AiConversationSettings.vue';
  import AiMaterialHub from './AiMaterialHub.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import { replaceMentionQuery, resolveMentionQuery, type MentionQuery } from '@/utils/resourceMentionTrigger';
  import { useDismissOnOutside } from '@/composables/useDismissOnOutside';
  import { useCurrentPageResource } from '@/composables/useCurrentPageResource';
  import { getTextareaCaretRect, toAnchorOffset } from '@/utils/textareaCaret';
  import type { AiAttachment } from '@/api/aiAttachmentApi';
  import type { AiAttachmentDirectActionName } from '@/config/aiTools';
  import { mergePromptSuggestion, type AiAttachmentActionRequest } from './attachmentActions';
  import icon from '@/config/icon';
  import { MAX_AI_SCOPE_REFS, type AiResourceContext, type AiScopeRef } from '@/types/aiScope';
  import type { BaseOptions } from '@/config/bookmarkCfg';
  import type { AiCapabilityModule } from '@/types/aiCapabilityScope';
  import type { AiCapabilityPolicyProfile } from '@/types/aiCapabilityPolicy';

  const { t } = useI18n();

  const props = withDefaults(
    defineProps<{
      modelValue: string;
      isLoading: boolean;
      quota?: {
        exempt?: boolean;
        role?: string;
        used?: number;
        quota?: number;
        remaining?: number;
        dailyQuota?: number;
        dailyUsed?: number;
        dailyRemaining?: number;
        bonusTokens?: number;
      } | null;
      showTranslation: boolean;
      enableTranslation: boolean;
      translationConfig: { source: string; target: string };
      isMobile: boolean;
      sendFn: () => void;
      stopFn: () => void;
      contexts: AiResourceContext[];
      scopeRefs?: AiScopeRef[];
      attachments: AiAttachment[];
      capabilityModule?: AiCapabilityModule;
      capabilityModuleOptions?: BaseOptions[];
      capabilityPolicyProfile?: AiCapabilityPolicyProfile;
      capabilityPolicyOptions?: BaseOptions[];
      prepareAttachmentActionFn: (request: AiAttachmentActionRequest) => Promise<void>;
    }>(),
    {
      scopeRefs: () => [],
      capabilityModule: 'auto',
      capabilityModuleOptions: () => [],
      capabilityPolicyProfile: 'auto',
      capabilityPolicyOptions: () => [],
    },
  );

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'update:enableTranslation', value: boolean): void;
    (e: 'update:translationConfig', value: { source: string; target: string }): void;
    (e: 'update:contexts', value: AiResourceContext[]): void;
    (e: 'update:scopeRefs', value: AiScopeRef[]): void;
    (e: 'update:attachments', value: AiAttachment[]): void;
    (e: 'update:capabilityModule', value: AiCapabilityModule): void;
    (e: 'update:capabilityPolicyProfile', value: AiCapabilityPolicyProfile): void;
    (e: 'clearMaterials'): void;
  }>();

  const textInput = ref<{ focus: () => void } | null>(null);
  const materialHub = ref<{
    attachCloudFile: (fileId: string) => Promise<void>;
    openAction: (toolName: AiAttachmentDirectActionName, args?: Record<string, unknown>) => boolean;
    uploadPastedImage: (file: File) => Promise<boolean>;
  } | null>(null);
  const adjustTextareaHeight = () => {};
  const inputValue = computed({
    get: () => props.modelValue,
    set: (value: string | number | undefined) => {
      emit('update:modelValue', String(value ?? ''));
      adjustTextareaHeight();
    },
  });
  const selectedCapabilityPolicyLabel = computed(
    () =>
      props.capabilityPolicyOptions.find((option) => option.value === props.capabilityPolicyProfile)?.label ||
      t('ai.capabilityPolicy.auto'),
  );
  const selectedCapabilityModuleLabel = computed(
    () =>
      props.capabilityModuleOptions.find((option) => option.value === props.capabilityModule)?.label ||
      t('ai.capabilityScope.auto'),
  );
  const hasActiveTurnScope = computed(
    () => props.capabilityPolicyProfile !== 'chat_only' && props.capabilityModule !== 'auto',
  );
  const hasCustomCapabilitySettings = computed(
    () => props.capabilityPolicyProfile !== 'auto' || hasActiveTurnScope.value,
  );
  // 文件直传确认后原文件就已经可用；OCR/文字提取只影响总结问答，不再阻断发送、保存或插图。
  const attachmentBlocked = computed(() =>
    props.attachments.some((attachment) => attachment.status === 'awaiting_upload'),
  );

  // AI 额度:已用占比 + token 紧凑格式(12.3k / 800k)
  const quotaPercent = computed(() => {
    const q = props.quota;
    const quota = Number(q?.dailyQuota ?? q?.quota ?? 0);
    const used = Number(q?.dailyUsed ?? q?.used ?? 0);
    if (!quota) return 0;
    return Math.min(100, Math.round((used / quota) * 100));
  });
  const showQuota = computed(() => {
    const q = props.quota;
    return Boolean(q && !q.exempt && q.quota);
  });
  const remainingTokens = computed(() => {
    const q = props.quota;
    if (!q) return 0;
    if (Number.isFinite(Number(q.remaining))) return Math.max(0, Number(q.remaining));
    return Math.max(0, Number(q.quota || 0) - Number(q.used || 0));
  });
  const estimatedRounds = computed(() => Math.floor(remainingTokens.value / 2500));
  const estimatedRoundsLabel = computed(() =>
    estimatedRounds.value > 99 ? '99+' : estimatedRounds.value < 1 ? '<1' : String(estimatedRounds.value),
  );
  function fmtTokens(n?: number) {
    const v = Number(n || 0);
    return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : String(v);
  }

  const handleComposerEnter = (event: KeyboardEvent) => {
    if (event?.isComposing || event?.keyCode === 229) return;

    // BInput 会在 textarea 内层先 emit enter，随后原生 keydown 才冒泡到下面的
    // handleMentionKeydown。必须在这里优先消费 Enter，否则外层 preventDefault 时消息已经发送。
    if (mentionQuery.value && mentionHasResults.value) {
      event.preventDefault();
      event.stopPropagation();
      mentionPanel.value?.chooseActive();
      return;
    }

    // 如果输入为空，仅中断（不发送）
    if (!props.modelValue.trim()) {
      if (props.isLoading) props.stopFn();
      return;
    }
    if (attachmentBlocked.value) return;

    // 中断当前回复（如果有），然后发送新消息
    props.stopFn();
    props.sendFn();
  };

  function applyAttachmentPrompt(value: string) {
    emit('update:modelValue', mergePromptSuggestion(props.modelValue, value));
    focus();
  }

  // ── 输入 @ 唤起资源建议 ──────────────────────────────
  // @ 浮层与「@ 添加资源」按钮共享同一条「当前页面」推导
  const currentPageResource = useCurrentPageResource();
  const mentionPinnedItems = computed(() => (currentPageResource.value ? [currentPageResource.value] : []));
  const mentionQuery = ref<MentionQuery | null>(null);
  const mentionPanel = ref<{ chooseActive: () => void; moveActive: (offset: number) => void } | null>(null);
  // 搜不到结果就整块不显示(与 Claude 一致);面板仍挂载着继续搜,
  // 所以从 @test123 退回 @test 时会自动重新出现,不必删到只剩 @
  const mentionHasResults = ref(false);

  // 浮层锚定在触发它的 @ 上:只在打开时算一次,输入框长高/换行都不会让它漂走
  const mentionAnchor = ref<{ left: number; bottom: number } | null>(null);
  const mentionAnchorStyle = computed(() =>
    mentionAnchor.value
      ? { left: `${mentionAnchor.value.left}px`, bottom: `${mentionAnchor.value.bottom}px` }
      : undefined,
  );

  function updateMentionAnchor(target: HTMLTextAreaElement | null, query: MentionQuery) {
    const wrap = target?.closest('.text-input-wrap') as HTMLElement | null;
    if (!target || !wrap) return;
    const caret = getTextareaCaretRect(target, query.start);
    const offset = toAnchorOffset(caret, wrap);
    mentionAnchor.value = {
      left: Math.max(0, offset.left),
      // 浮层在 @ 所在行的上方展开
      bottom: wrap.offsetHeight - offset.top + 6,
    };
  }

  function closeMention() {
    mentionQuery.value = null;
    mentionAnchor.value = null;
    mentionHasResults.value = false;
  }

  // 点击外部 / Esc 关闭走统一实现;输入框本身不算外部,否则刚打完 @ 就被关掉
  useDismissOnOutside({
    isActive: () => Boolean(mentionQuery.value),
    ignoreSelectors: ['.ai-mention-layer', '.text-input-wrap'],
    onDismiss: closeMention,
  });

  function syncMentionQuery(target: HTMLTextAreaElement | HTMLInputElement | null) {
    if (!target || typeof target.selectionStart !== 'number') return closeMention();
    const next = resolveMentionQuery(String(target.value ?? ''), target.selectionStart);
    const isNewMention = !mentionQuery.value || mentionQuery.value.start !== next?.start;
    mentionQuery.value = next;
    if (!next) return closeMention();
    // 同一个 @ 继续输入时保持原位,换了触发点才重新锚定
    if (isNewMention) void nextTick(() => updateMentionAnchor(target as HTMLTextAreaElement, next));
  }

  function handleMentionKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLTextAreaElement | null;
    // 面板没有搜索框,焦点始终留在输入框,键盘导航由这里转发
    if (mentionQuery.value && mentionHasResults.value) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        mentionPanel.value?.moveActive(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        mentionPanel.value?.chooseActive();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMention();
        return;
      }
    }
    // 键入后光标才更新,放到下一帧再解析;选择器内部的键盘导航由它自己处理
    window.setTimeout(() => syncMentionQuery(target), 0);
  }

  /** 选中资源:消费掉输入框里的 @关键词,再按类型交给对应写入路径。 */
  function applyMentionSelection(item: { type: string; id: string; title: string }) {
    const query = mentionQuery.value;
    if (query) emit('update:modelValue', replaceMentionQuery(props.modelValue, query));
    closeMention();
    if (item.type === 'file') {
      // 云文件必须走附件准备与解析,不能当成普通上下文
      void materialHub.value?.attachCloudFile(item.id);
      return;
    }
    const next = { type: item.type, id: String(item.id), title: item.title } as AiResourceContext;
    const exists = props.contexts.some((ctx) => ctx.type === next.type && String(ctx.id) === next.id);
    if (exists || props.contexts.length >= 5) return;
    emit('update:contexts', [...props.contexts, next]);
    focus();
  }

  function applyMentionScopeSelection(item: AiScopeRef) {
    const query = mentionQuery.value;
    if (query) emit('update:modelValue', replaceMentionQuery(props.modelValue, query));
    closeMention();
    if (item.type !== 'note_branch') return;
    const exists = props.scopeRefs.some((scope) => scope.type === item.type && scope.id === item.id);
    if (exists || props.scopeRefs.length >= MAX_AI_SCOPE_REFS) return;
    emit('update:scopeRefs', [...props.scopeRefs, { ...item }]);
    focus();
  }

  /** 粘贴图片直接进入附件上传;纯文本粘贴不受影响。 */
  function handlePaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files || []);
    const image = files.find((file) => /^image\//i.test(file.type));
    if (!image) return;
    event.preventDefault();
    void materialHub.value?.uploadPastedImage(image);
  }

  function openAttachmentAction(toolName: AiAttachmentDirectActionName, args: Record<string, unknown> = {}) {
    return materialHub.value?.openAction(toolName, args) || false;
  }

  onMounted(() => {
    adjustTextareaHeight();
  });

  watch(
    () => props.modelValue,
    () => {
      nextTick(adjustTextareaHeight);
    },
  );

  // 供父组件调用：编辑消息回填内容后，聚焦输入框并把光标移到末尾
  function focus() {
    nextTick(() => {
      textInput.value?.focus();
      adjustTextareaHeight();
    });
  }

  defineExpose({ focus, openAttachmentAction });
</script>

<style scoped>
  .input-section {
    background: var(--background-color);
    padding: 0.35rem 1rem 0.5rem;
    flex-shrink: 0;
    min-width: 0;
    box-sizing: border-box;
  }

  .input-container {
    position: relative;
    border: 0;
    border-radius: 0.875rem;
    background-color: var(--ai-composer-background-color, var(--card-background));
    padding: 0.55rem 0.65rem 0.5rem;
    min-height: 48px;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    box-shadow:
      0 0 0 1px var(--surface-border-color, var(--card-border-color)),
      0 6px 20px rgba(15, 23, 42, 0.05);
    transition: box-shadow 0.2s ease;
  }

  .input-container:focus-within {
    background-color: var(--ai-composer-background-color, var(--card-background));
    box-shadow:
      0 0 0 1px var(--surface-border-color, var(--card-border-color)),
      0 8px 24px rgba(97, 92, 237, 0.11);
  }

  .composer-context-row {
    display: grid;
    gap: 5px;
    width: 100%;
    min-width: 0;
    margin-bottom: 4px;
  }

  .capability-status-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
  }

  .capability-status-pill {
    display: inline-flex;
    gap: 5px;
    width: auto;
    max-width: 100%;
    min-height: 26px;
    padding: 2px 7px;
    border-color: var(--primary-color);
    background: var(--card-background);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 600;
  }

  .capability-status-pill > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .capability-status-pill.is-turn-scope {
    border-color: var(--surface-border-color);
    background: var(--surface-panel-bg);
    color: var(--text-color);
  }

  .text-input-wrap {
    position: relative;
    min-width: 0;
  }

  /* @ 选择面板贴输入框上沿弹出,避免遮挡正在输入的文字 */
  .ai-mention-layer {
    position: absolute;
    /* left / bottom 由锚点计算写入内联样式,固定在触发的 @ 上 */
    left: 0;
    bottom: calc(100% + 6px);
    width: max-content;
    max-width: 100%;
    z-index: 20;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--menu-body-bg-color, var(--card-background));
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
    overflow: hidden;
  }

  .text-input {
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 40px;
    box-sizing: border-box;
  }

  .text-input :deep(.input-container) {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    transition: box-shadow 0.2s ease;
  }

  .text-input :deep(.input-container:focus-within) {
    box-shadow: none;
  }

  .text-input :deep(.b-textarea) {
    min-height: 44px;
    max-height: 112px;
    resize: none;
    border: none;
    padding: 7px 2px 5px;
    background: transparent !important;
    font-size: 1rem;
    line-height: 1.5;
    appearance: none;
    -webkit-appearance: none;
  }

  .text-input :deep(.b-textarea:hover),
  .text-input :deep(.b-textarea:focus),
  .text-input :deep(.b-textarea:active) {
    border: 0;
    box-shadow: none;
  }

  .text-input:focus {
    box-shadow: none;
  }

  .text-input :deep(.b-textarea::placeholder) {
    color: var(--desc-color);
  }

  .composer-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 28px;
    margin-top: 0.25rem;
  }
  .composer-meta {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .input-actions {
    --ai-composer-action-height: 28px;

    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 0.5rem;
  }

  .input-actions :deep(.b_btn) {
    min-height: var(--ai-composer-action-height) !important;
    height: var(--ai-composer-action-height) !important;
  }

  .send-btn {
    padding: 0.25rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--primary-color);
    color: white;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 50px;
    height: var(--ai-composer-action-height);
    line-height: 1;
  }

  .send-btn:hover:not(:disabled) {
    background: #4f46e5;
  }

  .send-btn.stop {
    background: #dc2626;
  }

  .send-btn.stop:hover:not(:disabled) {
    background: #b91c1c;
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ai-quota-summary {
    min-height: 28px;
    height: 28px;
    padding-inline: 8px;
    color: var(--desc-color);
    background: transparent;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .input-hint {
    font-size: 0.75rem;
    color: var(--desc-color);
    white-space: nowrap;
  }

  @media (max-width: 767px) {
    .input-section {
      padding: 0.15rem 0.5rem calc(0.3rem + env(safe-area-inset-bottom));
    }

    .input-container {
      padding: 0.35rem 0.45rem 0.32rem;
      border-radius: 0.875rem;
    }

    .composer-context-row {
      gap: 5px;
      margin-bottom: 2px;
    }

    .capability-status-list {
      gap: 6px;
    }

    .capability-status-pill {
      min-height: 28px;
    }
    .text-input :deep(.b-textarea) {
      min-height: 38px;
      max-height: 82px;
      padding-top: 6px;
      padding-bottom: 3px;
    }

    .composer-toolbar {
      min-height: 40px;
      margin-top: 0;
      justify-content: flex-end;
    }
    .composer-meta {
      margin-right: auto;
    }

    .input-actions {
      --ai-composer-action-height: 40px;

      gap: 4px;
    }

    .send-btn {
      min-width: 54px;
    }
  }

</style>

<style>
  .ai-quota-popover {
    width: 250px;
    padding: 12px;
  }
  .ai-quota-detail {
    display: flex;
    flex-direction: column;
    gap: 9px;
    color: var(--text-color);
    font-size: 12px;
  }
  .ai-quota-detail .ai-quota-bar {
    width: 100%;
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 13%, transparent);
  }
  .ai-quota-detail .ai-quota-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 68%, #22d3ee));
  }
  .ai-quota-detail dl {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin: 0;
  }
  .ai-quota-detail dl > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }
  .ai-quota-detail dt,
  .ai-quota-detail small {
    color: var(--desc-color);
  }
  .ai-quota-detail dd {
    margin: 0;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
</style>
