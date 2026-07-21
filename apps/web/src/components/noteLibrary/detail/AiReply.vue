<template>
  <div class="ai-container">
    <div class="ai-header">
      <div class="ai-title">
        <span class="dot"></span>
        <span>{{ t('ai.reply.title') }}</span>
      </div>
      <div class="ai-subtitle">{{ t('ai.reply.subtitle') }}</div>
    </div>

    <div class="ai-note-meta">
      <div class="meta-row">
        <span class="label">{{ t('ai.reply.metaTitle') }}</span>
        <span class="value" :title="note?.title">{{ note?.title || t('ai.reply.untitled') }}</span>
      </div>
      <div class="meta-row">
        <span class="label">{{ t('ai.reply.metaContentLength') }}</span>
        <span class="value">{{ textLength }} {{ t('ai.reply.wordCount') }}</span>
      </div>
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

    <div class="ai-input">
      <div class="input-label">{{ t('ai.reply.inputLabel') }}</div>
      <BInput v-model:value="prompt" type="textarea" :rows="2" :placeholder="t('ai.reply.inputPlaceholder')" />
      <BButton v-if="isLoading" class="stop-btn" @click="stopGenerating" :title="t('ai.reply.stop', '停止生成')" v-click-log="{ module: '笔记-AI助手', operation: '停止生成' }">
        <span class="stop-icon"></span>
        {{ t('ai.reply.stop', '停止生成') }}
      </BButton>
      <BButton
        v-else
        class="primary-btn"
        :disabled="!prompt.trim()"
        @click="generate('custom')"
        :title="t('ai.reply.processButton')"
        v-click-log="{ module: '笔记-AI助手', operation: '自定义处理' }"
      >
        {{ t('ai.reply.processButton') }}
      </BButton>
    </div>

    <div class="ai-output">
      <div class="output-header">
        <span style="max-width: 100px; min-width: 0" class="text-hidden">{{ t('ai.reply.outputTitle') }}</span>
        <div v-if="outputFull" class="output-actions">
          <BButton
            v-if="canApplyBody"
            style="max-width: 100px"
            class="ghost-btn text-hidden"
            @click="requestApply('body')"
            :title="t('ai.reply.replaceContent')"
            v-click-log="{ module: '笔记-AI助手', operation: '插入到笔记' }"
            >{{ t('ai.reply.replaceContent') }}</BButton
          >
          <BButton
            v-if="canApplyTitle"
            style="max-width: 100px"
            class="ghost-btn text-hidden"
            @click="requestApply('title')"
            :title="t('ai.reply.replaceTitle')"
            v-click-log="{ module: '笔记-AI助手', operation: '替换标题' }"
            >{{ t('ai.reply.replaceTitle') }}</BButton
          >
          <BButton class="ghost-btn icon-btn" @click="previewVisible = true" :title="t('ai.reply.expand')" v-click-log="{ module: '笔记-AI助手', operation: '放大预览' }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
          </BButton>
          <BButton class="ghost-btn icon-btn" :disabled="isLoading" @click="clearOutput" :title="t('ai.reply.clear')" v-click-log="{ module: '笔记-AI助手', operation: '清空输出' }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>
          </BButton>
        </div>
      </div>
      <div v-if="formatInvalid" class="format-warning">
        {{ t('ai.reply.formatInvalid', { markers: missingMarkers.join(t('ai.reply.markerSeparator')) }) }}
      </div>
      <div v-if="outputTruncated" class="truncation-warning" role="status">
        <span>{{ t('ai.reply.truncatedHint') }}</span>
        <div class="generation-feedback-actions">
          <BButton class="status-action-btn" @click="retryGeneration">{{ t('ai.reply.retry') }}</BButton>
          <BButton class="status-action-btn" @click="runAction('generateSummary')">{{ t('ai.reply.actions.generateSummary') }}</BButton>
        </div>
      </div>
      <div v-if="showGenerationStatus" class="generation-status" role="status" aria-live="polite">
        <BLoading inline :loading="true" :title="generationStatusText" />
      </div>
      <div v-if="generationFeedback" :class="['generation-feedback', `is-${generationFeedback.type}`]" role="status">
        <span>{{ generationFeedback.text }}</span>
        <BButton v-if="generationFeedback.retryable" class="status-action-btn" @click="retryGeneration">
          {{ t('ai.reply.retry') }}
        </BButton>
      </div>
      <div v-if="hasTitle && hasBody" class="title-suggestion">
        <span class="title-suggestion-label">{{ t('ai.reply.suggestedTitle') }}</span>
        <span class="title-suggestion-value">{{ suggestedTitle }}</span>
      </div>
      <TypewriterOutput
        v-if="displayOutput || (!isLoading && !generationFeedback)"
        class="output-body"
        :typing-speed="1"
        :content="displayOutput"
        :render-as-text="isMarkdownNote"
        :empty-text="t('ai.reply.emptyMessage')"
      />
    </div>

    <!-- 放大预览:输出区太窄小时,一键弹大窗舒服阅读,并可直接应用。
         必须放在 .ai-container 内部 —— 若作为第二个根节点会使组件变多根,导致父级 class="ai-panel"(定宽)无法继承,面板会被内容撑宽。 -->
    <BModal v-model:visible="previewVisible" :title="t('ai.reply.outputTitle')" :show-footer="false" width="auto">
      <div class="ai-preview" :class="{ 'ai-preview--split': isMarkdownNote }">
        <div v-if="hasTitle && hasBody" class="ai-preview-title">
          <span class="title-suggestion-label">{{ t('ai.reply.suggestedTitle') }}</span>
          <span class="title-suggestion-value">{{ suggestedTitle }}</span>
        </div>
        <!-- markdown 笔记:左侧 markdown 原文、右侧渲染预览,让用户看清替换后的实际效果 -->
        <div v-if="isMarkdownNote" class="ai-preview-split">
          <pre class="ai-preview-md">{{ previewTyped }}</pre>
          <div class="ai-preview-body" ref="previewBodyRef" v-html="previewRenderedHtml"></div>
        </div>
        <div v-else class="ai-preview-body" ref="previewBodyRef" v-html="safePreviewTyped"></div>
        <div class="ai-preview-followup">
          <BInput
            v-model:value="followupPrompt"
            :placeholder="t('ai.reply.followupPlaceholder')"
            :disabled="isLoading"
            @enter="runFollowup"
          />
          <BButton
            class="ghost-btn ai-preview-followup__send"
            :loading="isLoading"
            :disabled="!followupPrompt.trim() || !outputFull"
            @click="runFollowup"
            v-click-log="{ module: '笔记-AI助手', operation: '追问迭代' }"
            >{{ t('ai.reply.followupSend') }}</BButton
          >
        </div>
        <div class="ai-preview-actions">
          <BButton class="ghost-btn" :disabled="!canApplyBody" @click="requestApply('body', true)">{{ t('ai.reply.replaceContent') }}</BButton>
          <BButton class="ghost-btn" :disabled="!canApplyTitle" @click="requestApply('title', true)">{{ t('ai.reply.replaceTitle') }}</BButton>
        </div>
      </div>
    </BModal>
  </div>
