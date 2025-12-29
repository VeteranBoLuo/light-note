<template>
  <div class="message" :class="message.role">
    <div class="message-content">
      <div class="avatar" :class="message.role">
        <img
          v-if="message.role !== 'user'"
          src="/favicon.svg"
          :title="t('ai.homeTitle')"
          width="25"
          height="25"
          alt=""
        />
        <div
          class="navigation-icon"
          style="
            margin-left: 5px;
            display: flex;
            align-items: center;
            clip-path: circle(50% at 50% 50%);
            cursor: pointer;
          "
          v-else
        >
          <svg-icon size="32" :src="user.headPicture || icon.navigation.user" class="dom-hover" />
        </div>
      </div>
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
        <div class="text" v-html="formatMessage(message)"></div>
        <div class="time">{{ formatTime(message.timestamp) }}</div>
      </div>
      <ReplyLoading v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import hljs from 'highlight.js';
  import 'highlight.js/styles/github.css';
  import { bookmarkStore, useUserStore } from '@/store';
  import icon from '@/config/icon.ts';
  import ReplyLoading from '@/components/aiAssistant/ReplyLoading.vue';
  import { useI18n } from 'vue-i18n';

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
  }

  const props = defineProps<{
    message: ChatMessage;
    hasAnswerStarted: boolean;
  }>();

  // 配置 Markdown 解析器（保持与原组件一致，忽略类型检查约束）
  const markedOptions: any = {
    highlight: function (code: string, lang: string) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
    breaks: true,
    gfm: true,
    smartLists: true,
    smartypants: true,
  };

  marked.setOptions(markedOptions);

  const formatMessage = (message: ChatMessage): string => {
    if (message.role === 'user') {
      return message.content.replace(/\n/g, '<br>');
    }

    try {
      const rawHtml = marked.parse(message.content) as string;
      const cleanHtml = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'p',
          'br',
          'strong',
          'em',
          'u',
          's',
          'ul',
          'ol',
          'li',
          'blockquote',
          'code',
          'pre',
          'a',
          'img',
          'table',
          'thead',
          'tbody',
          'tr',
          'th',
          'td',
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'class'],
      });
      return cleanHtml;
    } catch (error) {
      console.error('Markdown解析错误:', error);
      return message.content.replace(/\n/g, '<br>');
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hasAnswerStarted = computed(() => props.hasAnswerStarted);
</script>

<style scoped>
  .message {
    margin-bottom: 1.5rem;
    animation: fadeIn 0.3s ease;
  }

  .message-content {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    max-width: 90%;
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
    background: var(--menu-container-bg-color);
    padding: 1rem 1.25rem;
    border-radius: 1.125rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    max-width: 100%;
  }

  .message.user .bubble {
    background: var(--ai-user-background-color);
    color: var(--text-color);
    border-bottom-right-radius: 0.25rem;
  }

  .message.assistant .bubble {
    border-bottom-left-radius: 0.25rem;
    background: color-mix(in srgb, var(--menu-container-bg-color) 20%, #7c73cb 50%);
    color: var(--text-color);
  }

  .text {
    line-height: 1.5;
    word-wrap: break-word;
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
    opacity: 0.7;
    margin-top: 0.5rem;
  }

  .thoughts {
    margin-bottom: 1rem;
    padding: 0.5rem;
    line-height: 1.4;
    background: rgba(0, 0, 0, 0.25);
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
    color: rgba(255, 255, 255, 0.95);
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
