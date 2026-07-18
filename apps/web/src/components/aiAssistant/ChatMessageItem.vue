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
        <div class="bubble" v-if="message.content || (message.thoughts && message.thoughts.length)">
          <!-- 深度思考过程 -->
          <div v-if="message.thoughts && message.thoughts.length" class="thoughts">
            <div class="thoughts-header">{{
              message.thinkingText && hasAnswerStarted ? '思考完毕' : '深度思考中...'
            }}</div>
            <div v-if="message.thoughts.some((t) => t.action_type === 'reasoning')" class="reasoning">
              <strong>思考：</strong>{{ message.thinkingDisplay || message.thinkingText || '' }}
            </div>
            <div v-for="(thought, index) in message.thoughts" :key="index" class="thought">
              <div v-if="thought.action_type === 'agentRag'" class="rag">
                <strong>知识检索</strong>
              </div>
            </div>
          </div>
          <!-- Markdown 渲染内容 -->
          <div v-if="message.role === 'user'" class="text user-text" v-text="message.content"></div>
          <div v-else class="text" v-html="formatAssistantMessage(message.content)" @click="handleLinkClick"></div>
          <div v-if="message.role === 'user' && message.contexts?.length" class="user-contexts">
            <div class="user-contexts__title">{{ t('ai.attachedResources') }} · {{ message.contexts.length }}</div>
            <div class="user-contexts__list">
              <span
                v-for="item in message.contexts"
                :key="`${item.type}:${item.id}`"
                :class="['user-context-chip', `is-${item.type}`]"
                :title="item.title"
              >
                <span class="user-context-chip__icon" aria-hidden="true">
                  <SvgIcon :src="contextIcon(item.type)" size="13" />
                </span>
                <strong>{{ item.title }}</strong>
              </span>
            </div>
          </div>
        </div>
        <ReplyLoading v-else-if="!message.toolEvents?.length" />
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
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </BButton>
            <BButton class="msg-action-btn" :title="t('ai.edit')" @click="handleEdit">
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
              </svg>
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
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </BButton>
            <BButton class="msg-action-btn" :title="t('ai.regenerate')" @click="handleRegenerate">
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M23 4v6h-6"></path>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </BButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import 'highlight.js/styles/github.css';
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
  import { renderAssistantMarkdown } from '@/utils/aiMessageRender';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

  const { t } = useI18n();

  const bookmark = bookmarkStore();
  const user = useUserStore();

  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    thoughts?: any[];
    thinkingText?: string;
    thinkingDisplay?: string;
    contexts?: Array<{ type: 'bookmark' | 'note' | 'file' | 'tag'; id: string; title: string }>;
    toolEvents?: AiToolStatusItem[];
  }

  const props = defineProps<{
    message: ChatMessage;
    hasAnswerStarted: boolean;
  }>();

  // 点“编辑”把这条用户消息内容抛给容器，回填到输入框
  const emit = defineEmits<{
    (e: 'edit', content: string, contexts: NonNullable<ChatMessage['contexts']>): void;
    (e: 'regenerate'): void;
    (e: 'source-navigate'): void;
  }>();

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

  const formatAssistantMessage = renderAssistantMarkdown;

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hasAnswerStarted = computed(() => props.hasAnswerStarted);

  const contextIcon = (type: NonNullable<ChatMessage['contexts']>[number]['type']) => {
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    if (type === 'tag') return icon.resource.tag;
    return icon.resource.bookmark;
  };

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
    animation: fadeIn 0.3s ease;
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

  .message.assistant .avatar {
    background: #7b79d3;
  }

  .bubble {
    border-radius: 1rem;
    max-width: 100%;
  }

  .message.user .bubble {
    padding: 0.625rem 0.875rem;
    background: var(--ai-user-background-color);
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

  .user-contexts {
    margin-top: 8px;
    padding-top: 7px;
    border-top: 1px solid color-mix(in srgb, var(--text-color) 10%, transparent);
  }

  .user-contexts__title {
    margin-bottom: 5px;
    color: var(--desc-color);
    font-size: 11px;
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
    border: 1px solid color-mix(in srgb, var(--context-color) 18%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--context-color) 7%, var(--card-background));
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
    color: #2d3748;
    font-weight: 600;
  }

  .text h1 {
    font-size: 1.5em;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 0.3em;
  }

  .text h2 {
    font-size: 1.3em;
  }

  .text h3 {
    font-size: 1.1em;
  }

  .text pre {
    background: #f6f8fa;
    border: 1px solid #e1e5e9;
    border-radius: 6px;
    padding: 12px;
    overflow-x: auto;
    margin: 1em 0;
  }

  .text code {
    background: #f1f3f4;
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
    border-left: 4px solid #e2e8f0;
    padding-left: 1em;
    margin: 1em 0;
    color: #4a5568;
    font-style: italic;
  }

  .text table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }

  .text th,
  .text td {
    border: 1px solid #e2e8f0;
    padding: 8px 12px;
    text-align: left;
  }

  .text th {
    background: #f7fafc;
    font-weight: 600;
  }

  .text a {
    color: #3b82f6;
    text-decoration: none;
  }

  .text a:hover {
    text-decoration: underline;
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

  .msg-action-btn:hover {
    opacity: 1;
    color: var(--primary-color);
    /* 灰阶半透明，暗色/亮色主题下都可见 */
    background: rgba(127, 127, 127, 0.15);
  }

  .msg-action-btn svg {
    display: block;
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

  .thoughts {
    margin-bottom: 1rem;
    padding: 0.5rem;
    line-height: 1.4;
    background: rgba(189, 177, 177, 0.25);
    border-radius: 0.5rem;
    border-left: 3px solid var(--primary-color);
  }

  .thoughts-header {
    font-weight: bold;
    color: var(--primary-color);
    margin-bottom: 0.5rem;
  }

  .thought {
    margin: 0.5rem 0;
    font-size: 0.9rem;
  }

  .reasoning {
    color: #888;
    font-size: 0.85rem;
  }

  .rag {
    color: #007bff;
  }

  .observation {
    margin-top: 0.25rem;
    font-size: 0.8rem;
    color: #888;
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
</style>
