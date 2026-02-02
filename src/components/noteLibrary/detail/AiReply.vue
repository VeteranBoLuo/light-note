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
        >{{ t('ai.reply.actions.polishFull') }}</button
      >
      <button
        class="action-btn text-hidden"
        :disabled="isLoading"
        @click="runAction('optimizeTitle')"
        :title="t('ai.reply.actions.optimizeTitle')"
        >{{ t('ai.reply.actions.optimizeTitle') }}</button
      >
      <button
        class="action-btn text-hidden"
        :disabled="isLoading"
        @click="runAction('generateSummary')"
        :title="t('ai.reply.actions.generateSummary')"
        >{{ t('ai.reply.actions.generateSummary') }}</button
      >
      <button
        class="action-btn text-hidden"
        :disabled="isLoading"
        @click="runAction('correctErrors')"
        :title="t('ai.reply.actions.correctErrors')"
        >{{ t('ai.reply.actions.correctErrors') }}</button
      >
      <button
        class="action-btn text-hidden"
        :disabled="isLoading"
        @click="runAction('rewriteSection')"
        :title="t('ai.reply.actions.rewriteSection')"
        >{{ t('ai.reply.actions.rewriteSection') }}</button
      >
    </div>

    <div class="ai-input">
      <div class="input-label">{{ t('ai.reply.inputLabel') }}</div>
      <textarea v-model="prompt" :placeholder="t('ai.reply.inputPlaceholder')" />
      <button
        class="primary-btn"
        :disabled="isLoading || !prompt.trim()"
        @click="generate('custom')"
        :title="isLoading ? t('ai.reply.processing') : t('ai.reply.processButton')"
      >
        {{ isLoading ? t('ai.reply.processing') : t('ai.reply.processButton') }}
      </button>
    </div>

    <div class="ai-output">
      <div class="output-header">
        <span style="max-width: 100px" class="text-hidden">{{ t('ai.reply.outputTitle') }}</span>
        <div class="output-actions">
          <button
            style="max-width: 100px"
            class="ghost-btn text-hidden"
            :disabled="!output || !hasBody"
            @click="insertToNote"
            :title="t('ai.reply.replaceContent')"
            >{{ t('ai.reply.replaceContent') }}</button
          >
          <button
            style="max-width: 100px"
            class="ghost-btn text-hidden"
            :disabled="!output || !hasTitle"
            @click="replaceTitle"
            :title="t('ai.reply.replaceTitle')"
            >{{ t('ai.reply.replaceTitle') }}</button
          >
          <button class="ghost-btn" :disabled="!output" @click="clearOutput" :title="t('ai.reply.clear')">{{
            t('ai.reply.clear')
          }}</button>
        </div>
      </div>
      <div class="output-body">
        <div v-if="!output" class="empty">{{ t('ai.reply.emptyMessage') }}</div>
        <pre v-else>{{ output }}</pre>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, inject, ref } from 'vue';
  import { parse, Allow } from 'partial-json';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();

  const note = inject<any>('note', null);
  const applyTitleFromAi = inject<((title: string) => void) | null>('applyTitleFromAi', null);
  const triggerSave = inject<(() => void) | null>('triggerSave', null);
  const prompt = ref('');
  const output = ref('');
  const lastAction = ref('');
  const isLoading = ref(false);
  const sessionId = ref('');
  const abortController = ref<AbortController | null>(null);

  const getPlainContent = () => {
    const raw = note?.content || '';
    return raw
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const textLength = computed(() => getPlainContent().length);

  const actionConfig: Record<string, { format: 'title' | 'body' | 'both' }> = {
    polishFull: { format: 'body' },
    optimizeTitle: { format: 'title' },
    generateSummary: { format: 'body' },
    correctErrors: { format: 'body' },
    rewriteSection: { format: 'body' },
    custom: { format: 'both' },
  };

  const buildFormatHint = (format: 'title' | 'body' | 'both') => {
    if (format === 'title') {
      return '不必省略说明，但请务必在最后严格按以下格式输出，且【标题】必须位于末尾：\n【标题】\n<一行标题建议>';
    }
    if (format === 'body') {
      return '不必省略说明，但请务必在最后严格按以下格式输出，且【正文】必须位于末尾：\n【正文】\n<正文内容>';
    }
    return '不必省略说明，但请务必在最后严格按以下格式输出，且【标题】/【正文】两段必须位于末尾：\n【标题】\n<一行标题建议>\n【正文】\n<正文内容>';
  };

  const buildMessage = (actionOverride?: string) => {
    const title = note?.title || t('ai.reply.untitled');
    const action = actionOverride || lastAction.value || 'custom';
    const requirement = prompt.value ? prompt.value : '无';
    const content = getPlainContent();
    const format = actionConfig[action]?.format || 'both';
    const actionText =
      {
        polishFull: '润色全文',
        optimizeTitle: '优化标题',
        generateSummary: '生成摘要',
        correctErrors: '纠错与语病',
        rewriteSection: '改写选段',
        custom: '自定义处理',
      }[action] || '自定义处理';
    return `任务：${actionText}\n标题：${title}\n内容：${content}\n补充要求：${requirement}\n\n${buildFormatHint(format)}`;
  };

  const runAction = (action: string) => {
    lastAction.value = action;
    generate('action');
  };

  const generate = async (mode: 'custom' | 'action' = 'action') => {
    if (isLoading.value) return;
    if (mode === 'custom' && !prompt.value.trim()) return;
    output.value = '';
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
      const response = await fetch('/api/chat/receiveMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: buildMessage(actionOverride),
          stream: true,
          sessionId: sessionId.value,
        }),
        signal: abortController.value.signal,
      });

      if (!response.ok) throw new Error(`请求失败: ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取流数据');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
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
              output.value += content;
            }
            if (data.output?.session_id) {
              sessionId.value = data.output.session_id;
            }
          }
        }
      }

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
            output.value += content;
          }
          if (data.output?.session_id) {
            sessionId.value = data.output.session_id;
          }
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        output.value += '\n[已停止]';
      } else {
        output.value = '请求失败，请稍后再试。';
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
    const normalized = stripMarkdown(text);
    const titleIndex = normalized.indexOf('【标题】');
    const bodyIndex = normalized.indexOf('【正文】');
    if (titleIndex === -1 && bodyIndex === -1) return '';
    if (key === '标题' && titleIndex !== -1) {
      const start = titleIndex + '【标题】'.length;
      const end = bodyIndex !== -1 ? bodyIndex : normalized.length;
      return normalized.slice(start, end).trim();
    }
    if (key === '正文' && bodyIndex !== -1) {
      const start = bodyIndex + '【正文】'.length;
      return normalized.slice(start).trim();
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

  const buildPlainText = () => {
    const body = extractSection(output.value, '正文');
    const base = body || cleanupFallback(output.value);
    return base
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
  };

  const hasTitle = computed(() => !!extractSection(output.value, '标题'));
  const hasBody = computed(() => !!extractSection(output.value, '正文'));

  const insertToNote = () => {
    if (!note || !output.value) return;
    const plain = buildPlainText();
    if (!plain) return;
    const paragraphs = plain
      .split('\n')
      .map((line) => `<p>${line}</p>`)
      .join('');
    note.content = paragraphs;
    triggerSave?.();
  };

  const replaceTitle = () => {
    if (!note || !output.value) return;
    const titleSection = extractSection(output.value, '标题');
    const firstLine = (titleSection || cleanupFallback(output.value)).split('\n').find((line) => line.trim());
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
    output.value = '';
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
  }
  .ghost-btn:disabled {
    cursor: not-allowed;
    color: #b5b8bf;
    border-color: #f1f2f6;
  }
  .output-body {
    padding: 12px;
    overflow: auto;
    height: 100%;
  }
  .output-body pre {
    margin: 0;
    white-space: pre-wrap;
    font-size: 12px;
    line-height: 1.5;
    color: #2d2f33;
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
  [data-theme='night'] .output-body pre {
    color: #f3f4f6;
  }
  [data-theme='night'] .ai-subtitle,
  [data-theme='night'] .meta-row .label,
  [data-theme='night'] .input-label,
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
</style>
