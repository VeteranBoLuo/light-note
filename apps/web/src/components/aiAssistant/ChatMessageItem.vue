<template>
  <div class="message" :class="message.role">
    <div class="message-content">
      <div class="avatar" :class="message.role" v-if="message.role === 'user'">
        <div
          class="navigation-icon"
          style="
            margin-left: 5px;
            display: flex;
            align-items: center;
            clip-path: circle(50% at 50% 50%);
            cursor: pointer;
          "
        >
          <svg-icon size="32" :src="user.headPicture || icon.navigation.user" class="dom-hover" />
        </div>
      </div>
      <div class="bubble-col">
        <div class="bubble" v-if="message.content">
          <!-- Markdown 渲染内容 -->
          <div v-if="message.role === 'user'" class="text user-text" v-text="message.content"></div>
          <div
            v-else-if="isStreaming"
            class="text"
            v-html="streamingHtml"
            @click="handleLinkClick"
            @mouseover="showCitationTip"
            @mouseout="hideCitationTip"
          ></div>
          <div
            v-else
            class="text"
            v-html="formatAssistantMessage(message.content)"
            @click="handleLinkClick"
            @mouseover="showCitationTip"
            @mouseout="hideCitationTip"
          ></div>
          <div v-if="message.role === 'user' && message.contexts?.length" class="user-contexts">
            <div class="user-contexts__title">{{ t('ai.attachedResources') }} · {{ message.contexts.length }}</div>
            <div class="user-contexts__list">
              <BButton
                v-for="item in message.contexts"
                :key="`${item.type}:${item.id}`"
                :class="['user-context-chip', `is-${item.type}`]"
                :title="item.title"
                @click="openContext(item)"
              >
                <span class="user-context-chip__icon" aria-hidden="true">
                  <SvgIcon :src="contextIcon(item.type)" size="13" />
                </span>
                <strong>{{ item.title }}</strong>
              </BButton>
            </div>
          </div>
          <!-- 本地上传文件:与「引用资源」对称地显示在用户气泡上,让用户看清这条问题用了哪些文件 -->
          <div v-if="message.role === 'user' && message.attachmentRefs?.length" class="user-contexts">
            <div class="user-contexts__title">{{ t('ai.attachedFiles') }} · {{ message.attachmentRefs.length }}</div>
            <div class="user-contexts__list">
              <span
                v-for="item in message.attachmentRefs"
                :key="item.id"
                class="user-context-chip is-file"
                :title="item.fileName"
              >
                <span class="user-context-chip__icon" aria-hidden="true">
                  <SvgIcon :src="contextIcon('file')" size="13" />
                </span>
                <strong>{{ item.fileName }}</strong>
              </span>
            </div>
          </div>
        </div>
        <ReplyLoading v-else-if="!message.toolEvents?.length" />
        <p
          v-if="message.role === 'assistant' && message.citationAudit?.invalidKeys?.length"
          class="citation-audit-notice"
        >
          {{ t('ai.evidence.invalidCitationsRemoved', { count: message.citationAudit.invalidKeys.length }) }}
        </p>
        <AiToolStatusList
          v-if="message.role === 'assistant' && message.toolEvents?.length"
          :items="message.toolEvents"
          :has-content="Boolean(message.content)"
        />
        <!-- 用户消息：操作条移到气泡外下方（纯图标 + 时间），整体右对齐，
             气泡因此只需包住文字即可自适应收窄，不再被这一行撑宽 -->
        <div class="msg-footer" v-if="message.role === 'user' && message.content">
          <div class="msg-actions">
            <BButton class="msg-action-btn" :title="t('ai.copy')" @click="handleCopy">
              <SvgIcon :src="icon.ai.messageCopy" size="15" aria-hidden="true" />
            </BButton>
            <BButton class="msg-action-btn" :title="t('ai.edit')" @click="handleEdit">
              <SvgIcon :src="icon.ai.messageEdit" size="15" aria-hidden="true" />
            </BButton>
          </div>
          <span class="time">{{ formatTime(message.timestamp) }}</span>
        </div>
        <!-- AI 回答:操作条(复制 + 重新生成),左对齐;用户消息的复制/编辑另在上方 -->
        <div
          class="msg-footer"
          style="justify-content: flex-start"
          v-if="message.role === 'assistant' && message.content"
        >
          <div class="msg-actions">
            <BButton class="msg-action-btn" :title="t('ai.copy')" @click="handleCopy">
              <SvgIcon :src="icon.ai.messageCopy" size="15" aria-hidden="true" />
            </BButton>
            <BButton
              class="msg-action-btn"
              :title="t('ai.regenerate')"
              :disabled="!canRegenerate"
              @click="handleRegenerate"
            >
              <SvgIcon :src="icon.ai.messageRetry" size="15" aria-hidden="true" />
            </BButton>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="citationTip.visible"
        class="ai-citation-tip"
        :style="{ left: citationTip.x + 'px', top: citationTip.y + 'px' }"
      >
        {{ citationTip.text }}
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import icon from '@/config/icon.ts';
  import ReplyLoading from '@/components/aiAssistant/ReplyLoading.vue';
  import AiToolStatusList, { type AiToolStatusItem } from '@/components/aiAssistant/AiToolStatusList.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import { copyTextToClipboard } from '@/utils/common';
  // 注意：本组件有名为 message 的 prop，这里必须改名，否则导入会遮蔽 prop，
  // 导致模板里的 message.content/role 全部指向该工具对象而恒为 undefined（消息一直转圈不显示）
  import bMessage from '@/components/base/BasicComponents/BMessage/BMessage';
  import { renderAssistantMarkdown, renderStreamingMarkdown } from '@/utils/aiMessageRender';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import {
    resolveAiSourceNavigation,
    groupAiEvidence,
    type AiEvidenceReference,
    type AiSource,
  } from '@/components/aiAssistant/aiSourceNavigation';
  import { extractAiMemoryInfluence } from '@/utils/aiMemoryInfluence';
  import { getRootZoom } from '@/utils/zoom';

  const { t } = useI18n();

  const bookmark = bookmarkStore();
  const user = useUserStore();

  interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    contexts?: Array<{ type: 'bookmark' | 'note' | 'file' | 'tag'; id: string; title: string }>;
    toolEvents?: AiToolStatusItem[];
    sources?: AiSource[];
    evidence?: AiEvidenceReference[];
    citationAudit?: {
      citedKeys: string[];
      invalidKeys: string[];
      verifiedCitationCount: number;
      evidenceCount: number;
    };
    activity?: Array<Record<string, unknown> | string>;
  }

  const props = defineProps<{
    message: ChatMessage;
    isStreaming?: boolean;
    canRegenerate?: boolean;
  }>();

  const canRegenerate = computed(() => props.canRegenerate !== false);

  // 流式阶段就实时渲染 Markdown(轻量路径:补全未闭合语法 → marked → DOMPurify,跳过高亮与引用装饰),
  // 不再显示原始 ##/**/``` 符号。打字机逐帧更新 content,computed 依赖追踪天然每帧至多算一次。
  const streamingHtml = computed(() => renderStreamingMarkdown(props.message.content));

  // 点“编辑”把这条用户消息内容抛给容器，回填到输入框
  const emit = defineEmits<{
    (e: 'edit', content: string, contexts: NonNullable<ChatMessage['contexts']>): void;
    (e: 'regenerate'): void;
    (e: 'source-navigate'): void;
    (e: 'open-memory-ledger'): void;
  }>();

  const memoryInfluence = computed(() => extractAiMemoryInfluence(props.message.activity));
  const memoryInfluenceSummary = computed(() => {
    const influence = memoryInfluence.value;
    if (!influence) return '';
    return influence.status === 'used'
      ? t('ai.memory.influence.used', { count: influence.count })
      : t('ai.memory.influence.notUsed');
  });
  const memoryInfluenceDetails = computed(() => {
    const influence = memoryInfluence.value;
    if (!influence) return '';
    if (influence.status === 'not_used') return t(`ai.memory.influence.reasons.${influence.reason}`);
    const types = influence.types.length
      ? influence.types.map((type) => t(`ai.memory.types.${type}`)).join(t('ai.memory.influence.separator'))
      : t('ai.memory.influence.typeUnavailable');
    const scopes = influence.scopes.length
      ? influence.scopes.map((scope) => t(`ai.memory.scopes.${scope}`)).join(t('ai.memory.influence.separator'))
      : t('ai.memory.influence.scopeUnavailable');
    return t('ai.memory.influence.details', { types, scopes });
  });
  const memoryInfluenceAccessibleLabel = computed(() =>
    t('ai.memory.influence.accessibleLabel', {
      summary: memoryInfluenceSummary.value,
      details: memoryInfluenceDetails.value,
      action: t('ai.memory.influence.openLedger'),
    }),
  );

  // 复制这条消息内容到剪贴板
  const handleCopy = () => {
    const ok = copyTextToClipboard(props.message.content);
    if (ok) bMessage.success(t('ai.copied'));
    else bMessage.warning(t('ai.copyFailed'));
  };

  // 编辑：把内容回填到输入框（由 ChatContainer 处理并聚焦）
  const handleEdit = () => {
    emit('edit', props.message.content, props.message.contexts || []);
  };

  // 重新生成：请求容器用上一条用户消息重发本轮（仅 AI 回答用）
  const handleRegenerate = () => {
    emit('regenerate');
  };

  const formatAssistantMessage = (content: string) => {
    const citationKeys = [
      ...(props.message.evidence || []).map((item) => item.citationKey),
      ...(props.message.sources || []).flatMap((source) => [
        source.citationKey || '',
        ...(source.evidence || []).map((item) => item.citationKey),
      ]),
    ];
    return renderAssistantMarkdown(content, [...new Set(citationKeys.filter(Boolean))], props.message.id);
  };

  // 角标 hover 用的「citationKey → 来源标题」映射(复用证据分组)
  const citationTitleMap = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const group of groupAiEvidence(props.message.sources || [], props.message.evidence || [])) {
      const title = group.items?.find((it) => it.sourceTitle)?.sourceTitle;
      if (group.citationKey && title) map[group.citationKey] = title;
    }
    return map;
  });

  // 角标改成不可点后,hover 用轻笺自己的 tooltip 浮层显示来源名(角标是 v-html 注入的、套不了 BTooltip,故事件委托 + 命令式浮层)
  const citationTip = ref({ visible: false, text: '', x: 0, y: 0 });
  const showCitationTip = (event: MouseEvent) => {
    const el = (event.target as HTMLElement)?.closest?.('.ai-inline-citation') as HTMLElement | null;
    if (!el) return;
    const title = citationTitleMap.value[String(el.dataset.citationKey || '').trim()];
    if (!title) return;
    const rect = el.getBoundingClientRect();
    // 界面缩放(<html> CSS zoom)下 getBoundingClientRect 是视觉坐标,写 fixed 定位要 ÷ 缩放比,否则 tooltip 错位(见 utils/zoom)
    const zoom = getRootZoom();
    citationTip.value = { visible: true, text: title, x: (rect.left + rect.width / 2) / zoom, y: rect.top / zoom };
  };
  const hideCitationTip = (event: MouseEvent) => {
    if ((event.target as HTMLElement)?.closest?.('.ai-inline-citation')) citationTip.value.visible = false;
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const contextIcon = (type: NonNullable<ChatMessage['contexts']>[number]['type']) => {
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    if (type === 'tag') return icon.resource.tag;
    return icon.resource.bookmark;
  };

  function openContext(item: NonNullable<ChatMessage['contexts']>[number]) {
    const source: AiSource = { type: item.type, id: item.id, title: item.title };
    const navigation = resolveAiSourceNavigation(source);
    if (navigation.kind === 'internal') {
      emit('source-navigate');
      void router.push(navigation.target);
    } else if (navigation.kind === 'external') {
      window.open(navigation.url, '_blank', 'noopener,noreferrer');
    }
  }

  // 拦截链接点击：站内地址用 router.push SPA 跳转，外部链接新窗口打开
  const handleLinkClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest<HTMLAnchorElement>('a');
    if (!anchor || !anchor.href) return;

    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return;
    try {
      const url = new URL(href, window.location.origin);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      // 判断是否为同一站点
      if (url.origin === window.location.origin) {
        event.preventDefault();
        emit('source-navigate');
        void router.push(url.pathname + url.search + url.hash);
      } else {
        // 外部链接在新窗口打开
        event.preventDefault();
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // URL 解析失败，不做处理
    }
  };
</script>

<style scoped>
  .message {
    margin-bottom: 1.25rem;
    animation: message-fade-in 0.18s ease-out;
  }

  .message-content {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    max-width: min(90%, 1080px);
  }

  .message.user .message-content {
    margin-left: auto;
    flex-direction: row-reverse;
  }

  .avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .bubble {
    border-radius: 1rem;
    max-width: 100%;
  }

  .message.user .bubble {
    padding: 0.625rem 0.875rem;
    background: var(--ai-user-background-color);
    border: 1px solid var(--ai-user-border-color);
    color: var(--text-color);
    border-bottom-right-radius: 0.25rem;
  }

  .message.assistant .bubble {
    border-bottom-left-radius: 0.25rem;
    color: var(--text-color);
  }

  .text {
    line-height: 1.5;
    word-wrap: break-word;
  }

  .user-text {
    white-space: pre-wrap;
  }

  .citation-audit-notice {
    margin: 0.35rem 0 0;
    padding: 0.4rem 0.55rem;
    border: 1px solid color-mix(in srgb, var(--warning-color, #c47f17) 32%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--warning-color, #c47f17) 8%, var(--card-background));
    color: color-mix(in srgb, var(--warning-color, #c47f17) 72%, var(--text-color));
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .memory-influence {
    display: flex;
    width: 100%;
    min-height: 38px;
    /* 覆盖 BButton .b_btn 的 height:32px / line-height:32px —— 否则双行文案(标题+说明)被 32px 行高
       各自撑高,卡片变得很高、两行离得老远,而 6px 内边距相对巨大的行高又显得文字贴着上下边框。 */
    height: auto;
    line-height: 1.35;
    align-items: center;
    justify-content: flex-start;
    gap: 7px;
    margin-top: 7px;
    padding: 6px 9px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 22%, var(--surface-border-color));
    border-radius: 9px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--card-background));
    color: var(--primary-color);
    text-align: left;
  }

  .memory-influence.is-not_used {
    border-color: var(--surface-border-color);
    background: var(--workspace-panel-bg-color, var(--card-background));
    color: var(--desc-color);
  }

  .memory-influence__copy {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 1px;
  }

  .memory-influence__copy strong,
  .memory-influence__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .memory-influence__copy strong {
    color: var(--text-color);
    font-size: 12px;
    font-weight: 650;
  }

  .memory-influence__copy small,
  .memory-influence__action {
    color: var(--desc-color);
    font-size: 11px;
  }

  .memory-influence__action {
    flex: 0 0 auto;
    color: var(--primary-color);
    font-weight: 600;
  }

  .user-contexts {
    margin-top: 8px;
    padding-top: 7px;
    border-top: 1px solid var(--ai-user-context-divider-color);
  }

  .user-contexts__title {
    margin-bottom: 5px;
    color: color-mix(in srgb, var(--primary-color) 32%, var(--desc-color));
    font-size: 11px;
    font-weight: 500;
    line-height: 1.2;
    text-align: right;
  }

  .user-contexts__list {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 5px;
  }

  .user-context-chip {
    --context-color: var(--resource-bookmark-color);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 180px;
    padding: 4px 7px;
    border: 1px solid color-mix(in srgb, var(--context-color) 24%, var(--ai-user-background-color));
    border-radius: 8px;
    background: color-mix(in srgb, var(--context-color) 9%, var(--ai-user-background-color));
    height: auto;
    line-height: normal;
    cursor: pointer;
  }

  .user-context-chip:hover {
    border-color: color-mix(in srgb, var(--context-color) 46%, var(--ai-user-background-color));
    background: color-mix(in srgb, var(--context-color) 14%, var(--ai-user-background-color));
  }

  .user-context-chip.is-note {
    --context-color: var(--resource-note-color);
  }

  .user-context-chip.is-file {
    --context-color: var(--resource-file-color);
  }

  .user-context-chip.is-tag {
    --context-color: var(--resource-tag-color);
  }

  .user-context-chip__icon {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--context-color);
  }

  .user-context-chip strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: 11px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .text h1,
  .text h2,
  .text h3,
  .text h4,
  .text h5,
  .text h6 {
    margin-top: 1.2em;
    margin-bottom: 0.6em;
    color: var(--text-color);
    font-weight: 600;
  }

  .text h1 {
    font-size: 1.5em;
    border-bottom: 1px solid var(--surface-border-color);
    padding-bottom: 0.3em;
  }

  .text h2 {
    font-size: 1.3em;
  }

  .text h3 {
    font-size: 1.1em;
  }

  .text pre {
    background: color-mix(in srgb, var(--card-background) 88%, var(--text-color) 12%);
    border: 1px solid var(--surface-border-color);
    border-radius: 6px;
    padding: 12px;
    overflow-x: auto;
    margin: 1em 0;
  }

  .text code {
    background: color-mix(in srgb, var(--card-background) 88%, var(--text-color) 12%);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.9em;
  }

  .text pre code {
    background: none;
    padding: 0;
  }

  .text ul,
  .text ol {
    padding-left: 1.5em;
    margin: 1em 0;
  }

  .text li {
    margin: 0.3em 0;
  }

  .text blockquote {
    border-left: 4px solid var(--surface-border-color);
    padding-left: 1em;
    margin: 1em 0;
    color: var(--desc-color);
    font-style: italic;
  }

  .text table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }

  .text th,
  .text td {
    border: 1px solid var(--surface-border-color);
    padding: 8px 12px;
    text-align: left;
  }

  .text th {
    background: color-mix(in srgb, var(--card-background) 90%, var(--primary-color) 10%);
    font-weight: 600;
  }

  .text a {
    color: var(--primary-color);
    text-decoration: none;
  }

  .text a:hover {
    text-decoration: underline;
  }

  .text :deep(.ai-inline-citation) {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    margin: 0 1px;
    padding: 0 5px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 28%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
    color: var(--primary-color);
    font-size: 0.84em;
    font-weight: 700;
    line-height: 1.35;
    text-decoration: none;
    vertical-align: 0.06em;
    cursor: help;
  }

  .text :deep(.ai-inline-citation:hover) {
    border-color: color-mix(in srgb, var(--primary-color) 52%, transparent);
    background: color-mix(in srgb, var(--primary-color) 14%, var(--card-background));
    text-decoration: none;
  }

  /* 角标 hover tooltip(Teleport 到 body,scoped 下靠 data-v 属性生效;浮在角标上方居中,不挡鼠标) */
  .ai-citation-tip {
    position: fixed;
    z-index: 100060;
    transform: translate(-50%, calc(-100% - 8px));
    max-width: 260px;
    padding: 5px 10px;
    border-radius: 7px;
    background: rgba(30, 34, 44, 0.94);
    color: #fff;
    font-size: 12.5px;
    line-height: 1.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
    pointer-events: none;
  }

  /* 使用主题变量替代 highlight.js 的固定亮色主题，避免暗色模式下代码不可读。 */
  .text :deep(.hljs-comment),
  .text :deep(.hljs-quote) {
    color: var(--desc-color);
    font-style: italic;
  }

  .text :deep(.hljs-keyword),
  .text :deep(.hljs-selector-tag),
  .text :deep(.hljs-literal),
  .text :deep(.hljs-section),
  .text :deep(.hljs-link) {
    color: color-mix(in srgb, var(--primary-color) 78%, #7c3aed);
  }

  .text :deep(.hljs-string),
  .text :deep(.hljs-title),
  .text :deep(.hljs-name),
  .text :deep(.hljs-type),
  .text :deep(.hljs-attribute),
  .text :deep(.hljs-symbol),
  .text :deep(.hljs-bullet),
  .text :deep(.hljs-addition),
  .text :deep(.hljs-variable),
  .text :deep(.hljs-template-tag),
  .text :deep(.hljs-template-variable) {
    color: color-mix(in srgb, var(--success-color, #2e8b57) 78%, var(--text-color));
  }

  .text :deep(.hljs-number),
  .text :deep(.hljs-meta),
  .text :deep(.hljs-built_in),
  .text :deep(.hljs-builtin-name),
  .text :deep(.hljs-params) {
    color: color-mix(in srgb, var(--warning-color, #c47f17) 80%, var(--text-color));
  }

  .text :deep(.hljs-deletion) {
    color: var(--danger-color, #d14343);
  }

  .time {
    font-size: 0.75rem;
    opacity: 0.6;
  }

  /* 气泡列：气泡与操作条上下排列；操作条移到气泡外，气泡才能收窄贴合内容 */
  .bubble-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 100%;
  }

  .message.user .bubble-col {
    align-items: flex-end;
  }

  .message.assistant .bubble-col {
    align-items: flex-start;
  }

  @media (max-width: 520px) {
    .memory-influence {
      min-height: 44px;
    }

    .memory-influence__action {
      display: none;
    }
  }

  /* 用户消息：气泡外下方的操作条（图标在前、时间在后），整体右对齐 */
  .msg-footer {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.2rem;
    padding: 0 0.15rem;
  }

  .msg-actions {
    display: inline-flex;
    gap: 0.15rem;
  }

  .msg-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-color);
    opacity: 0.55;
    cursor: pointer;
    border-radius: 6px;
    transition:
      opacity 0.15s,
      background 0.15s,
      color 0.15s;
  }

  @media (pointer: coarse) {
    .msg-action-btn {
      width: 44px;
      height: 44px;
    }
  }

  .msg-action-btn:hover {
    opacity: 1;
    color: var(--primary-color);
    /* 灰阶半透明，暗色/亮色主题下都可见 */
    background: rgba(127, 127, 127, 0.15);
  }

  /* 桌面端（可 hover）图标默认隐藏，鼠标移到该条消息才淡入，减少干扰；
     触摸设备无 hover，保持常显方便点按。时间始终显示。 */
  @media (hover: hover) {
    .msg-actions {
      opacity: 0;
      transition: opacity 0.15s;
    }
    .message:hover .msg-actions {
      opacity: 1;
    }
  }

  @keyframes message-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .message {
      animation: none;
    }

    .msg-action-btn {
      transition: none;
    }
  }
</style>
