<template>
  <div ref="containerRef" class="ai-container" :class="{ 'is-mobile': isMobileLayout }">
    <div class="ai-note-meta">
      <SvgIcon :src="icon.resource.note" aria-hidden="true" />
      <span class="note-context-title" :title="note?.title">{{ note?.title || t('ai.reply.untitled') }}</span>
      <span class="note-context-length">{{ textLength }} {{ t('ai.reply.wordCount') }}</span>
    </div>

    <section class="ai-quick-actions" :aria-label="t('ai.reply.quickTitle')">
      <div class="section-heading">
        <span>{{ t('ai.reply.quickTitle') }}</span>
        <span class="section-hint">{{ t('ai.reply.quickHint') }}</span>
      </div>
      <div class="ai-actions">
        <BButton
          class="action-btn text-hidden"
          :disabled="isLoading"
          @click="runAction('polishFull')"
          :title="t('ai.reply.actions.polishFull')"
          v-click-log="{ module: '笔记-AI助手', operation: '润色全文' }"
          >{{ t('ai.reply.actions.polishFull') }}</BButton
        >
        <BButton
          class="action-btn text-hidden"
          :disabled="isLoading"
          @click="runAction('optimizeTitle')"
          :title="t('ai.reply.actions.optimizeTitle')"
          v-click-log="{ module: '笔记-AI助手', operation: '优化标题' }"
          >{{ t('ai.reply.actions.optimizeTitle') }}</BButton
        >
        <BButton
          class="action-btn text-hidden"
          :disabled="isLoading"
          @click="runAction('generateSummary')"
          :title="t('ai.reply.actions.generateSummary')"
          v-click-log="{ module: '笔记-AI助手', operation: '生成摘要' }"
          >{{ t('ai.reply.actions.generateSummary') }}</BButton
        >
        <BButton
          class="action-btn text-hidden"
          :disabled="isLoading"
          @click="runAction('correctErrors')"
          :title="t('ai.reply.actions.correctErrors')"
          v-click-log="{ module: '笔记-AI助手', operation: '纠错与语病' }"
          >{{ t('ai.reply.actions.correctErrors') }}</BButton
        >
        <BButton
          class="action-btn text-hidden"
          :disabled="isLoading"
          @click="runAction('continueWrite')"
          :title="t('ai.reply.actions.continueWrite')"
          v-click-log="{ module: '笔记-AI助手', operation: '续写扩展' }"
          >{{ t('ai.reply.actions.continueWrite') }}</BButton
        >
        <BButton
          class="action-btn text-hidden"
          :disabled="isLoading"
          @click="runAction('translate')"
          :title="t('ai.reply.actions.translate')"
          v-click-log="{ module: '笔记-AI助手', operation: '翻译' }"
          >{{ t('ai.reply.actions.translate') }}</BButton
        >
        <BButton
          class="action-btn text-hidden"
          :disabled="isLoading"
          @click="runAction('outline')"
          :title="t('ai.reply.actions.outline')"
          v-click-log="{ module: '笔记-AI助手', operation: '生成大纲' }"
          >{{ t('ai.reply.actions.outline') }}</BButton
        >
      </div>
    </section>

    <section class="ai-input">
      <BButton
        type="text"
        class="requirements-toggle"
        :aria-expanded="requirementsExpanded"
        :aria-controls="requirementsId"
        @click="requirementsExpanded = !requirementsExpanded"
      >
        <SvgIcon
          :src="icon.noteTree.chevron"
          class="requirements-chevron"
          :class="{ 'is-open': requirementsExpanded }"
          aria-hidden="true"
        />
        <span>{{ t('ai.reply.inputLabel') }}</span>
        <span v-if="!requirementsExpanded" class="requirements-summary">{{
          t(prompt.trim() ? 'ai.reply.requirementsFilled' : 'ai.reply.addRequirement')
        }}</span>
      </BButton>
      <div v-show="requirementsExpanded" :id="requirementsId" class="requirements-fields">
        <label :for="requirementsInputId" class="section-hint">{{ t('ai.reply.inputHint') }}</label>
        <BInput
          :id="requirementsInputId"
          v-model:value="prompt"
          type="textarea"
          :rows="2"
          :disabled="isLoading"
          :placeholder="t('ai.reply.inputPlaceholder')"
        />
        <BButton
          class="custom-process-btn"
          :disabled="isLoading || !prompt.trim()"
          @click="generate('custom')"
          v-click-log="{ module: '笔记-AI助手', operation: '自定义处理' }"
          >{{ t('ai.reply.processButton') }}</BButton
        >
      </div>
    </section>

    <section class="ai-output" :aria-label="resultTitle">
      <div class="output-header">
        <div class="output-heading">
          <span class="result-title">{{ resultHeading }}</span>
          <span v-if="requestCompleted && !formatInvalid" class="result-complete">
            <SvgIcon :src="icon.organize.check" size="14" aria-hidden="true" />
            {{ t('ai.reply.completed') }}
          </span>
        </div>
        <div v-if="outputFull || isLoading" class="output-actions">
          <BButton
            v-if="isLoading"
            class="stop-btn"
            @click="stopGenerating"
            v-click-log="{ module: '笔记-AI助手', operation: '停止生成' }"
          >
            <span class="stop-icon" aria-hidden="true"></span>
            {{ t('ai.reply.stop') }}
          </BButton>
          <BButton
            class="icon-btn"
            icon-only
            @click="previewVisible = true"
            :title="t('ai.reply.expand')"
            :aria-label="t('ai.reply.expand')"
            v-click-log="{ module: '笔记-AI助手', operation: '放大预览' }"
            ><SvgIcon :src="icon.ai.maximize" aria-hidden="true"
          /></BButton>
          <BButton
            v-if="!isLoading"
            class="icon-btn"
            icon-only
            @click="clearOutput"
            :title="t('ai.reply.clear')"
            :aria-label="t('ai.reply.clear')"
            v-click-log="{ module: '笔记-AI助手', operation: '清空输出' }"
            ><SvgIcon :src="icon.noteDetail.deleteLine" aria-hidden="true"
          /></BButton>
        </div>
      </div>
      <div class="output-reading">
        <div v-if="formatInvalid" class="format-warning" role="status">
          {{ t('ai.reply.formatInvalid', { markers: missingMarkers.join(t('ai.reply.markerSeparator')) }) }}
        </div>
        <div v-if="outputTruncated" class="truncation-warning" role="status">
          <span>{{ t('ai.reply.truncatedHint') }}</span>
          <div class="generation-feedback-actions">
            <BButton class="status-action-btn" @click="retryGeneration">{{ t('ai.reply.retry') }}</BButton>
            <BButton class="status-action-btn" @click="runAction('generateSummary')">{{
              t('ai.reply.actions.generateSummary')
            }}</BButton>
          </div>
        </div>
        <div v-if="showGenerationStatus" class="generation-status" role="status" aria-live="polite">
          <BLoading inline :loading="true" :title="generationStatusText" />
        </div>
        <div v-if="generationFeedback" :class="['generation-feedback', `is-${generationFeedback.type}`]" role="status">
          <span>{{ generationFeedback.text }}</span>
          <BButton v-if="generationFeedback.retryable" class="status-action-btn" @click="retryGeneration">{{
            t('ai.reply.retry')
          }}</BButton>
        </div>
        <div v-if="hasTitle && hasBody" class="title-suggestion">
          <span class="title-suggestion-label">{{ t('ai.reply.suggestedTitle') }}</span>
          <span class="title-suggestion-value">{{ suggestedTitle }}</span>
        </div>
        <TypewriterOutput
          ref="outputRef"
          v-if="displayOutput || (!isLoading && !generationFeedback)"
          v-auto-scrollbar
          class="output-body"
          :typing-speed="16"
          :content="displayOutput"
          :markdown="isMarkdownNote"
          :empty-text="t('ai.reply.emptyMessage')"
        />
      </div>
      <div v-if="displayOutput || isLoading" class="output-footer">
        <span class="apply-hint">{{ applyHint }}</span>
        <div class="apply-actions">
          <BButton
            v-if="resultFormat === 'title' || hasTitle"
            :type="hasBody ? undefined : 'primary'"
            :disabled="!canApplyTitle"
            @click="requestApply('title')"
            v-click-log="{ module: '笔记-AI助手', operation: '替换标题' }"
            >{{ t('ai.reply.replaceTitle') }}</BButton
          >
          <BButton
            v-if="resultFormat !== 'title' || hasBody"
            type="primary"
            :disabled="!canApplyBody"
            @click="requestApply('body')"
            v-click-log="{ module: '笔记-AI助手', operation: '插入到笔记' }"
            >{{ t('ai.reply.replaceContent') }}</BButton
          >
        </div>
      </div>
    </section>

    <!-- 预览留在同一根节点中，让父级 ai-panel 的宽高约束继续落在侧栏。 -->
    <BModal
      v-model:visible="previewVisible"
      :title="t('ai.reply.outputTitle')"
      width="min(var(--ui-layout-1080, 1080px), calc(100% - var(--ui-space-32, 32px)))"
      modal-class="note-ai-preview-dialog"
      content-class="note-ai-preview-content"
      fullscreen-mobile
    >
      <template #title>
        <div class="ai-preview-heading">
          <span>{{ t('ai.reply.outputTitle') }}</span>
          <span class="ai-preview-context"
            >{{ actionLabel }}<template v-if="actionLabel"> · </template
            >{{ note?.title || t('ai.reply.untitled') }}</span
          >
        </div>
      </template>
      <div class="ai-preview" :class="{ 'is-mobile': isMobileLayout }">
        <div v-if="hasTitle && hasBody" class="ai-preview-title">
          <span class="title-suggestion-label">{{ t('ai.reply.suggestedTitle') }}</span>
          <span class="title-suggestion-value">{{ suggestedTitle }}</span>
        </div>
        <div
          ref="previewSplitRef"
          class="ai-preview-split"
          :style="previewReadingHeight ? { height: `${previewReadingHeight}px` } : undefined"
        >
          <section class="ai-preview-col ai-preview-col--origin">
            <div class="ai-preview-col-head">{{ t('ai.reply.previewOrigin') }}</div>
            <div ref="previewOriginBodyRef" class="ai-preview-body" v-auto-scrollbar>
              <p v-if="resultFormat === 'title'">{{ note?.title || t('ai.reply.untitled') }}</p>
              <div v-else v-html="originRenderedHtml" v-mermaid></div>
            </div>
          </section>
          <section class="ai-preview-col">
            <div class="ai-preview-col-head">
              <span>{{ resultTitle }}</span>
              <span v-if="requestCompleted && !formatInvalid" class="result-complete">
                <SvgIcon :src="icon.organize.check" size="14" aria-hidden="true" />
                {{ t('ai.reply.completed') }}
              </span>
            </div>
            <div class="ai-preview-body" ref="previewBodyRef" v-auto-scrollbar>
              <div v-if="showGenerationStatus" class="generation-status" role="status">
                <BLoading inline :loading="true" :title="generationStatusText" />
              </div>
              <div
                v-if="generationFeedback"
                :class="['generation-feedback', `is-${generationFeedback.type}`]"
                role="status"
              >
                <span>{{ generationFeedback.text }}</span>
                <BButton v-if="generationFeedback.retryable" class="status-action-btn" @click="retryGeneration">{{
                  t('ai.reply.retry')
                }}</BButton>
              </div>
              <div v-if="formatInvalid" class="format-warning" role="status">{{
                t('ai.reply.formatInvalid', { markers: missingMarkers.join(t('ai.reply.markerSeparator')) })
              }}</div>
              <div v-if="outputTruncated" class="truncation-warning" role="status">{{
                t('ai.reply.truncatedHint')
              }}</div>
              <div v-html="generatedRenderedHtml" v-mermaid></div>
            </div>
          </section>
        </div>
      </div>
      <template #footer="{ close }">
        <div class="ai-preview-footer" :class="{ 'is-mobile': isMobileLayout }">
          <div class="ai-preview-followup">
            <BInput
              v-model:value="followupPrompt"
              :placeholder="t('ai.reply.followupPlaceholder')"
              :disabled="isLoading"
              @enter="runFollowup"
            />
            <BButton
              v-if="isLoading"
              class="stop-btn ai-preview-followup__send"
              @click="stopGenerating"
              v-click-log="{ module: '笔记-AI助手', operation: '停止生成' }"
            >
              <span class="stop-icon" aria-hidden="true"></span>
              {{ t('ai.reply.stop') }}
            </BButton>
            <BButton
              v-else
              class="ai-preview-followup__send"
              :disabled="!followupPrompt.trim() || !outputFull"
              @click="runFollowup"
              v-click-log="{ module: '笔记-AI助手', operation: '追问迭代' }"
              >{{ t('ai.reply.followupSend') }}</BButton
            >
          </div>
          <div class="ai-preview-actions">
            <span class="apply-hint">{{ applyHint }}</span>
            <div class="apply-actions">
              <BButton @click="close">{{ t('common.close') }}</BButton>
              <BButton
                v-if="resultFormat === 'title' || hasTitle"
                :type="hasBody ? undefined : 'primary'"
                :disabled="!canApplyTitle"
                @click="requestApply('title')"
                >{{ t('ai.reply.replaceTitle') }}</BButton
              >
              <BButton
                v-if="resultFormat !== 'title' || hasBody"
                type="primary"
                :disabled="!canApplyBody"
                @click="requestApply('body')"
                >{{ t('ai.reply.replaceContent') }}</BButton
              >
            </div>
          </div>
        </div>
      </template>
    </BModal>
  </div>
