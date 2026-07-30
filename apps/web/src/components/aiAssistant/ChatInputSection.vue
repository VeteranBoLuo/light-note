<template>
  <footer class="input-section">
    <div class="input-container">
      <div class="context-actions">
        <AiContextPicker
          :model-value="contexts"
          @update:model-value="$emit('update:contexts', $event)"
          @file-selected="attachSelectedCloudFile"
        />
        <AiAttachmentPicker
          ref="attachmentPicker"
          :model-value="attachments"
          :prepare-action-fn="prepareAttachmentActionFn"
          @update:model-value="$emit('update:attachments', $event)"
          @prompt="applyAttachmentPrompt"
        />
      </div>
      <div class="text-input-wrap">
        <BInput
          v-model:value="inputValue"
          type="textarea"
          submit-on-enter
          @enter="handleSend"
          @paste="handlePaste"
          @keydown="handleMentionKeydown"
          :placeholder="t('ai.inputPlaceholder')"
          :rows="1"
          ref="textInput"
          class="text-input"
        />
        <!-- 输入 @ 时的资源建议:笔记/书签进上下文,云文件交给附件适配器 -->
        <div v-if="mentionQuery" class="ai-mention-layer">
          <ResourceMentionSuggestions
            ref="mentionSuggestions"
            :query="mentionQuery.keyword"
            @select="applyMentionSelection"
            @open-full="closeMention"
          />
        </div>
      </div>
      <div class="composer-toolbar">
        <div class="composer-meta">
          <span v-if="!isMobile" class="input-hint">{{ t('ai.inputHint') }}</span>
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
                    <dd>{{ fmtTokens(remainingTokens) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('ai.quotaTotal') }}</dt>
                    <dd>{{ fmtTokens(quota.quota) }}</dd>
                  </div>
                </dl>
                <small>{{ t('ai.quotaEstimateHint') }}</small>
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
  import { onMounted, ref, nextTick, watch, computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import TranslationToggle from './TranslationToggle.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import AiContextPicker, { type AiResourceContext } from './AiContextPicker.vue';
  import AiAttachmentPicker from './AiAttachmentPicker.vue';
  import ResourceMentionSuggestions from '@/components/noteLibrary/detail/ResourceMentionSuggestions.vue';
  import {
    replaceMentionQuery,
    resolveMentionQuery,
    type MentionQuery,
  } from '@/utils/resourceMentionTrigger';
  import type { AiAttachment } from '@/api/aiAttachmentApi';
  import type { AiAttachmentDirectActionName } from '@/config/aiTools';
  import { mergePromptSuggestion, type AiAttachmentActionRequest } from './attachmentActions';

  const { t } = useI18n();

  const props = defineProps<{
    modelValue: string;
    isLoading: boolean;
    quota?: { exempt?: boolean; role?: string; used?: number; quota?: number; remaining?: number } | null;
    showTranslation: boolean;
    enableTranslation: boolean;
    translationConfig: { source: string; target: string };
    isMobile: boolean;
    sendFn: () => void;
    stopFn: () => void;
    contexts: AiResourceContext[];
    attachments: AiAttachment[];
    prepareAttachmentActionFn: (request: AiAttachmentActionRequest) => Promise<void>;
  }>();

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'update:enableTranslation', value: boolean): void;
    (e: 'update:translationConfig', value: { source: string; target: string }): void;
    (e: 'update:contexts', value: AiResourceContext[]): void;
    (e: 'update:attachments', value: AiAttachment[]): void;
  }>();

  const textInput = ref<{ focus: () => void } | null>(null);
  const attachmentPicker = ref<{
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
  // 文件直传确认后原文件就已经可用；OCR/文字提取只影响总结问答，不再阻断发送、保存或插图。
  const attachmentBlocked = computed(() =>
    props.attachments.some((attachment) => attachment.status === 'awaiting_upload'),
  );

  // AI 额度:已用占比 + token 紧凑格式(12.3k / 800k)
  const quotaPercent = computed(() => {
    const q = props.quota;
    if (!q || !q.quota) return 0;
    return Math.min(100, Math.round(((q.used || 0) / q.quota) * 100));
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

  const handleSend = (event: KeyboardEvent) => {
    if (event?.isComposing || event?.keyCode === 229) return;

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
  const mentionQuery = ref<MentionQuery | null>(null);
  const mentionSuggestions = ref<{ chooseActive: () => void; moveActive: (offset: number) => void } | null>(null);

  function closeMention() {
    mentionQuery.value = null;
  }

  function syncMentionQuery(target: HTMLTextAreaElement | HTMLInputElement | null) {
    if (!target || typeof target.selectionStart !== 'number') return closeMention();
    mentionQuery.value = resolveMentionQuery(String(target.value ?? ''), target.selectionStart);
  }

  function handleMentionKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLTextAreaElement | null;
    if (mentionQuery.value) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        mentionSuggestions.value?.moveActive(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        mentionSuggestions.value?.moveActive(-1);
        return;
      }
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        mentionSuggestions.value?.chooseActive();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMention();
        return;
      }
    }
    // 键入后光标才更新,放到下一帧再解析
    window.setTimeout(() => syncMentionQuery(target), 0);
  }

  /** 选中资源:消费掉输入框里的 @关键词,再按类型交给对应写入路径。 */
  function applyMentionSelection(item: { type: string; id: string; title: string }) {
    const query = mentionQuery.value;
    if (query) emit('update:modelValue', replaceMentionQuery(props.modelValue, query));
    closeMention();
    if (item.type === 'file') {
      // 云文件必须走附件准备与解析,不能当成普通上下文
      void attachmentPicker.value?.attachCloudFile(item.id);
      return;
    }
    const next = { type: item.type, id: String(item.id), title: item.title } as AiResourceContext;
    const exists = props.contexts.some((ctx) => ctx.type === next.type && String(ctx.id) === next.id);
    if (exists || props.contexts.length >= 5) return;
    emit('update:contexts', [...props.contexts, next]);
    focus();
  }

  /** 粘贴图片直接进入附件上传;纯文本粘贴不受影响。 */
  function handlePaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files || []);
    const image = files.find((file) => /^image\//i.test(file.type));
    if (!image) return;
    event.preventDefault();
    void attachmentPicker.value?.uploadPastedImage(image);
  }

  function openAttachmentAction(toolName: AiAttachmentDirectActionName, args: Record<string, unknown> = {}) {
    return attachmentPicker.value?.openAction(toolName, args) || false;
  }

  function attachSelectedCloudFile(item: AiResourceContext) {
    void attachmentPicker.value?.attachCloudFile(item.id);
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
    padding: 0.4rem 1.25rem 0.55rem;
    flex-shrink: 0;
    min-width: 0;
    box-sizing: border-box;
  }

  .input-container {
    position: relative;
    border: 0;
    border-radius: 1rem;
    background-color: var(--ai-composer-background-color, var(--card-background));
    padding: 0.7rem 0.75rem 0.6rem;
    min-height: 48px;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    box-shadow:
      0 0 0 1px var(--surface-border-color, var(--card-border-color)),
      0 8px 24px rgba(15, 23, 42, 0.06);
    transition: box-shadow 0.2s ease;
  }

  .input-container:focus-within {
    background-color: var(--ai-composer-background-color, var(--card-background));
    box-shadow:
      0 0 0 1px var(--surface-border-color, var(--card-border-color)),
      0 12px 30px rgba(97, 92, 237, 0.12);
  }

  .context-actions {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
    min-width: 0;
    margin-bottom: 6px;
  }

  .text-input-wrap {
    position: relative;
    min-width: 0;
  }

  /* @ 建议浮层贴着输入框上沿弹出,避免遮挡正在输入的文字 */
  .ai-mention-layer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 6px);
    z-index: 20;
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
    border-radius: 0.875rem;
    background: var(--ai-composer-input-background-color, var(--card-background));
    box-shadow: inset 0 0 0 1px var(--surface-border-color, var(--card-border-color));
    transition: box-shadow 0.2s ease;
  }

  .text-input :deep(.input-container:focus-within) {
    box-shadow: inset 0 0 0 1px var(--primary-color);
  }

  .text-input :deep(.b-textarea) {
    min-height: 50px;
    max-height: 120px;
    resize: none;
    border: none;
    padding: 0;
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
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 0.5rem;
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
    height: 28px;
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

  @media (max-width: 600px) {
    .input-section {
      padding: 0.25rem 0.625rem calc(0.4rem + env(safe-area-inset-bottom));
    }

    .input-container {
      padding: 0.45rem 0.5rem 0.4rem;
      border-radius: 1rem;
    }

    .context-actions {
      flex-wrap: nowrap;
      align-items: center;
      gap: 4px;
      margin-bottom: 4px;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
    }

    .context-actions::-webkit-scrollbar {
      display: none;
    }

    .context-actions :deep(.b_btn),
    .input-actions :deep(.b_btn) {
      min-height: 32px !important;
      height: 32px !important;
      padding-inline: 10px;
    }

    .text-input :deep(.b-textarea) {
      min-height: 42px;
      max-height: 88px;
    }

    .composer-toolbar {
      min-height: 24px;
      margin-top: 2px;
      justify-content: flex-end;
    }
    .composer-meta {
      margin-right: auto;
    }

    .input-actions {
      gap: 4px;
    }

    .send-btn {
      min-width: 54px;
      height: 32px;
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
    background: linear-gradient(
      90deg,
      var(--primary-color),
      color-mix(in srgb, var(--primary-color) 68%, #22d3ee)
    );
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
