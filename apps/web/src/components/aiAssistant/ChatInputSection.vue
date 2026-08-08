<template>
  <footer class="input-section">
    <div class="input-container">
      <div v-if="!isMobile" class="context-actions">
        <AiContextPicker
          :model-value="contexts"
          :scope-model-value="scopeRefs"
          @update:model-value="$emit('update:contexts', $event)"
          @update:scope-model-value="$emit('update:scopeRefs', $event)"
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
      <div v-else class="mobile-context-actions">
        <BButton
          class="mobile-context-toggle"
          :aria-label="t('ai.material.mobileTitle')"
          :title="t('ai.material.mobileTitle')"
          :aria-expanded="mobileActionsOpen"
          aria-haspopup="dialog"
          @click="mobileActionsOpen = true"
        >
          <span class="mobile-context-toggle__icon">
            <SvgIcon :src="icon.common.plus" size="15" aria-hidden="true" />
          </span>
          <span class="mobile-context-toggle__label">{{ t('ai.material.mobileAdd') }}</span>
          <span v-if="selectedMaterialCount" class="mobile-context-toggle__count" aria-hidden="true">
            {{ selectedMaterialCount }}
          </span>
        </BButton>
      </div>
      <BDrawer
        v-if="isMobile"
        :open="mobileActionsOpen"
        :title="t('ai.material.mobileTitle')"
        placement="bottom"
        height="auto"
        body-padding="12px 16px max(18px, env(safe-area-inset-bottom))"
        @close="mobileActionsOpen = false"
      >
        <div class="mobile-context-drawer">
          <div class="mobile-context-drawer__intro">
            <span>{{ t('ai.material.once') }}</span>
            <p>{{ t('ai.material.onceTooltip') }}</p>
          </div>
          <div class="mobile-material-action-list">
            <AiContextPicker
              :model-value="contexts"
              :scope-model-value="scopeRefs"
              @update:model-value="$emit('update:contexts', $event)"
              @update:scope-model-value="$emit('update:scopeRefs', $event)"
              @file-selected="attachSelectedCloudFile"
            >
              <template #trigger>
                <BButton class="mobile-material-action-card mobile-material-action-card--resource">
                  <span class="mobile-material-action-card__icon">
                    <SvgIcon :src="icon.ai.materials" size="21" aria-hidden="true" />
                  </span>
                  <span class="mobile-material-action-card__copy">
                    <strong>{{ t('ai.addContext') }}</strong>
                    <small>{{ t('ai.material.contextDescription') }}</small>
                  </span>
                  <SvgIcon
                    class="mobile-material-action-card__arrow"
                    :src="icon.arrow_right"
                    size="15"
                    aria-hidden="true"
                  />
                </BButton>
              </template>
            </AiContextPicker>
            <AiAttachmentPicker
              ref="attachmentPicker"
              :model-value="attachments"
              :prepare-action-fn="prepareAttachmentActionFn"
              @update:model-value="$emit('update:attachments', $event)"
              @prompt="applyAttachmentPrompt"
            >
              <template #trigger="{ busy }">
                <BButton
                  class="mobile-material-action-card mobile-material-action-card--file"
                  :loading="busy"
                  :title="t('ai.material.attachmentOnceHint')"
                >
                  <span class="mobile-material-action-card__icon">
                    <SvgIcon :src="icon.file_upload" size="20" aria-hidden="true" />
                  </span>
                  <span class="mobile-material-action-card__copy">
                    <strong>{{ t('ai.uploadFile') }}</strong>
                    <small>{{ t('ai.material.fileDescription') }}</small>
                  </span>
                  <SvgIcon
                    class="mobile-material-action-card__arrow"
                    :src="icon.arrow_right"
                    size="15"
                    aria-hidden="true"
                  />
                </BButton>
              </template>
            </AiAttachmentPicker>
          </div>
        </div>
      </BDrawer>
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
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import AiContextPicker from './AiContextPicker.vue';
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
  import icon from '@/config/icon';
  import {
    MAX_AI_SCOPE_REFS,
    type AiResourceContext,
    type AiScopeRef,
  } from '@/types/aiScope';

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
      prepareAttachmentActionFn: (request: AiAttachmentActionRequest) => Promise<void>;
    }>(),
    { scopeRefs: () => [] },
  );

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'update:enableTranslation', value: boolean): void;
    (e: 'update:translationConfig', value: { source: string; target: string }): void;
    (e: 'update:contexts', value: AiResourceContext[]): void;
    (e: 'update:scopeRefs', value: AiScopeRef[]): void;
    (e: 'update:attachments', value: AiAttachment[]): void;
  }>();

  const mobileActionsOpen = ref(false);

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
  const selectedMaterialCount = computed(
    () => props.contexts.length + props.scopeRefs.length + props.attachments.length,
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

  watch(
    () => props.isMobile,
    (isMobile) => {
      if (!isMobile) mobileActionsOpen.value = false;
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

  /*
   * 材料区是「已选 chips + @添加资源 + 上传文件」一条连续的流。
   * AiContextPicker 自己也是 flex-wrap 容器，chips 多到需要换行时它会撑满整行，
   * 把同级的「上传文件」一起挤到再下一行 —— 于是明明还有空位，两个入口按钮却分居两行。
   * 摊平这层包装，让 chips 与两个触发按钮成为同一个 wrap 流的成员：
   * chips 占满前面的行，两个按钮并排跟在最后一行。
   * 只作用于桌面容器内，移动端的 AiContextPicker 在材料抽屉里，不受影响。
   */
  .context-actions > :deep(.ai-context-picker) {
    display: contents;
  }

  /* 摊平后 chips 直接受 .context-actions 的 flex-start 约束，与同行按钮居中对齐 */
  .context-actions :deep(.ai-context-chips) {
    align-self: center;
  }

  .mobile-context-actions {
    display: none;
  }

  /* 「@ 添加资源」「上传文件」是入口按钮:默认灰底在浅色下像原生 button、暗色下又与输入区同色。
     改用主题色淡染 + 同色系描边,两个主题自适应,并与下方资料 chips 视觉同族。 */
  /* 附件卡片信息多（文件名 + 大小 + 解析状态 + 操作），与「@ 添加资源」「上传文件」
     同行会被压缩甚至横向裁切。有附件时让它独占一行铺满，入口按钮留在上一行。
     不挂断点：桌面 AI 抽屉宽度可变（480～720px），同样挤不下。 */
  .context-actions :deep(.ai-attachment-picker.has-attachment) {
    width: 100%;
    min-width: 0;
    flex: 1 1 100%;
  }

  .context-actions :deep(.b-popover-trigger > .b_btn),
  .context-actions :deep(.b-upload-trigger .b_btn) {
    border: 1px solid color-mix(in srgb, var(--primary-color) 20%, transparent);
    background: color-mix(in srgb, var(--primary-color) 7%, transparent) !important;
    color: var(--primary-color);
    font-weight: 500;
  }

  .context-actions :deep(.b-popover-trigger > .b_btn:hover),
  .context-actions :deep(.b-upload-trigger .b_btn:hover) {
    border-color: color-mix(in srgb, var(--primary-color) 34%, transparent);
    background: color-mix(in srgb, var(--primary-color) 13%, transparent) !important;
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

  @media (max-width: 767px) {
    .input-section {
      padding: 0.2rem 0.625rem calc(0.35rem + env(safe-area-inset-bottom));
    }

    .input-container {
      padding: 0.38rem 0.5rem 0.34rem;
      border-radius: 1rem;
    }

    .context-actions {
      display: none;
    }

    .mobile-context-actions {
      display: flex;
      align-items: center;
      width: 100%;
      min-width: 0;
      margin-bottom: 4px;
      overflow: hidden;
    }

    .mobile-context-toggle {
      display: inline-flex;
      flex: 0 0 auto;
      gap: 7px;
      width: max-content;
      max-width: 100%;
      height: var(--mobile-touch-size, 44px) !important;
      min-height: var(--mobile-touch-size, 44px);
      padding: 5px 9px 5px 6px !important;
      /* 先给不支持 color-mix 的移动 WebView 一个可见的主题边框，再用混色增强层次。 */
      border: 1px solid var(--card-border-color);
      border-color: var(--primary-color);
      border-radius: 12px;
      background: var(--card-background);
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--primary-color) 15%, var(--card-background)),
        color-mix(in srgb, var(--primary-color) 6%, var(--card-background))
      );
      color: var(--primary-color);
      box-shadow: none;
      font-size: 12px;
      font-weight: 650;
      line-height: 1;
    }

    .mobile-context-toggle__icon {
      display: grid;
      flex: 0 0 30px;
      width: 30px;
      height: 30px;
      place-items: center;
      border-radius: 8px;
      background: var(--primary-color);
      color: white;
      box-shadow: 0 5px 12px -7px color-mix(in srgb, var(--primary-color) 86%, transparent);
    }

    .mobile-context-toggle__label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mobile-context-toggle__count {
      display: grid;
      flex: 0 0 auto;
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      place-items: center;
      border-radius: 999px;
      background: color-mix(in srgb, var(--primary-color) 14%, var(--card-background));
      color: var(--primary-color);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }

    .mobile-context-drawer {
      display: grid;
      gap: 10px;
      width: 100%;
      min-width: 0;
      overflow-x: hidden;
    }

    .mobile-context-drawer__intro {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
      padding: 8px 10px;
      border: 1px solid var(--surface-divider-color);
      border-radius: 12px;
      background: color-mix(in srgb, var(--primary-color) 5%, var(--surface-panel-bg));
    }

    .mobile-context-drawer__intro > span {
      flex: 0 0 auto;
      padding: 3px 7px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--primary-color) 14%, var(--card-background));
      color: var(--primary-color);
      font-size: 10px;
      font-weight: 700;
      line-height: 16px;
    }

    .mobile-context-drawer__intro p {
      min-width: 0;
      margin: 0;
      color: var(--desc-color);
      font-size: 12px;
      line-height: 17px;
    }

    .mobile-material-action-list {
      display: grid;
      gap: 10px;
      width: 100%;
      min-width: 0;
    }

    .mobile-material-action-list :deep(.ai-context-picker),
    .mobile-material-action-list :deep(.ai-attachment-picker),
    .mobile-material-action-list :deep(.b-popover-trigger),
    .mobile-material-action-list :deep(.b-upload-trigger) {
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }

    .mobile-material-action-list :deep(.ai-context-picker),
    .mobile-material-action-list :deep(.ai-attachment-picker) {
      display: grid;
      gap: 10px;
    }

    .mobile-material-action-list :deep(.ai-context-chips) {
      padding: 8px;
      border: 1px solid color-mix(in srgb, var(--primary-color) 16%, var(--surface-border-color));
      border-radius: 12px;
      background: color-mix(in srgb, var(--primary-color) 5%, var(--surface-panel-bg));
    }

    .mobile-material-action-list :deep(.mobile-material-action-card) {
      --material-accent: var(--primary-color);

      position: relative;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 16px;
      gap: 11px;
      justify-content: stretch;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      height: auto;
      min-height: 76px;
      padding: 10px 12px 10px 10px;
      overflow: hidden;
      border: 1px solid color-mix(in srgb, var(--material-accent) 22%, var(--surface-border-color));
      border-radius: 14px;
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--material-accent) 9%, var(--card-background)),
        var(--card-background) 72%
      );
      color: var(--text-color);
      line-height: normal;
      text-align: left;
      white-space: normal;
      box-shadow: 0 12px 24px -22px color-mix(in srgb, var(--material-accent) 72%, transparent);
      transition:
        transform 0.16s ease,
        border-color 0.16s ease,
        box-shadow 0.16s ease;
    }

    .mobile-material-action-list :deep(.mobile-material-action-card--file) {
      --material-accent: var(--resource-file-color);
    }

    .mobile-material-action-card__icon {
      display: grid;
      width: 42px;
      height: 42px;
      place-items: center;
      align-self: center;
      border-radius: 12px;
      background: color-mix(in srgb, var(--material-accent) 14%, var(--card-background));
      color: var(--material-accent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--material-accent) 13%, transparent);
    }

    .mobile-material-action-card__copy {
      display: grid;
      min-width: 0;
      align-content: center;
      gap: 3px;
    }

    .mobile-material-action-card__copy strong,
    .mobile-material-action-card__copy small {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mobile-material-action-card__copy strong {
      color: var(--text-color);
      font-size: 14px;
      font-weight: 650;
      line-height: 19px;
      white-space: nowrap;
    }

    .mobile-material-action-card__copy small {
      display: -webkit-box;
      color: var(--desc-color);
      font-size: 11px;
      line-height: 16px;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .mobile-material-action-card__arrow {
      align-self: center;
      color: color-mix(in srgb, var(--material-accent) 72%, var(--desc-color));
      opacity: 0.7;
    }

    .mobile-material-action-list :deep(.mobile-material-action-card .btn-spinner) {
      position: absolute;
      z-index: 1;
      left: 24px;
      margin: 0;
      color: var(--material-accent);
      transform: translateX(-50%);
    }

    .mobile-material-action-list :deep(.mobile-material-action-card.loading) .mobile-material-action-card__icon {
      opacity: 0;
    }

    .mobile-material-action-list :deep(.mobile-material-action-card:active) {
      transform: scale(0.99);
    }

    @media (hover: hover) {
      .mobile-context-toggle:hover {
        border-color: var(--primary-color);
        border-color: color-mix(in srgb, var(--primary-color) 48%, var(--card-border-color));
        background: var(--card-background);
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--primary-color) 19%, var(--card-background)),
          color-mix(in srgb, var(--primary-color) 9%, var(--card-background))
        );
      }

      .mobile-material-action-list :deep(.mobile-material-action-card:hover) {
        z-index: 1;
        border-color: color-mix(in srgb, var(--material-accent) 42%, var(--surface-border-color));
        box-shadow: 0 14px 28px -20px color-mix(in srgb, var(--material-accent) 55%, transparent);
        transform: translateY(-1px);
      }
    }

    .input-actions :deep(.b_btn) {
      min-height: var(--mobile-touch-size, 44px) !important;
      height: var(--mobile-touch-size, 44px) !important;
      padding-inline: 10px;
    }

    .text-input :deep(.b-textarea) {
      min-height: 42px;
      max-height: 88px;
    }

    .composer-toolbar {
      min-height: var(--mobile-touch-size, 44px);
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
      height: var(--mobile-touch-size, 44px);
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