</template>

<script lang="ts" setup>
  import { computed, getCurrentInstance, inject, nextTick, onBeforeUnmount, ref, watch, watchEffect } from 'vue';
  import { useI18n } from 'vue-i18n';
  import TypewriterOutput from '@/components/base/TypewriterOutput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import icon from '@/config/icon';
  import { createAiSkillRequest, executeAiSkillStream } from '@/api/aiSkillApi';
  import { recordAiSkillApplied } from '@/api/aiTelemetry';
  import { noteDisplayText } from '@/utils/common.ts';
  import { hasMeaningfulNoteContent } from '@/utils/noteTree';
  import DOMPurify from 'dompurify';
  import { renderStreamingMarkdown } from '@/utils/aiMessageRender';
  import { getAiQuotaErrorPresentation } from '@/utils/aiQuotaErrorPresentation';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { useUiDensity } from '@/composables/useUiDensity';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { useDensityScrollAnchor } from '@/composables/useDensityScrollAnchor';

  const { t } = useI18n();
  const { dimension } = useUiDensity();
  const isMobileLayout = useMobileLayout();
  const containerRef = ref<HTMLElement | null>(null);
  const outputRef = ref<{ $el: HTMLElement } | null>(null);
  const outputScrollElement = computed(() => outputRef.value?.$el ?? null);
  useDensityScrollAnchor(containerRef);
  useDensityScrollAnchor(outputScrollElement);

  const note = inject<any>('note', null);
  const applyTitleFromAi = inject<((title: string) => void) | null>('applyTitleFromAi', null);
  const applyContentFromAi = inject<((content: string, type: 'html' | 'markdown') => Promise<void> | void) | null>(
    'applyContentFromAi',
    null,
  );
  const triggerSave = inject<(() => void) | null>('triggerSave', null);
  const focusEditorToEnd = inject<(() => void) | null>('focusEditorToEnd', null);
  const prompt = ref('');
  const requirementsExpanded = ref(false);
  const requirementsId = `note-ai-requirements-${getCurrentInstance()?.uid}`;
  const requirementsInputId = `${requirementsId}-input`;
  const resultAction = ref('');
  const followupPrompt = ref('');
  const outputFull = ref('');
  const lastAction = ref('');
  const isLoading = ref(false);
  type ResultFormat = 'title' | 'body' | 'both';
  const resultFormat = ref<ResultFormat>('both');
  const requestCompleted = ref(false);
  const completedRequestId = ref('');
  const previewVisible = ref(false);
  const abortController = ref<AbortController | null>(null);
  type GenerationPhase = 'idle' | 'connecting' | 'waiting' | 'slow' | 'streaming';
  type GenerationFeedback = {
    type: 'error' | 'warning';
    text: string;
    retryable: boolean;
    reason?: 'empty_input';
  };
  const generationPhase = ref<GenerationPhase>('idle');
  const generationFeedback = ref<GenerationFeedback | null>(null);
  const outputTruncated = ref(false);
  const lastGenerationMode = ref<'action' | 'custom'>('action');
  let slowGenerationTimer: number | null = null;
  const isMarkdownNote = computed(() => note?.type === 'markdown');

  watch(
    [() => note?.content, () => note?.type, () => note?.id],
    () => {
      if (generationFeedback.value?.reason === 'empty_input') generationFeedback.value = null;
    },
    { flush: 'sync' },
  );

  const clearGenerationTimer = () => {
    if (slowGenerationTimer !== null) {
      clearTimeout(slowGenerationTimer);
      slowGenerationTimer = null;
    }
  };
  const scheduleSlowGenerationHint = () => {
    clearGenerationTimer();
    slowGenerationTimer = window.setTimeout(() => {
      if (isLoading.value && (generationPhase.value === 'connecting' || generationPhase.value === 'waiting')) {
        generationPhase.value = 'slow';
      }
    }, 12_000);
  };
  const generationStatusText = computed(() => {
    if (generationPhase.value === 'connecting') return t('ai.reply.connecting');
    if (generationPhase.value === 'slow') return t('ai.reply.responseSlow');
    return t('ai.reply.waitingFirstToken');
  });

  // 字数按"渲染后页面展示文本"计(html: DOM textContent; md: marked 渲染后取文本),与历史版本口径一致
  const textLength = ref(0);
  watchEffect(async () => {
    textLength.value = (await noteDisplayText(note?.content || '', note?.type)).length;
  });

  // 放大弹框自动滚动:经典"贴底跟随"——每段新内容到来时,先测用户当前是否在底部附近(阈值 120px),
  // 是则内容增长后贴到底;上滚离开则自然停住;滚回底部附近下一段又自动恢复。判断每次都基于真实滚动位置,
  // 无粘滞状态、无 wheel 监听,恢复必然可靠(旧写法用 interrupted 标志+wheel,回底后会被紧接的滚轮事件再次关掉)。
  const previewBodyRef = ref<HTMLElement | null>(null);
  const previewOriginBodyRef = ref<HTMLElement | null>(null);
  useDensityScrollAnchor(previewBodyRef);
  useDensityScrollAnchor(previewOriginBodyRef);
  const previewSplitRef = ref<HTMLElement | null>(null);
  // 仅在打开中的预览开始生成时记住实际阅读高度，避免流式内容反复推移页脚。
  const previewReadingHeight = ref<number>();
  const holdPreviewReadingHeight = () => {
    if (!previewVisible.value || previewReadingHeight.value) return;
    previewReadingHeight.value = Math.max(previewSplitRef.value?.getBoundingClientRect().height || 0, dimension(280));
  };
  const PREVIEW_SCROLL_THRESHOLD = 120;

  const isPreviewNearBottom = () => {
    const el = previewBodyRef.value;
    if (!el) return false;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= PREVIEW_SCROLL_THRESHOLD;
  };
  const scrollPreviewToBottom = () => {
    const el = previewBodyRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // 放大预览逐字缓冲:小窗靠 TypewriterOutput 内部逐字所以流式丝滑;放大弹框原来直接 v-html(outputFull),
  // 只能按后端 SSE chunk 粒度整段刷新 → 观感一段段卡顿。这里对放大内容做「自适应逐字追赶」,与小窗一致平滑;
  // 破碎的 HTML 前缀由浏览器容错渲染(同 TypewriterOutput 机制)。
  const previewTyped = ref('');
  const safePreviewTyped = computed(() =>
    DOMPurify.sanitize(previewTyped.value, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'strong',
        'em',
        'ul',
        'ol',
        'li',
        'blockquote',
        'code',
        'pre',
      ],
      ALLOWED_ATTR: [],
    }),
  );
  // markdown 笔记放大预览右侧的渲染结果(复用 AI 流式 markdown 渲染:补全未闭合标记 + 高亮 + 净化)
  const previewRenderedHtml = computed(() => renderStreamingMarkdown(previewTyped.value || ''));
  const SNAPSHOT_HTML_TAGS = [
    'p',
    'br',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'strong',
    'em',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
  ];
  // 放大预览左栏「原文」= 笔记当前内容(改动前),同样渲染后展示:md 走流式 md 渲染,html 直接净化;
  // 与右栏「AI 生成」形成改动前后对比,让用户看清 AI 到底改了什么再决定替换。
  const originRenderedHtml = computed(() => {
    const raw = note?.content || '';
    if (!raw) return '';
    return isMarkdownNote.value
      ? renderStreamingMarkdown(raw)
      : DOMPurify.sanitize(raw, { ALLOWED_TAGS: SNAPSHOT_HTML_TAGS, ALLOWED_ATTR: [] });
  });
  // 右栏「AI 生成」渲染结果:md 用流式 md 渲染,html 用净化后的片段
  const generatedRenderedHtml = computed(() =>
    isMarkdownNote.value ? previewRenderedHtml.value : safePreviewTyped.value,
  );
  const previewSource = ref('');
  let previewTypingTimer: number | null = null;
  const stopPreviewTyping = () => {
    if (previewTypingTimer) {
      clearTimeout(previewTypingTimer);
      previewTypingTimer = null;
    }
  };
  const pumpPreviewTyping = () => {
    if (previewTypingTimer) return; // 已在逐字,勿重复启动
    const tick = () => {
      const full = previewSource.value;
      if (previewTyped.value.length >= full.length) {
        previewTypingTimer = null;
        return;
      }
      const remaining = full.length - previewTyped.value.length;
      const add = Math.max(2, Math.floor(remaining / 20)); // 落后越多追越快、接近时放慢:平滑又不掉队
      previewTyped.value = full.slice(0, previewTyped.value.length + add);
      if (previewVisible.value && isPreviewNearBottom()) nextTick(scrollPreviewToBottom);
      previewTypingTimer = window.setTimeout(tick, 16);
    };
    previewTypingTimer = window.setTimeout(tick, 16);
  };

  // 弹框可见且生成中 → 逐字追赶;否则(未打开 / 已完成)直接同步为完整,避免打开已生成好的内容还从头打字。
  watch(
    [outputFull, previewVisible, isLoading],
    () => {
      if (previewVisible.value && isLoading.value) {
        pumpPreviewTyping();
      } else {
        stopPreviewTyping();
        previewTyped.value = previewSource.value;
      }
    },
    { immediate: true },
  );

  // 打开弹框:正在生成→贴底开始跟随;已完成→停在顶部方便阅读
  watch(previewVisible, (open) => {
    if (!open) {
      previewReadingHeight.value = undefined;
    } else if (isLoading.value) {
      nextTick(() => {
        holdPreviewReadingHeight();
        scrollPreviewToBottom();
      });
    }
  });

  const actionConfig: Record<string, { format: ResultFormat }> = {
    polishFull: { format: 'body' },
    optimizeTitle: { format: 'title' },
    generateSummary: { format: 'body' },
    correctErrors: { format: 'body' },
    continueWrite: { format: 'body' },
    translate: { format: 'body' },
    outline: { format: 'body' },
    custom: { format: 'body' },
  };

  const actionLabel = computed(() =>
    resultAction.value
      ? t(resultAction.value === 'custom' ? 'ai.reply.customAction' : `ai.reply.actions.${resultAction.value}`)
      : '',
  );
  const resultTitle = computed(() =>
    resultAction.value ? t(`ai.reply.resultTitles.${resultAction.value}`) : t('ai.reply.outputTitle'),
  );
  const resultHeading = computed(() =>
    isLoading.value ? t('ai.reply.generatingResult', { action: actionLabel.value }) : resultTitle.value,
  );

  // 部分动作需要给模型额外说明(泛化的"任务名"不足以表达期望)
  const ACTION_INSTRUCTION: Record<string, string> = {
    continueWrite: '请在完整保留原文的前提下，顺着语义自然地往下续写 1～3 段，返回「原文 + 续写」拼接后的完整内容。',
    translate: '请在中文与英文之间翻译（中文内容译成英文，英文内容译成中文，混合则以主要语言为准），保持段落结构。',
    outline: '请为内容提炼一份层级清晰的大纲（用标题层级和有序/无序列表）。',
  };

  const runAction = (action: string) => {
    if (isLoading.value) return;
    lastAction.value = action;
    generate('action');
  };

  // 放大预览里的「追问迭代」:基于当前生成结果继续修改,新版替换旧版
  const runFollowup = () => {
    if (isLoading.value || !followupPrompt.value.trim() || !outputFull.value.trim()) return;
    void generate('followup');
  };

  const stopGenerating = () => {
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
  };

  const retryGeneration = () => {
    if (isLoading.value) return;
    void generate(lastGenerationMode.value);
  };

  const skillOperation = (action: string) => {
    return (
      (
        {
          polishFull: 'polish',
          optimizeTitle: 'title',
          generateSummary: 'summarize',
          correctErrors: 'proofread',
          continueWrite: 'expand',
          translate: 'translate',
          outline: 'outline',
          custom: 'rewrite',
        } as const
      )[action as keyof typeof actionConfig] || 'rewrite'
    );
  };

  const skillInstruction = (action: string, requirement: string) => {
    const fixed = action === 'outline' ? '生成层级清晰的大纲，保留原文事实。' : ACTION_INSTRUCTION[action] || '';
    const format = isMarkdownNote.value
      ? '输出 Markdown 源文本并保留原有结构。'
      : '输出适配富文本编辑器的 HTML 片段，只使用 p、h1-h6、strong、em、ul、ol、li、blockquote 标签。';
    return [fixed, requirement, action === 'optimizeTitle' ? '' : format].filter(Boolean).join('\n');
  };

  const generate = async (mode: 'custom' | 'action' | 'followup' = 'action') => {
    if (isLoading.value) return;
    if (mode === 'custom' && !prompt.value.trim()) return;
    if (mode === 'followup' && (!followupPrompt.value.trim() || !outputFull.value.trim())) return;
    const action = mode === 'action' ? lastAction.value || 'custom' : 'custom';
    // 追问:在清空前抓取上一版结果与追问要求作为快照,格式沿用上一版
    const baseContent = mode === 'followup' ? outputFull.value : undefined;
    const followupReq = mode === 'followup' ? followupPrompt.value.trim() : '';
    const requirement = mode === 'followup' ? followupReq : prompt.value.trim();
    const expectedFormat = mode === 'followup' ? resultFormat.value || 'both' : actionConfig[action]?.format || 'both';
    const sourceText = mode === 'followup' ? baseContent || '' : String(note?.content || '');
    if (!hasMeaningfulNoteContent(sourceText, note?.type)) {
      generationFeedback.value = {
        type: 'warning',
        text: t('ai.reply.emptySourceHint'),
        retryable: false,
        reason: 'empty_input',
      };
      return;
    }
    holdPreviewReadingHeight();
    if (mode !== 'followup') {
      lastGenerationMode.value = mode;
      resultAction.value = action;
    }
    resultFormat.value = expectedFormat;
    requestCompleted.value = false;
    completedRequestId.value = '';
    outputFull.value = '';
    // 重置放大预览的逐字状态:否则追问时「上一版满内容」还留在 previewTyped 里,
    // 会因 previewTyped.length >= previewSource.length 卡住 pump,弹框要等新版长度追上旧版才更新
    previewTyped.value = '';
    previewSource.value = '';
    if (mode === 'followup') followupPrompt.value = '';
    outputTruncated.value = false;
    generationFeedback.value = null;
    generationPhase.value = 'connecting';
    isLoading.value = true;
    scheduleSlowGenerationHint();
    const requestController = new AbortController();
    abortController.value = requestController;
    let receivedContent = '';

    try {
      generationPhase.value = 'waiting';
      const operation = mode === 'followup' ? 'rewrite' : skillOperation(action);
      const targetLanguage = operation === 'translate' ? (/\p{Script=Han}/u.test(sourceText) ? '英语' : '中文') : '';
      const marker = expectedFormat === 'title' ? '【标题】\n' : '【正文】\n';
      outputFull.value = marker;
      const response = await executeAiSkillStream(
        createAiSkillRequest({
          skillId: 'note.transform_text',
          input: {
            text: sourceText,
            operation,
            instruction: skillInstruction(action, requirement),
            ...(targetLanguage ? { targetLanguage } : {}),
          },
          surface: 'note.detail',
        }),
        {
          signal: requestController.signal,
          onDelta(content) {
            if (!content || requestController.signal.aborted) return;
            if (!receivedContent) {
              generationPhase.value = 'streaming';
              clearGenerationTimer();
            }
            receivedContent += content;
            outputFull.value = `${marker}${receivedContent}`;
          },
          onReset() {
            receivedContent = '';
            outputFull.value = marker;
            generationPhase.value = 'waiting';
            scheduleSlowGenerationHint();
          },
        },
      );
      if (requestController.signal.aborted) return;
      if (response.result?.kind !== 'grounded_markdown') throw new Error('AI Skill 返回了不兼容的结果');
      const content = String(response.result.content || '').trim();
      if (!content) throw new Error('AI Skill 没有返回可用内容');
      generationPhase.value = 'streaming';
      clearGenerationTimer();
      // 完成事件携带经过服务端最终校验的规范结果。以它覆盖增量缓冲，防止代理层
      // 合并 chunk 时出现极小差异，同时保留首字到达即展示的真实流式体验。
      outputFull.value = `${marker}${content}`;
      completedRequestId.value = response.requestId;
      requestCompleted.value = true;
    } catch (error: any) {
      console.error('AI 回复生成失败:', error);
      // 首段正文尚未到达时不要把内部协议标记当成 AI 结果展示；已有部分正文则保留，方便用户读取。
      if (!receivedContent) outputFull.value = '';
      if (requestController.signal.aborted || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
        generationFeedback.value = {
          type: 'warning',
          text: t('ai.reply.generationStopped'),
          retryable: true,
        };
      } else {
        const quotaFailure = getAiQuotaErrorPresentation(error, (key, params) => t(key, params));
        generationFeedback.value = {
          type: 'error',
          text: quotaFailure?.message || String(error?.message || t('ai.reply.generationFailed')),
          retryable: quotaFailure?.retryable ?? true,
        };
      }
    } finally {
      clearGenerationTimer();
      isLoading.value = false;
      generationPhase.value = 'idle';
      if (abortController.value === requestController) abortController.value = null;
    }
  };

  const stripMarkdown = (text: string) => {
    return text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/#+\s*/g, '')
      .replace(/\r/g, '');
  };

  const findSectionMarker = (text: string, key: '标题' | '正文') => {
    const match = new RegExp(`(?:\\*\\*|__)?【${key}】(?:\\*\\*|__)?`).exec(text);
    if (!match || match.index === undefined) return null;
    return { start: match.index, end: match.index + match[0].length };
  };

  const extractSection = (text: string, key: '标题' | '正文') => {
    // 直接在原文定位标记，既去掉标记外围的 Markdown 强调符，又保留正文自身的 Markdown 语法。
    const marker = findSectionMarker(text, key);
    if (marker) {
      const bodyMarker = key === '标题' ? findSectionMarker(text, '正文') : null;
      const end = bodyMarker && bodyMarker.start > marker.end ? bodyMarker.start : text.length;
      return text.slice(marker.end, end).trim();
    }

    // 最后兜底：兼容模型输出了无法直接识别的 Markdown 包装。
    const normalized = stripMarkdown(text);
    const normalizedMarker = findSectionMarker(normalized, key);
    if (!normalizedMarker) return '';
    const bodyMarker = key === '标题' ? findSectionMarker(normalized, '正文') : null;
    const end = bodyMarker && bodyMarker.start > normalizedMarker.end ? bodyMarker.start : normalized.length;
    return normalized.slice(normalizedMarker.end, end).trim();
  };

  const unwrapMarkdownFence = (text: string) => {
    const match = text.trim().match(/^```(?:markdown|md)\s*\n([\s\S]*?)\n```$/i);
    return (match?.[1] || text).trim();
  };

  const buildBodyContent = () => {
    const body = extractSection(outputFull.value, '正文');
    if (!body) return '';
    if (isMarkdownNote.value) return unwrapMarkdownFence(body);
    const hasHtmlTag = /<\/?[a-z][\s\S]*?>/i.test(body);
    const html = hasHtmlTag
      ? body.trim()
      : body
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => `<p>${line}</p>`)
          .join('');
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'strong',
        'em',
        'ul',
        'ol',
        'li',
        'blockquote',
        'code',
        'pre',
      ],
      ALLOWED_ATTR: [],
    });
  };

  // 预览与“替换标题”共用同一个首行，避免用户看到的建议与实际写入标题不一致。
  const suggestedTitle = computed(() => {
    const titleSection = extractSection(outputFull.value, '标题');
    return (
      titleSection
        .split('\n')
        .find((line) => line.trim())
        ?.trim() || ''
    );
  });
  const hasTitle = computed(() => Boolean(suggestedTitle.value));
  const hasBody = computed(() => Boolean(extractSection(outputFull.value, '正文')));
  const missingMarkers = computed(() => {
    const markers: string[] = [];
    if ((resultFormat.value === 'title' || resultFormat.value === 'both') && !hasTitle.value) markers.push('【标题】');
    if ((resultFormat.value === 'body' || resultFormat.value === 'both') && !hasBody.value) markers.push('【正文】');
    return markers;
  });
  const formatInvalid = computed(
    () => requestCompleted.value && Boolean(outputFull.value) && missingMarkers.value.length > 0,
  );

  const canApplyTitle = computed(
    () => requestCompleted.value && !isLoading.value && !formatInvalid.value && hasTitle.value,
  );
  const canApplyBody = computed(
    () => requestCompleted.value && !isLoading.value && !formatInvalid.value && hasBody.value,
  );
  const applyHint = computed(() =>
    !requestCompleted.value || formatInvalid.value
      ? t('ai.reply.applyWaitingHint')
      : t(resultFormat.value === 'title' ? 'ai.reply.titleApplyHint' : 'ai.reply.bodyApplyHint'),
  );

  // 展示正文结果而非协议标记；Markdown 笔记交给 TypewriterOutput 做增量 Markdown 渲染。
  const displayOutput = computed(() => {
    if (!outputFull.value) return '';
    const body = extractSection(outputFull.value, '正文');
    if (body) return isMarkdownNote.value ? unwrapMarkdownFence(body) : body;
    const title = extractSection(outputFull.value, '标题');
    if (title) return title;
    // 还没解析到【标题】/【正文】标记:生成中先别显示含标记的原始流(否则标记逐字到达时会闪现"【正文】"),
    // 等标记到齐再显示提取后的内容;生成已结束仍无标记 = 模型没按格式输出,才兜底显示原文让用户至少看到内容。
    return isLoading.value ? '' : outputFull.value;
  });
  const showGenerationStatus = computed(() => isLoading.value && !displayOutput.value);
  watch(
    displayOutput,
    (content) => {
      previewSource.value = content;
      if (!previewVisible.value || !isLoading.value) previewTyped.value = content;
    },
    { immediate: true },
  );

  const applyResult = async (which: 'body' | 'title') => {
    if (!note || !outputFull.value) return false;
    const requestId = completedRequestId.value;
    if (which === 'body') {
      const content = buildBodyContent();
      if (!content) return false;
      if (applyContentFromAi) {
        await applyContentFromAi(content, isMarkdownNote.value ? 'markdown' : 'html');
      } else {
        note.content = content;
      }
      triggerSave?.();
      focusEditorToEnd?.();
      void recordAiSkillApplied({
        skillId: 'note.transform_text',
        requestId,
        adoptionKind: 'insert',
        surface: 'note.detail',
        resourceType: 'note',
        resourceCount: 1,
      });
      message.success(t('ai.reply.replacedBody'));
      return true;
    }

    if (!suggestedTitle.value) return false;
    if (applyTitleFromAi) {
      applyTitleFromAi(suggestedTitle.value);
    } else {
      note.title = suggestedTitle.value;
    }
    triggerSave?.();
    void recordAiSkillApplied({
      skillId: 'note.transform_text',
      requestId,
      adoptionKind: 'insert',
      surface: 'note.detail',
      resourceType: 'note',
      resourceCount: 1,
    });
    message.success(t('ai.reply.replacedTitle'));
    return true;
  };

  const requestApply = (which: 'body' | 'title', closePreview = false) => {
    const apply = async () => {
      const applied = await applyResult(which);
      if (applied && closePreview) previewVisible.value = false;
    };
    const runApply = () => {
      void apply().catch((error) => console.error('应用 AI 建议失败:', error));
    };

    if (!outputTruncated.value) {
      runApply();
      return;
    }

    Alert.alert({
      title: t('ai.reply.truncatedConfirmTitle'),
      content: t('ai.reply.truncatedConfirmContent'),
      okText: t('ai.reply.applyTruncated'),
      cancelText: t('common.cancel'),
      onOk: runApply,
    });
  };

  const clearOutput = () => {
    resultAction.value = '';
    outputFull.value = '';
    requestCompleted.value = false;
    completedRequestId.value = '';
    outputTruncated.value = false;
    generationFeedback.value = null;
  };

  onBeforeUnmount(() => {
    clearGenerationTimer();
    stopPreviewTyping();
    abortController.value?.abort();
  });
