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
        <!-- 输入 @ 唤起完整资源选择器(搜索框 + 分类列表),与「@ 添加资源」按钮形态一致 -->
        <div
          v-if="mentionQuery"
          v-show="mentionHasResults"
          class="ai-mention-layer"
          :style="mentionAnchorStyle"
        >
          <ResourcePickerPanel
            ref="mentionPanel"
            :show-search="false"
            :keyword="mentionQuery.keyword"
            :pinned-items="mentionPinnedItems"
            @select="applyMentionSelection"
            @close="closeMention"
            @results-count="mentionHasResults = $event > 0"
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
  import { onBeforeUnmount, onMounted, ref, nextTick, watch, computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import TranslationToggle from './TranslationToggle.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import AiContextPicker, { type AiResourceContext } from './AiContextPicker.vue';
  import AiAttachmentPicker from './AiAttachmentPicker.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import {
    replaceMentionQuery,
    resolveMentionQuery,
    type MentionQuery,
  } from '@/utils/resourceMentionTrigger';
  import { useDismissOnOutside } from '@/composables/useDismissOnOutside';
  import { useCurrentPageResource } from '@/composables/useCurrentPageResource';
  import { getTextareaCaretRect, toAnchorOffset } from '@/utils/textareaCaret';
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
  // @ 浮层与「@ 添加资源」按钮共享同一条「当前页面」推导
  const currentPageResource = useCurrentPageResource();
  const mentionPinnedItems = computed(() =>
    currentPageResource.value ? [currentPageResource.value] : [],
  );
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

  /* 「@ 添加资源」「上传文件」是入口按钮:BButton 默认无边框,暗色下与输入区背景融为一体,
     补一圈描边让它们保持按钮形态(chips 有自己的底色,不在此列) */
  .context-actions :deep(.b-popover-trigger > .b_btn),
  .context-actions :deep(.b-upload-trigger .b_btn) {
    border: 1px solid var(--card-border-color);
  }

  [data-theme='night'] .context-actions :deep(.b-popover-trigger > .b_btn),
  [data-theme='night'] .context-actions :deep(.b-upload-trigger .b_btn) {
    border-color: color-mix(in srgb, var(--text-color) 22%, var(--card-border-color));
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
