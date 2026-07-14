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
      <button
        class="action-btn text-hidden"
        :disabled="isLoading"
        @click="runAction('polishFull')"
        :title="t('ai.reply.actions.polishFull')"
        v-click-log="{ module: '笔记-AI助手', operation: '润色全文' }"
        >{{ t('ai.reply.actions.polishFull') }}</button
      >
      <button
        class="action-btn text-hidden"
        :disabled="isLoading"
        @click="runAction('optimizeTitle')"
        :title="t('ai.reply.actions.optimizeTitle')"
        v-click-log="{ module: '笔记-AI助手', operation: '优化标题' }"
        >{{ t('ai.reply.actions.optimizeTitle') }}</button
      >
      <button
        class="action-btn text-hidden"
        :disabled="isLoading"
        @click="runAction('generateSummary')"
        :title="t('ai.reply.actions.generateSummary')"
        v-click-log="{ module: '笔记-AI助手', operation: '生成摘要' }"
        >{{ t('ai.reply.actions.generateSummary') }}</button
      >
      <button
        class="action-btn text-hidden"
        :disabled="isLoading"
        @click="runAction('correctErrors')"
        :title="t('ai.reply.actions.correctErrors')"
        v-click-log="{ module: '笔记-AI助手', operation: '纠错与语病' }"
        >{{ t('ai.reply.actions.correctErrors') }}</button
      >
      <button
        class="action-btn text-hidden"
        :disabled="isLoading"
        @click="runAction('continueWrite')"
        :title="t('ai.reply.actions.continueWrite')"
        v-click-log="{ module: '笔记-AI助手', operation: '续写扩展' }"
        >{{ t('ai.reply.actions.continueWrite') }}</button
      >
      <button
        class="action-btn text-hidden"
        :disabled="isLoading"
        @click="runAction('translate')"
        :title="t('ai.reply.actions.translate')"
        v-click-log="{ module: '笔记-AI助手', operation: '翻译' }"
        >{{ t('ai.reply.actions.translate') }}</button
      >
      <button
        class="action-btn text-hidden"
        :disabled="isLoading"
        @click="runAction('outline')"
        :title="t('ai.reply.actions.outline')"
        v-click-log="{ module: '笔记-AI助手', operation: '生成大纲' }"
        >{{ t('ai.reply.actions.outline') }}</button
      >
    </div>

    <div class="ai-input">
      <div class="input-label">{{ t('ai.reply.inputLabel') }}</div>
      <textarea v-model="prompt" :placeholder="t('ai.reply.inputPlaceholder')" />
      <button v-if="isLoading" class="stop-btn" @click="stopGenerating" :title="t('ai.reply.stop', '停止生成')" v-click-log="{ module: '笔记-AI助手', operation: '停止生成' }">
        <span class="stop-icon"></span>
        {{ t('ai.reply.stop', '停止生成') }}
      </button>
      <button
        v-else
        class="primary-btn"
        :disabled="!prompt.trim()"
        @click="generate('custom')"
        :title="t('ai.reply.processButton')"
        v-click-log="{ module: '笔记-AI助手', operation: '自定义处理' }"
      >
        {{ t('ai.reply.processButton') }}
      </button>
    </div>

    <div class="ai-output">
      <div class="output-header">
        <span style="max-width: 100px; min-width: 0" class="text-hidden">{{ t('ai.reply.outputTitle') }}</span>
        <div class="output-actions">
          <button
            style="max-width: 100px"
            class="ghost-btn text-hidden"
            :disabled="!outputFull || !hasBody"
            @click="insertToNote"
            :title="t('ai.reply.replaceContent')"
            v-click-log="{ module: '笔记-AI助手', operation: '插入到笔记' }"
            >{{ t('ai.reply.replaceContent') }}</button
          >
          <button
            style="max-width: 100px"
            class="ghost-btn text-hidden"
            :disabled="!outputFull || !hasTitle"
            @click="replaceTitle"
            :title="t('ai.reply.replaceTitle')"
            v-click-log="{ module: '笔记-AI助手', operation: '替换标题' }"
            >{{ t('ai.reply.replaceTitle') }}</button
          >
          <button class="ghost-btn icon-btn" :disabled="!outputFull" @click="previewVisible = true" :title="t('ai.reply.expand')" v-click-log="{ module: '笔记-AI助手', operation: '放大预览' }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
          </button>
          <button class="ghost-btn icon-btn" :disabled="!outputFull" @click="clearOutput" :title="t('ai.reply.clear')" v-click-log="{ module: '笔记-AI助手', operation: '清空输出' }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>
          </button>
        </div>
      </div>
      <TypewriterOutput
        class="output-body"
        :typing-speed="1"
        :content="outputFull"
        :empty-text="t('ai.reply.emptyMessage')"
      />
    </div>

    <!-- 放大预览:输出区太窄小时,一键弹大窗舒服阅读,并可直接应用。
         必须放在 .ai-container 内部 —— 若作为第二个根节点会使组件变多根,导致父级 class="ai-panel"(定宽)无法继承,面板会被内容撑宽。 -->
    <BModal v-model:visible="previewVisible" :title="t('ai.reply.outputTitle')" :show-footer="false" width="auto">
      <div class="ai-preview">
        <div class="ai-preview-body" ref="previewBodyRef" v-html="previewTyped"></div>
        <div class="ai-preview-actions">
          <button class="ghost-btn" :disabled="!hasBody" @click="applyFromPreview('body')">{{ t('ai.reply.replaceContent') }}</button>
          <button class="ghost-btn" :disabled="!hasTitle" @click="applyFromPreview('title')">{{ t('ai.reply.replaceTitle') }}</button>
        </div>
      </div>
    </BModal>
  </div>