</script>

<style lang="less" scoped>
  @import (reference) '@/assets/css/workspace-surfaces.less';

  .ai-container {
    .workspace-canvas-surface();
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-12, 12px);
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px) var(--ui-space-16, 16px);
    box-sizing: border-box;
    overflow: auto;
    color: var(--workspace-text);
  }

  .ai-note-meta {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
    padding-bottom: var(--ui-space-12, 12px);
    border-bottom: 1px solid var(--workspace-divider);
    font-size: var(--ui-font-13, 13px);
  }
  .ai-note-meta > :first-child {
    flex-shrink: 0;
    color: var(--workspace-muted);
  }
  .note-context-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .note-context-length {
    flex-shrink: 0;
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }

  .ai-quick-actions {
    flex: 0 0 auto;
  }
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--ui-space-4, 4px) var(--ui-space-8, 8px);
    margin-bottom: var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
    font-weight: 600;
  }
  .section-hint {
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
    font-weight: 400;
    line-height: 1.5;
  }
  .ai-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  .action-btn {
    .workspace-content-surface();
    flex: 0 1 auto;
    max-width: 100%;
    height: auto;
    min-height: var(--ui-control-32, 32px);
    padding: var(--ui-space-6, 6px) var(--ui-space-10, 10px);
    border-width: 1px;
    border-style: solid;
    border-radius: 8px;
    font-size: var(--ui-font-13, 13px);
    line-height: 1.35;
    white-space: normal;
  }
  .action-btn:not(:disabled):hover {
    background: var(--workspace-hover);
    border-color: var(--workspace-purple-text);
    color: var(--workspace-purple-text);
  }
  .ai-input {
    flex: 0 0 auto;
    min-width: 0;
    border-top: 1px solid var(--workspace-divider);
    border-bottom: 1px solid var(--workspace-divider);
  }
  .requirements-toggle {
    display: flex;
    gap: var(--ui-space-6, 6px);
    width: 100%;
    height: auto;
    min-height: var(--ui-control-32, 32px);
    padding: var(--ui-space-6, 6px) 0;
    color: var(--workspace-text);
    font-size: var(--ui-font-13, 13px);
    font-weight: 500;
    line-height: 1.4;
    text-align: left;
    white-space: normal;
  }
  .requirements-chevron {
    flex-shrink: 0;
    transform: rotate(-90deg);
    transition: transform 0.15s;
  }
  .requirements-chevron.is-open {
    transform: rotate(0);
  }
  .requirements-summary {
    margin-left: auto;
    flex-shrink: 0;
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-12, 12px);
  }
  .requirements-fields {
    display: grid;
    gap: var(--ui-space-8, 8px);
    padding-bottom: var(--ui-space-12, 12px);
  }
  .requirements-fields :deep(.b-textarea) {
    min-height: var(--ui-layout-56, 56px);
    max-height: var(--ui-layout-120, 120px);
    font-size: var(--ui-font-13, 13px);
    resize: vertical;
  }
  .custom-process-btn {
    justify-self: end;
    font-size: var(--ui-font-12, 12px);
    border: 1px solid var(--workspace-border);
    background: var(--workspace-content);
  }

  .ai-output {
    .workspace-content-surface();
    display: flex;
    flex: 1 0 var(--ui-layout-220, 220px);
    flex-direction: column;
    min-width: 0;
    min-height: var(--ui-layout-180, 180px);
    border-width: 1px;
    border-style: solid;
    border-radius: 10px;
    overflow: hidden;
  }
  .output-header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-6, 6px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border-bottom: 1px solid var(--workspace-divider);
  }
  .output-heading {
    display: flex;
    flex: 1 1 var(--ui-layout-120, 120px);
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--ui-space-5, 5px) var(--ui-space-10, 10px);
    min-width: 0;
  }
  .result-title {
    min-width: 0;
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .result-complete {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--ui-space-3, 3px);
    color: var(--success-color);
    font-size: var(--ui-font-11, 11px);
    font-weight: 400;
    white-space: nowrap;
  }
  .output-actions {
    display: flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
    margin-left: auto;
  }
  .icon-btn {
    width: var(--ui-control-28, 28px);
    height: var(--ui-control-28, 28px);
    padding: 0;
    background: transparent;
    color: var(--workspace-muted);
  }
  .icon-btn:not(:disabled):hover {
    color: var(--workspace-text);
    background: var(--workspace-hover);
  }
  .stop-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-6, 6px);
    height: var(--ui-control-28, 28px);
    padding: 0 var(--ui-space-8, 8px);
    border: 1px solid var(--surface-border-color);
    background: var(--card-background);
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
  }
  .stop-icon {
    width: var(--ui-layout-8, 8px);
    height: var(--ui-layout-8, 8px);
    flex-shrink: 0;
    background: currentColor;
    border-radius: 1px;
  }

  .output-reading {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
  }
  .output-body {
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--ui-space-12, 12px);
    overflow: auto;
    box-sizing: border-box;
  }
  .output-body :deep(.typewriter-content) {
    margin: 0;
    /* ui-density-fixed: AI 正文排版独立于界面密度，保留原型的阅读字号。 */
    font-size: 15px;
    line-height: 1.65;
    color: var(--workspace-text);
  }
  .output-body :deep(.typewriter-content--markup) {
    white-space: normal;
  }
  .output-body :deep(.typewriter-content--plain) {
    white-space: pre-wrap;
  }
  .output-body :deep(p),
  .output-body :deep(blockquote) {
    /* ui-density-fixed: 正文段落间距跟随阅读字号。 */
    margin: 0 0 0.65em;
  }
  .output-body :deep(ul),
  .output-body :deep(ol) {
    /* ui-density-fixed: 正文列表间距跟随阅读字号。 */
    margin: 0.5em 0;
    padding-left: 1.55em;
  }
  .output-body :deep(li) {
    /* ui-density-fixed: 正文列表项间距跟随阅读字号。 */
    margin: 0.2em 0;
  }
  .output-body :deep(h1),
  .output-body :deep(h2),
  .output-body :deep(h3),
  .output-body :deep(h4),
  .output-body :deep(h5),
  .output-body :deep(h6) {
    /* ui-density-fixed: 正文标题间距跟随阅读字号。 */
    margin: 0.85em 0 0.4em;
    /* ui-density-fixed: 结果标题与正文保持文档排版层级。 */
    font-size: 1.12em;
    line-height: 1.4;
  }
  .output-body :deep(.typewriter-content--markup > :first-child) {
    margin-top: 0;
  }
  .output-body :deep(.typewriter-content--markup > :last-child) {
    margin-bottom: 0;
  }

  .output-footer,
  .ai-preview-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  .output-footer {
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border-top: 1px solid var(--workspace-divider);
  }
  .apply-hint {
    flex: 1 1 var(--ui-layout-100, 100px);
    min-width: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.5;
  }
  .apply-actions {
    display: flex;
    flex: 0 1 auto;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    margin-left: auto;
  }
  .apply-actions > .b_btn {
    max-width: 100%;
    padding: 0 var(--ui-space-12, 12px);
    font-size: var(--ui-font-12, 12px);
  }
  .apply-actions > .primary_btn:disabled {
    background: var(--menu-item-h-bg-color);
    color: var(--desc-color);
  }

  .format-warning,
  .truncation-warning,
  .generation-feedback,
  .generation-status {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    border-bottom: 1px solid var(--surface-divider-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .truncation-warning,
  .generation-feedback {
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .format-warning,
  .truncation-warning,
  .generation-feedback.is-warning {
    color: var(--warning-color);
  }
  .generation-feedback.is-error {
    color: var(--error-color);
  }
  .generation-status {
    color: var(--desc-color);
  }
  .generation-status :deep(.b-loading-inline) {
    min-height: var(--ui-layout-20, 20px);
    font-size: inherit;
    color: inherit;
  }
  .truncation-warning > span,
  .generation-feedback > span {
    flex: 1 1 var(--ui-layout-140, 140px);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .generation-feedback-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-6, 6px);
  }
  .status-action-btn {
    flex-shrink: 0;
    height: var(--ui-control-28, 28px);
    padding: 0 var(--ui-space-8, 8px);
    border: 1px solid var(--surface-border-color);
    background: var(--card-background);
    color: inherit;
    font-size: var(--ui-font-12, 12px);
  }

  .title-suggestion,
  .ai-preview-title {
    flex: 0 0 auto;
    display: grid;
    gap: var(--ui-space-4, 4px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .title-suggestion-label {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .title-suggestion-value {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .ai-preview-heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--ui-space-4, 4px) var(--ui-space-12, 12px);
    min-width: 0;
  }
  .ai-preview-context {
    max-width: min(var(--ui-layout-460, 460px), 50vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ui-font-12, 12px);
    font-weight: 400;
    color: var(--desc-color);
  }
  .ai-preview {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .ai-preview-title {
    margin-bottom: var(--ui-space-12, 12px);
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
  }
  .ai-preview-split {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--ui-space-16, 16px);
    min-height: 0;
  }
  .ai-preview-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    gap: var(--ui-space-8, 8px);
  }
  .ai-preview-col-head {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-6, 6px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 500;
  }
  .ai-preview-body {
    display: block;
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--ui-space-12, 12px);
    border: 1px solid var(--surface-divider-color);
    border-radius: 8px;
    overflow: auto;
    white-space: normal;
    overflow-wrap: anywhere;
    /* ui-density-fixed: AI 结果和原文的阅读排版独立于界面密度。 */
    font-size: 15px;
    line-height: 1.65;
    color: var(--text-color);
  }
  .ai-preview-col--origin .ai-preview-body {
    background: var(--surface-panel-bg);
  }
  .ai-preview-body :deep(p),
  .ai-preview-body :deep(blockquote) {
    /* ui-density-fixed: 原文和结果的段落间距跟随阅读字号。 */
    margin: 0 0 0.65em;
  }
  .ai-preview-body :deep(li) {
    /* ui-density-fixed: 文档列表项间距跟随阅读字号。 */
    margin: 0.2em 0;
  }
  .ai-preview-body :deep(ul),
  .ai-preview-body :deep(ol) {
    /* ui-density-fixed: 文档列表间距跟随阅读字号。 */
    margin: 0.5em 0;
    /* ui-density-fixed: 文档列表缩进跟随阅读字号。 */
    padding-left: 1.6em;
  }
  .ai-preview-body :deep(h1),
  .ai-preview-body :deep(h2),
  .ai-preview-body :deep(h3),
  .ai-preview-body :deep(h4),
  .ai-preview-body :deep(h5),
  .ai-preview-body :deep(h6) {
    /* ui-density-fixed: 文档标题间距跟随阅读字号。 */
    margin: 0.85em 0 0.4em;
    /* ui-density-fixed: 预览标题与正文保持文档排版层级。 */
    font-size: 1.15em;
    line-height: 1.4;
  }
  .ai-preview-body :deep(pre) {
    max-width: 100%;
    overflow: auto;
  }
  .ai-preview-body :deep(> div > :first-child),
  .ai-preview-body > :first-child {
    margin-top: 0;
  }
  .ai-preview-body :deep(> div > :last-child),
  .ai-preview-body > :last-child {
    margin-bottom: 0;
  }
  .ai-preview-body .generation-status,
  .ai-preview-body .generation-feedback,
  .ai-preview-body .format-warning,
  .ai-preview-body .truncation-warning {
    padding: 0 0 var(--ui-space-10, 10px);
    margin-bottom: var(--ui-space-10, 10px);
  }

  .ai-preview-footer {
    flex: 0 0 auto;
    min-width: 0;
    padding: var(--ui-space-12, 12px) var(--ui-space-20, 20px) var(--ui-space-16, 16px);
    border-top: 1px solid var(--surface-divider-color);
  }
  .ai-preview-followup {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
  }
  .ai-preview-followup > .input-container {
    flex: 1 1 auto;
    min-width: 0;
  }
  .ai-preview-followup__send {
    flex-shrink: 0;
    height: var(--ui-control-32, 32px);
    font-size: var(--ui-font-12, 12px);
  }
  .ai-preview-actions {
    margin-top: var(--ui-space-12, 12px);
    padding-top: var(--ui-space-12, 12px);
    border-top: 1px solid var(--surface-divider-color);
  }
  .ai-preview.is-mobile .ai-preview-split {
    grid-template-columns: minmax(0, 1fr);
  }
  .ai-preview.is-mobile .ai-preview-col--origin {
    display: none;
  }
  .ai-container.is-mobile .icon-btn {
    width: var(--ui-control-44, 44px);
    height: var(--ui-control-44, 44px);
  }
  .ai-preview-footer.is-mobile .apply-actions > .b_btn {
    height: var(--ui-control-44, 44px);
  }

  @media (prefers-reduced-motion: reduce) {
    .requirements-chevron {
      transition: none;
    }
  }
</style>

<style lang="less">
  // BModal 的 Teleport 外壳用专用类限定；阅读区可收缩，页脚始终留在可见区域。
  .modal-view.note-ai-preview-dialog {
    border: 1px solid var(--surface-border-color);

    .modal-title {
      min-width: 0;
      flex: 1;
      margin-right: var(--ui-space-12, 12px);
    }
    .modal-header {
      border-bottom-color: var(--surface-divider-color);
    }
    .note-ai-preview-content {
      display: flex;
      flex: 0 1 auto;
      min-height: 0;
      overflow: hidden;
    }

    &.is-mobile-fullscreen {
      .modal-content.note-ai-preview-content {
        flex: 1 1 auto;
        padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px);
      }
      .ai-preview-footer {
        padding-bottom: calc(var(--ui-space-16, 16px) + env(safe-area-inset-bottom));
      }
    }
  }
</style>