</template>

<script lang="ts" setup>
  import { computed, inject, nextTick, onBeforeUnmount, ref, watch, watchEffect } from 'vue';
  import { useI18n } from 'vue-i18n';
  import axios from 'axios';
  import TypewriterOutput from '@/components/base/TypewriterOutput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { apiBasePost } from '@/http/request';
  import { noteDisplayText } from '@/utils/common.ts';
  import DOMPurify from 'dompurify';
  import { renderStreamingMarkdown } from '@/utils/aiMessageRender';
  import { consumeAiSseChunk, flushAiSseBuffer, type AiSseEvent } from '@/utils/aiSse';

  const { t } = useI18n();

  const note = inject<any>('note', null);
  const applyTitleFromAi = inject<((title: string) => void) | null>('applyTitleFromAi', null);
  const applyContentFromAi = inject<((content: string, type: 'html' | 'markdown') => Promise<void> | void) | null>(
    'applyContentFromAi',
    null,
  );
  const triggerSave = inject<(() => void) | null>('triggerSave', null);
  const focusEditorToEnd = inject<(() => void) | null>('focusEditorToEnd', null);
  const prompt = ref('');
  const followupPrompt = ref('');
  const outputFull = ref('');
  const lastAction = ref('');
  const isLoading = ref(false);
  type ResultFormat = 'title' | 'body' | 'both';
  const resultFormat = ref<ResultFormat>('both');
  const requestCompleted = ref(false);
  const previewVisible = ref(false);
  const sessionId = ref('');
  const abortController = ref<AbortController | null>(null);
  type GenerationPhase = 'idle' | 'connecting' | 'waiting' | 'slow' | 'streaming';
  type GenerationFeedback = { type: 'error' | 'warning'; text: string; retryable: boolean };
  const generationPhase = ref<GenerationPhase>('idle');
  const generationFeedback = ref<GenerationFeedback | null>(null);
  const outputTruncated = ref(false);
  const lastGenerationMode = ref<'action' | 'custom'>('action');
  let slowGenerationTimer: number | null = null;
  const isMarkdownNote = computed(() => note?.type === 'markdown');

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
      ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'],
      ALLOWED_ATTR: [],
    }),
  );
  // markdown 笔记放大预览右侧的渲染结果(复用 AI 流式 markdown 渲染:补全未闭合标记 + 高亮 + 净化)
  const previewRenderedHtml = computed(() => renderStreamingMarkdown(previewTyped.value || ''));
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
    if (open && isLoading.value) nextTick(scrollPreviewToBottom);
  });

  const actionConfig: Record<string, { format: ResultFormat }> = {
    polishFull: { format: 'body' },
    optimizeTitle: { format: 'title' },
    generateSummary: { format: 'body' },
    correctErrors: { format: 'body' },
    continueWrite: { format: 'body' },
    translate: { format: 'body' },
    outline: { format: 'body' },
    custom: { format: 'both' },
  };

  // 部分动作需要给模型额外说明(泛化的"任务名"不足以表达期望)
  const ACTION_INSTRUCTION: Record<string, string> = {
    continueWrite: '请在完整保留原文的前提下,顺着语义自然地往下续写 1~3 段;【正文】必须输出「原文 + 续写」拼接后的完整内容。',
    translate: '请在中文与英文之间翻译(中文内容译成英文,英文内容译成中文,混合则以主要语言为准);【正文】输出翻译后的完整内容,保持段落结构。',
    outline: '请为内容提炼一份层级清晰的大纲(用标题层级 + 有序/无序列表)。',
  };

  const buildFormatHint = (format: ResultFormat) => {
    if (format === 'title') {
      return '禁止输出引导语、解释或结尾说明，只能严格按以下结构输出；【标题】标记必须原样保留：\n【标题】\n<一行标题建议>';
    }
    const bodyRequirement = isMarkdownNote.value
      ? '【正文】必须输出 Markdown 源文本，保留标题、列表、引用、强调和代码块语法，不要用 HTML，也不要用代码围栏包裹整篇正文。'
      : '【正文】内容需使用 HTML 片段（适配 TinyMCE），允许标签：p,h1-h6,strong,em,ul,ol,li,blockquote。';
    const bodyPlaceholder = isMarkdownNote.value ? '<Markdown 正文内容>' : '<HTML 正文内容>';
    if (format === 'body') {
      return `禁止输出引导语、解释或结尾说明，只能严格按以下结构输出；【正文】标记必须原样保留；${bodyRequirement}\n【正文】\n${bodyPlaceholder}`;
    }
    return `禁止输出引导语、解释或结尾说明，只能严格按以下结构输出；【标题】和【正文】标记必须原样保留；${bodyRequirement}\n【标题】\n<一行标题建议>\n【正文】\n${bodyPlaceholder}`;
  };

  const buildMessage = (actionOverride?: string, baseContent?: string, followupReq?: string) => {
    // 追问迭代:后端单轮无状态,故把「上一版生成结果」作为原内容喂回 + 追问要求,基于它继续修改
    if (baseContent !== undefined) {
      return `任务：请根据补充要求修改下面这份内容，保持同样的【标题】/【正文】段落标记不变\n原内容：\n${baseContent}\n补充要求：${followupReq || '无'}\n\n${buildFormatHint(resultFormat.value || 'both')}`;
    }
    const title = note?.title || t('ai.reply.untitled');
    const action = actionOverride || lastAction.value || 'custom';
    const requirement = prompt.value ? prompt.value : '无';
    const format = actionConfig[action]?.format || 'both';
    const actionText =
      {
        polishFull: '润色全文',
        optimizeTitle: '优化标题',
        generateSummary: '生成摘要',
        correctErrors: '纠错与语病',
        continueWrite: '续写扩展',
        translate: '翻译（中英互译）',
        outline: '生成大纲',
        custom: '自定义处理',
      }[action] || '自定义处理';
    const extra = ACTION_INSTRUCTION[action] ? `\n${ACTION_INSTRUCTION[action]}` : '';
    return `任务：${actionText}${extra}\n标题：${title}\n内容：${note?.content}\n补充要求：${requirement}\n\n${buildFormatHint(format)}`;
  };

  const runAction = (action: string) => {
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

  const generate = async (mode: 'custom' | 'action' | 'followup' = 'action') => {
    if (isLoading.value) return;
    if (mode === 'custom' && !prompt.value.trim()) return;
    if (mode === 'followup' && (!followupPrompt.value.trim() || !outputFull.value.trim())) return;
    const action = mode === 'action' ? lastAction.value || 'custom' : 'custom';
    // 追问:在清空前抓取上一版结果与追问要求作为快照,格式沿用上一版
    const baseContent = mode === 'followup' ? outputFull.value : undefined;
    const followupReq = mode === 'followup' ? followupPrompt.value.trim() : '';
    const expectedFormat = mode === 'followup' ? resultFormat.value || 'both' : actionConfig[action]?.format || 'both';
    if (mode !== 'followup') lastGenerationMode.value = mode;
    resultFormat.value = expectedFormat;
    requestCompleted.value = false;
    outputFull.value = '';
    if (mode === 'followup') followupPrompt.value = '';
    outputTruncated.value = false;
    generationFeedback.value = null;
    generationPhase.value = 'connecting';
    isLoading.value = true;
    scheduleSlowGenerationHint();
    const requestController = new AbortController();
    abortController.value = requestController;
    let streamErrorMessage = '';

    try {
      const actionOverride = mode === 'custom' ? '自定义处理' : mode === 'followup' ? '继续修改' : undefined;
      let buffer = '';
      let processedLength = 0;
      let receivedDone = false;

      const handleNewContent = (content: string) => {
        if (!content) return;
        generationPhase.value = 'streaming';
        clearGenerationTimer();
        outputFull.value += content;
      };

      const handleData = (data: AiSseEvent) => {
        if (requestController.signal.aborted) return;
        if (data.event === 'start') {
          generationPhase.value = 'waiting';
        }
        if (data.event === 'heartbeat' && generationPhase.value === 'connecting') {
          generationPhase.value = 'waiting';
        }
        if (data.event === 'error') {
          streamErrorMessage = String(data.message || data.error || 'AI 流式响应异常');
          return;
        }
        if (data.event === 'done') {
          receivedDone = true;
          outputTruncated.value = data.finishReason === 'length';
        }
        const content = data.output?.text || data.text || data.content || '';
        if (content && typeof content === 'string') handleNewContent(content);
        if (data.output?.session_id) sessionId.value = data.output.session_id;
      };

      const handleChunk = (chunk: string) => {
        const parsed = consumeAiSseChunk(buffer, chunk);
        buffer = parsed.buffer;
        parsed.events.forEach(handleData);
      };

      await apiBasePost(
        '/api/note/assist',
        {
          message: buildMessage(actionOverride, baseContent, followupReq),
          stream: true,
          sessionId: sessionId.value,
          responseFormat: expectedFormat,
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

      flushAiSseBuffer(buffer).forEach(handleData);
      if (streamErrorMessage) throw new Error(streamErrorMessage);
      if (!receivedDone) throw new Error('AI 流式响应未完整结束');
      requestCompleted.value = true;
    } catch (error: any) {
      console.error('AI 回复生成失败:', error, axios.isCancel(error));
      if (requestController.signal.aborted || axios.isCancel(error)) {
        generationFeedback.value = {
          type: 'warning',
          text: t('ai.reply.generationStopped'),
          retryable: true,
        };
      } else {
        generationFeedback.value = {
          type: 'error',
          text: streamErrorMessage || t('ai.reply.generationFailed'),
          retryable: true,
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
      ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'],
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
  const canApplyTitle = computed(() => requestCompleted.value && !isLoading.value && hasTitle.value);
  const canApplyBody = computed(() => requestCompleted.value && !isLoading.value && hasBody.value);
  const missingMarkers = computed(() => {
    const markers: string[] = [];
    if ((resultFormat.value === 'title' || resultFormat.value === 'both') && !hasTitle.value) markers.push('【标题】');
    if ((resultFormat.value === 'body' || resultFormat.value === 'both') && !hasBody.value) markers.push('【正文】');
    return markers;
  });
  const formatInvalid = computed(
    () => requestCompleted.value && Boolean(outputFull.value) && missingMarkers.value.length > 0,
  );

  // 展示正文结果而非协议标记；Markdown 笔记交给 TypewriterOutput 以纯文本显示，避免被 v-html 当作富文本。
  const displayOutput = computed(() => {
    if (!outputFull.value) return '';
    const body = extractSection(outputFull.value, '正文');
    if (body) return isMarkdownNote.value ? unwrapMarkdownFence(body) : body;
    const title = extractSection(outputFull.value, '标题');
    return title || outputFull.value;
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
      return true;
    }

    if (!suggestedTitle.value) return false;
    if (applyTitleFromAi) {
      applyTitleFromAi(suggestedTitle.value);
    } else {
      note.title = suggestedTitle.value;
    }
    triggerSave?.();
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
    outputFull.value = '';
    requestCompleted.value = false;
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
  .ai-container {
    height: 100%;
    background: var(--bl-card-bg, #e5e5ec);
    border-radius: 12px;
    padding: 16px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid rgba(0, 0, 0, 0.04);
  }

  .ai-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ai-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    color: #2d2f33;
  }
  .ai-title .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: linear-gradient(135deg, #7b8cff, #5b6fff);
  }
  .ai-subtitle {
    font-size: 12px;
    color: #7b7f85;
  }

  .ai-note-meta {
    background: #ffffff;
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 1;
    min-width: 0;
    gap: 8px;
    font-size: 12px;
  }
  .meta-row:first-child {
    flex: 1.6;
  }
  .meta-row + .meta-row {
    padding-left: 12px;
    border-left: 1px solid #eef0f5;
  }
  .meta-row .label {
    color: #8a8f98;
    white-space: nowrap;
  }
  .meta-row .value {
    color: #2d2f33;
    flex: 1;
    min-width: 0;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .action-btn {
    width: 100%;
    height: 32px;
    border: 1px solid #e5e7eb;
    background: #ffffff;
    border-radius: 8px;
    font-size: 12px;
    color: #374151;
    cursor: pointer;
  }
  .action-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  .action-btn:hover {
    border-color: #b9c1ff;
    color: #4b5bff;
  }

  .ai-input {
    display: grid;
    gap: 8px;
    --ai-requirement-bg: #ffffff;
    --ai-requirement-border: #d7dbe7;
    --ai-requirement-text: #2d2f33;
    --ai-requirement-placeholder: #7d8490;
  }
  .input-label {
    font-size: 12px;
    color: #6b7280;
  }
  .ai-input :deep(.b-textarea) {
    width: 100%;
    min-height: 56px;
    max-height: 120px;
    resize: vertical;
    border: 1px solid var(--ai-requirement-border);
    border-radius: 8px;
    box-sizing: border-box;
    padding: 8px 10px;
    font-size: 12px;
    background-color: var(--ai-requirement-bg) !important;
    color: var(--ai-requirement-text);
    outline: none;
    font-family: inherit;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      background-color 0.2s ease;
  }
  .ai-input :deep(.b-textarea::placeholder) {
    color: var(--ai-requirement-placeholder);
    opacity: 1;
  }
  .ai-input :deep(.b-textarea:hover) {
    border-color: #aeb6d0;
  }
  .ai-input :deep(.b-textarea:focus) {
    border-color: #7b8cff;
    box-shadow: 0 0 0 3px rgba(123, 140, 255, 0.15);
  }
  .primary-btn {
    width: 100%;
    height: 34px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, #6b7cff, #4e5bff);
    color: #ffffff;
    font-size: 12px;
    cursor: pointer;
  }
  .primary-btn:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .stop-btn {
    width: 100%;
    height: 34px;
    border: 1px solid #ff4d4f;
    border-radius: 8px;
    background: #fff1f0;
    color: #ff4d4f;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.2s;
  }
  .stop-btn:hover {
    background: #ffccc7;
    border-color: #ff7875;
  }
  .stop-btn .stop-icon {
    width: 8px;
    height: 8px;
    background: currentColor;
    border-radius: 1px;
  }

  .ai-output {
    flex: 1 1 280px;
    min-height: 220px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border-radius: 10px;
    border: 1px solid #eef0f5;
    overflow: hidden;
  }
  .output-header {
    padding: 10px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #f1f3f7;
    font-size: 12px;
    color: #4b5563;
  }
  .output-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .ghost-btn {
    height: 26px;
    border: 1px solid #e5e7eb;
    background: #ffffff;
    border-radius: 6px;
    font-size: 11px;
    padding: 0 8px;
    cursor: pointer;
    color: #4b5563;
    white-space: nowrap;
  }
  .ghost-btn:disabled {
    cursor: not-allowed;
    color: #b5b8bf;
    border-color: #f1f2f6;
  }
  /* 放大/清空为图标按钮:窄面板里一行放得下 4 个动作,文字动作(插入/替换标题)保留可读 */
  .icon-btn {
    width: 28px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .icon-btn svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  .output-body {
    flex: 1 1 auto;
    min-height: 0;
    padding: 12px;
    overflow: auto;
    box-sizing: border-box;
  }
  .format-warning {
    padding: 8px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--resource-file-color) 24%, transparent);
    background: color-mix(in srgb, var(--resource-file-color) 10%, transparent);
    color: color-mix(in srgb, var(--resource-file-color) 75%, var(--text-color));
    font-size: 11px;
    line-height: 1.5;
  }
  .truncation-warning,
  .generation-feedback,
  .generation-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--card-border-color, rgba(0, 0, 0, 0.08));
    font-size: 11px;
    line-height: 1.5;
  }
  .truncation-warning,
  .generation-feedback {
    justify-content: space-between;
  }
  .truncation-warning {
    color: color-mix(in srgb, var(--message-warning-color) 78%, var(--text-color));
    background: color-mix(in srgb, var(--message-warning-color) 9%, var(--card-background));
    border-bottom-color: color-mix(in srgb, var(--message-warning-color) 24%, transparent);
  }
  .generation-status {
    color: var(--sub-text-color);
    background: color-mix(in srgb, var(--resource-note-color) 5%, var(--card-background));
  }
  .generation-status :deep(.b-loading-inline) {
    min-height: 20px;
    color: inherit;
    font-size: inherit;
  }
  .generation-feedback {
    color: var(--sub-text-color);
  }
  .generation-feedback.is-warning {
    color: color-mix(in srgb, var(--message-warning-color) 78%, var(--text-color));
    background: color-mix(in srgb, var(--message-warning-color) 9%, var(--card-background));
    border-bottom-color: color-mix(in srgb, var(--message-warning-color) 24%, transparent);
  }
  .generation-feedback.is-error {
    color: color-mix(in srgb, var(--message-error-color) 78%, var(--text-color));
    background: color-mix(in srgb, var(--message-error-color) 8%, var(--card-background));
    border-bottom-color: color-mix(in srgb, var(--message-error-color) 24%, transparent);
  }
  .truncation-warning > span,
  .generation-feedback > span {
    flex: 1 1 140px;
    min-width: 0;
  }
  .generation-feedback-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }
  .status-action-btn {
    height: 24px;
    padding: 0 7px;
    border: 1px solid var(--card-border-color, rgba(0, 0, 0, 0.1));
    border-radius: 6px;
    background: var(--card-background);
    color: inherit;
    font-size: 11px;
    white-space: nowrap;
  }
  .title-suggestion {
    display: grid;
    gap: 4px;
    padding: 8px 12px 9px;
    border-bottom: 1px solid color-mix(in srgb, var(--resource-note-color) 20%, transparent);
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--resource-note-color) 6%, var(--card-background)),
      var(--card-background) 72%
    );
  }
  .title-suggestion .title-suggestion-label {
    width: fit-content;
    padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--resource-note-color) 12%, transparent);
    font-size: 10px;
    line-height: 1.4;
    letter-spacing: 0.02em;
  }
  .title-suggestion .title-suggestion-value {
    font-size: 13px;
    line-height: 1.45;
  }
  .title-suggestion-label {
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--resource-note-color) 78%, var(--text-color));
    font-weight: 600;
    white-space: nowrap;
  }
  .title-suggestion-value {
    min-width: 0;
    color: var(--text-color);
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .output-body :deep(.typewriter-content) {
    margin: 0;
    white-space: pre-wrap;
    font-size: 12px;
    line-height: 1.5;
    color: #2d2f33;
  }
  .output-body :deep(p),
  .output-body :deep(h1),
  .output-body :deep(h2),
  .output-body :deep(h3),
  .output-body :deep(h4),
  .output-body :deep(h5),
  .output-body :deep(h6),
  .output-body :deep(ul),
  .output-body :deep(ol),
  .output-body :deep(li),
  .output-body :deep(blockquote) {
    margin: 8px 0 0 0;
  }
  .output-body :deep(p:last-child),
  .output-body :deep(h1:last-child),
  .output-body :deep(h2:last-child),
  .output-body :deep(h3:last-child),
  .output-body :deep(h4:last-child),
  .output-body :deep(h5:last-child),
  .output-body :deep(h6:last-child),
  .output-body :deep(ul:last-child),
  .output-body :deep(ol:last-child),
  .output-body :deep(li:last-child),
  .output-body :deep(blockquote:last-child) {
    margin-bottom: 0;
  }
  .empty {
    color: #9aa0a6;
    font-size: 12px;
  }

  [data-theme='night'] .ai-container {
    background: #2a2f36;
    border-color: rgba(255, 255, 255, 0.08);
  }
  [data-theme='night'] .ai-title,
  [data-theme='night'] .meta-row .value,
  [data-theme='night'] .output-body :deep(.typewriter-content) {
    color: #f3f4f6;
  }
  [data-theme='night'] .meta-row + .meta-row {
    border-left-color: rgba(255, 255, 255, 0.12);
  }

  [data-theme='night'] .stop-btn {
    background: rgba(255, 77, 79, 0.1);
    border-color: rgba(255, 77, 79, 0.4);
    color: #ff4d4f;
  }
  [data-theme='night'] .stop-btn:hover {
    background: rgba(255, 77, 79, 0.2);
    border-color: #ff4d4f;
  }
  [data-theme='night'] .output-header,
  [data-theme='night'] .empty {
    color: #b3b9c2;
  }
  [data-theme='night'] .ai-input {
    --ai-requirement-bg: #313740;
    --ai-requirement-border: rgba(255, 255, 255, 0.12);
    --ai-requirement-text: #e5e7eb;
    --ai-requirement-placeholder: #8f96a3;
  }
  [data-theme='night'] .ai-note-meta,
  [data-theme='night'] .ai-output,
  [data-theme='night'] .action-btn,
  [data-theme='night'] .ghost-btn {
    background: #313740;
    border-color: rgba(255, 255, 255, 0.12);
    color: #e5e7eb;
  }
  [data-theme='night'] .action-btn:hover,
  [data-theme='night'] .ghost-btn:hover {
    border-color: #9aa8ff;
    color: #e0e7ff;
  }
  [data-theme='night'] .ai-input :deep(.b-textarea:focus) {
    border-color: #7b8cff;
    box-shadow: 0 0 0 2px rgba(123, 140, 255, 0.2);
  }
  [data-theme='night'] .primary-btn {
    background: linear-gradient(135deg, #6270f0, #4b5be2);
  }

  /* 放大预览窗:定宽约束 BModal 的 min-width:max-content,给足阅读空间 */
  .ai-preview {
    width: 680px;
    max-width: 86vw;
    box-sizing: border-box;
  }
  /* md 笔记放大预览:左 Markdown 原文 / 右渲染 对比,窗口更宽 */
  .ai-preview--split {
    width: min(980px, 92vw);
  }
  .ai-preview-split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    align-items: start;
  }
  .ai-preview-md {
    margin: 0;
    max-height: 68vh;
    overflow: auto;
    padding: 10px 12px;
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    background: var(--workbench-subcard-bg, var(--card-background));
    white-space: pre-wrap;
    word-break: break-word;
    font-family: 'Fira Code', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.6;
    color: var(--desc-color);
  }
  /* 窄屏/移动端:单栏只保留渲染预览(md 原文在小窗输出区已可见),避免挤压 */
  @media (max-width: 768px) {
    .ai-preview--split {
      width: min(680px, 86vw);
    }
    .ai-preview-split {
      grid-template-columns: 1fr;
    }
    .ai-preview-md {
      display: none;
    }
  }
  /* 放大预览里的「追问迭代」输入区 */
  .ai-preview-followup {
    display: flex;
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--card-border-color);
  }
  .ai-preview-followup :deep(.b-input) {
    flex: 1;
  }
  .ai-preview-followup__send {
    flex: 0 0 auto;
  }
  .ai-preview-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 12px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--resource-note-color) 24%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--resource-note-color) 8%, var(--card-background));
    font-size: 14px;
    line-height: 1.5;
  }
  .ai-preview-body {
    max-height: 68vh;
    overflow-y: auto;
    /* 内容是 v-html 渲染的 HTML 片段,不能用 pre-wrap——否则 AI 输出里标签间的源码换行
       (<li>…</li> 之间的 \n、标题到列表之间的空行)会被当成可见换行,把行/段间距撑得很大。
       用 normal 让浏览器折叠 HTML 空白,段间距交给下方 p/li/h* 的 margin 控制。 */
    white-space: normal;
    word-break: break-word;
    font-size: 15px;
    line-height: 1.7;
    color: var(--text-color);
    padding: 4px 2px;
  }
  .ai-preview-body.is-markdown {
    white-space: pre-wrap;
    font-family: 'Fira Code', 'Courier New', monospace;
  }
  .ai-preview-body :deep(p),
  .ai-preview-body :deep(li),
  .ai-preview-body :deep(blockquote) {
    margin: 0 0 10px;
  }
  .ai-preview-body :deep(h1),
  .ai-preview-body :deep(h2),
  .ai-preview-body :deep(h3) {
    margin: 14px 0 8px;
  }
  .ai-preview-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--card-border-color, rgba(0, 0, 0, 0.08));
  }
</style>