</template>

<script lang="ts" setup>
  import { computed, inject, nextTick, ref, watch, watchEffect } from 'vue';
  import { parse, Allow } from 'partial-json';
  import { useI18n } from 'vue-i18n';
  import axios from 'axios';
  import TypewriterOutput from '@/components/base/TypewriterOutput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import { apiBasePost } from '@/http/request';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { noteDisplayText } from '@/utils/common.ts';

  const { t } = useI18n();

  // 后端输出封顶 4096 token(约 2500~3000 中文字)。对"输出≈输入长度"的动作(润色全文/自定义产出正文),
  // 笔记正文超过此阈值时结果会被静默截断——生成前给一次非阻断提醒,让用户对残缺结果有预期。
  const LONG_CONTENT_THRESHOLD = 2500;

  const note = inject<any>('note', null);
  const applyTitleFromAi = inject<((title: string) => void) | null>('applyTitleFromAi', null);
  const applyContentFromAi = inject<((html: string) => Promise<void> | void) | null>('applyContentFromAi', null);
  const triggerSave = inject<(() => void) | null>('triggerSave', null);
  const focusEditorToEnd = inject<(() => void) | null>('focusEditorToEnd', null);
  const prompt = ref('');
  const outputFull = ref('');
  const lastAction = ref('');
  const isLoading = ref(false);
  const previewVisible = ref(false);
  const sessionId = ref('');
  const abortController = ref<AbortController | null>(null);

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
      const full = outputFull.value;
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
        previewTyped.value = outputFull.value;
      }
    },
    { immediate: true },
  );

  // 打开弹框:正在生成→贴底开始跟随;已完成→停在顶部方便阅读
  watch(previewVisible, (open) => {
    if (open && isLoading.value) nextTick(scrollPreviewToBottom);
  });

  const actionConfig: Record<string, { format: 'title' | 'body' | 'both' }> = {
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
    outline: '请为内容提炼一份层级清晰的大纲(用标题层级 + 有序/无序列表);【正文】输出大纲的 HTML。',
  };

  const buildFormatHint = (format: 'title' | 'body' | 'both') => {
    if (format === 'title') {
      return '开头至多一句话简短引导（不超过 20 字），不要长篇说明；随后务必在最后严格按以下格式输出，且【标题】必须位于末尾：\n【标题】\n<一行标题建议>';
    }
    if (format === 'body') {
      return '开头至多一句话简短引导（不超过 20 字，如「以下是润色后的全文：」），不要长篇说明；随后务必在最后严格按以下格式输出，且【正文】必须位于末尾；【正文】内容需使用 HTML 片段（适配 TinyMCE），允许标签：p,h1-h6,strong,em,ul,ol,li,blockquote。\n【正文】\n<HTML 正文内容>';
    }
    return '开头至多一句话简短引导（不超过 20 字），不要长篇说明；随后务必在最后严格按以下格式输出，且【标题】/【正文】两段必须位于末尾；【正文】内容需使用 HTML 片段（适配 TinyMCE），允许标签：p,h1-h6,strong,em,ul,ol,li,blockquote。\n【标题】\n<一行标题建议>\n【正文】\n<HTML 正文内容>';
  };

  const buildMessage = (actionOverride?: string) => {
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

  const stopGenerating = () => {
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
  };

  const generate = async (mode: 'custom' | 'action' = 'action') => {
    if (isLoading.value) return;
    if (mode === 'custom' && !prompt.value.trim()) return;
    // "输出≈输入长度"的动作(润色全文/纠错/自定义)+ 长笔记:提醒结果可能被输出上限截断(不阻断)。
    // 生成摘要/优化标题输出很短,不会截断,不提醒。
    const action = mode === 'action' ? lastAction.value || 'custom' : 'custom';
    const FULL_OUTPUT_ACTIONS = ['polishFull', 'correctErrors', 'continueWrite', 'translate', 'custom'];
    if (FULL_OUTPUT_ACTIONS.includes(action) && textLength.value > LONG_CONTENT_THRESHOLD) {
      message.warning(`笔记较长(约 ${textLength.value} 字),AI 输出可能被截断,建议分段处理或改用「生成摘要」`);
    }
    outputFull.value = '';
    isLoading.value = true;
    abortController.value = new AbortController();

    const parseJSONSafely = (str: string) => {
      try {
        return JSON.parse(str);
      } catch (e) {
        if (e instanceof SyntaxError) {
          try {
            return parse(str, Allow.ALL);
          } catch (partialError) {
            console.warn('Partial JSON解析失败:', partialError);
            return null;
          }
        }
        throw e;
      }
    };

    try {
      const actionOverride = mode === 'custom' ? '自定义处理' : undefined;
      let buffer = '';
      let processedLength = 0;

      const handleNewContent = (content: string) => {
        if (!content) return;
        outputFull.value += content;
      };

      const handleChunk = (chunk: string) => {
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;

          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            if (dataStr === '[DONE]') {
              break;
            }
            if (!dataStr) continue;

            const data = parseJSONSafely(dataStr);
            if (!data) continue;

            const content = data.output?.text || data.text || data.content || '';
            if (content && typeof content === 'string') {
              handleNewContent(content);
            }
            if (data.output?.session_id) {
              sessionId.value = data.output.session_id;
            }
          }
        }
      };

      await apiBasePost(
        '/api/note/assist',
        {
          message: buildMessage(actionOverride),
          stream: true,
          sessionId: sessionId.value,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          responseType: 'text',
          signal: abortController.value.signal,
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

      if (buffer.trim()) {
        const remainingLines = buffer.split('\n');
        for (const rawLine of remainingLines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const dataStr = line.slice(5).trim();
          if (!dataStr || dataStr === '[DONE]') continue;
          const data = parseJSONSafely(dataStr);
          if (!data) continue;
          const content = data.output?.text || data.text || data.content || '';
          if (content && typeof content === 'string') {
            handleNewContent(content);
          }
          if (data.output?.session_id) {
            sessionId.value = data.output.session_id;
          }
        }
      }
    } catch (error: any) {
      console.error('AI 回复生成失败:', error, axios.isCancel(error));
      if (axios.isCancel(error)) {
        outputFull.value += '\n[已停止]';
      } else {
        outputFull.value = '请求失败，请稍后再试。';
      }
    } finally {
      isLoading.value = false;
      abortController.value = null;
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

  const extractSection = (text: string, key: '标题' | '正文') => {
    // 先在原始文本中找标记,不 stripMarkdown——保留 markdown 语法不被破坏
    const marker = `【${key}】`;
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      const start = idx + marker.length;
      return text.slice(start).trim();
    }
    // 兜底:AI 可能把标记包在 ** 里,strip 后重试
    const normalized = stripMarkdown(text);
    const fallbackIdx = normalized.indexOf(marker);
    if (fallbackIdx !== -1) {
      return normalized.slice(fallbackIdx + marker.length).trim();
    }
    return '';
  };

  const cleanupFallback = (text: string) => {
    return stripMarkdown(text)
      .replace(/^润色后的文本如下.*?[:：]\s*/i, '')
      .replace(/^标题[:：]\s*/i, '')
      .replace(/^内容[:：]\s*/i, '')
      .replace(/^如需.*$/gim, '')
      .trim();
  };

  const buildHtmlContent = () => {
    const body = extractSection(outputFull.value, '正文');
    const base = body || cleanupFallback(outputFull.value);
    if (!base) return '';
    const hasHtmlTag = /<\/?[a-z][\s\S]*?>/i.test(base);
    if (hasHtmlTag) return base.trim();
    return base
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${line}</p>`)
      .join('');
  };

  const hasTitle = computed(() => !!extractSection(outputFull.value, '标题'));
  const hasBody = computed(() => !!extractSection(outputFull.value, '正文'));

  const insertToNote = () => {
    if (!note || !outputFull.value) return;
    const html = buildHtmlContent();
    if (!html) return;
    if (applyContentFromAi) {
      applyContentFromAi(html);
    } else {
      note.content = html;
    }
    triggerSave?.();
    focusEditorToEnd?.();
  };

  const replaceTitle = () => {
    if (!note || !outputFull.value) return;
    const titleSection = extractSection(outputFull.value, '标题');
    const firstLine = (titleSection || cleanupFallback(outputFull.value)).split('\n').find((line) => line.trim());
    if (firstLine) {
      if (applyTitleFromAi) {
        applyTitleFromAi(firstLine.trim());
      } else {
        note.title = firstLine.trim();
      }
      triggerSave?.();
    }
  };

  const clearOutput = () => {
    outputFull.value = '';
  };

  // 放大窗内应用:应用后关闭大窗
  const applyFromPreview = (which: 'body' | 'title') => {
    if (which === 'body') insertToNote();
    else replaceTitle();
    previewVisible.value = false;
  };
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
    gap: 14px;
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
    padding: 12px;
    display: grid;
    gap: 8px;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }
  .meta-row .label {
    color: #8a8f98;
  }
  .meta-row .value {
    color: #2d2f33;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .action-btn {
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
  }
  .input-label {
    font-size: 12px;
    color: #6b7280;
  }
  textarea {
    width: 100%;
    min-height: 80px;
    resize: vertical;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-sizing: border-box;
    padding: 8px 10px;
    font-size: 12px;
    background: #ffffff;
    color: #2d2f33;
    outline: none;
    font-family: inherit;
  }
  textarea:focus {
    border-color: #7b8cff;
    box-shadow: 0 0 0 2px rgba(123, 140, 255, 0.15);
  }
  .primary-btn {
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
    flex: 1 1 auto;
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
    padding: 12px;
    overflow: auto;
    height: 100%;
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
  [data-theme='night'] .ai-note-meta,
  [data-theme='night'] .ai-output,
  [data-theme='night'] textarea,
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
  [data-theme='night'] textarea:focus {
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
