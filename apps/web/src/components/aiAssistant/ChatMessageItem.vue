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
      <div
        class="bubble"
        v-if="message.content || (message.thoughts && message.thoughts.length) || (message.sources && message.sources.length)"
      >
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
        <div v-if="message.content" class="text" v-html="formatMessage(message)" @click="handleLinkClick"></div>
        <!-- 来源卡片:Agent 命中的书签/笔记/文件,可点击跳转 -->
        <div v-if="message.role === 'assistant' && message.sources && message.sources.length" class="sources">
          <div class="sources-title">📎 来源 · {{ message.sources.length }}</div>
          <div class="sources-list">
            <button
              v-for="s in message.sources"
              :key="`${s.type}-${s.id}`"
              class="source-card"
              @click="openSource(s)"
              v-click-log="{ module: 'AI助手', operation: `点击来源【${s.type}:${s.title}】` }"
            >
              <span class="source-type" :class="`source-type--${s.type}`">{{ sourceTypeLabel(s.type) }}</span>
              <span class="source-body">
                <span class="source-name">{{ s.title }}</span>
                <span v-if="s.snippet" class="source-snippet">{{ s.snippet }}</span>
              </span>
            </button>
          </div>
        </div>
        <div class="time" v-if="message.role === 'user'">{{ formatTime(message.timestamp) }}</div>
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
  import router from '@/router';

  const { t } = useI18n();

  const bookmark = bookmarkStore();
  const user = useUserStore();

  interface SourceItem {
    id: string;
    type: 'bookmark' | 'note' | 'file' | 'tag';
    title: string;
    url?: string;
    route?: string;
    fileType?: string;
    snippet?: string;
  }

  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    thoughts?: any[];
    thinkingText?: string;
    thinkingDisplay?: string;
    sources?: SourceItem[];
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
      // 预处理：给裸 URL 加尖括号 < >，避免中文/全角字符被 marked 吞入链接
      const processedContent = message.content.replace(
        /([\s\n]|^)(https?:\/\/[^\s<]*?)(?=[）\)】」』」。，、；：\s<]|$)/g,
        '$1<$2>',
      );
      const rawHtml = marked.parse(processedContent) as string;
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

  const sourceTypeLabel = (type: string): string =>
    (({ bookmark: '书签', note: '笔记', file: '文件', tag: '标签' }) as Record<string, string>)[type] || type;

  // 点击来源卡片:复用全局搜索的跳转交互(书签开外链 / 笔记进详情 / 文件进云空间预览 / 标签进详情)
  const openSource = (s: SourceItem) => {
    if (s.type === 'bookmark' && s.url) {
      const hasProtocol = /^https?:\/\//i.test(s.url);
      window.open(hasProtocol ? s.url : `https://${s.url}`, '_blank', 'noopener,noreferrer');
      return;
    }
    if (s.type === 'file') {
      router.push({ path: '/cloudSpace', query: { fileName: s.title } });
      return;
    }
    if (s.route) router.push(s.route);
  };

  // 拦截链接点击：站内地址用 router.push SPA 跳转，外部链接新窗口打开
  const handleLinkClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest<HTMLAnchorElement>('a');
    if (!anchor || !anchor.href) return;

    const href = anchor.getAttribute('href') || '';
    // 只处理 http 链接
    if (!href.startsWith('http')) return;
    try {
      const url = new URL(href);
      const siteUrl = new URL(window.location.origin);
      // 判断是否为同一站点
      if (url.host === siteUrl.host) {
        event.preventDefault();
        router.push(url.pathname + url.search + url.hash);
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
    border-radius: 1.125rem;
    max-width: 100%;
  }

  .message.user .bubble {
    padding: 1rem 1.25rem;
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

  /* 来源卡片 */
  .sources {
    margin-top: 0.75rem;
    padding-top: 0.6rem;
    border-top: 1px dashed var(--card-border-color, #e2e8f0);
  }

  .sources-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--desc-color, #888);
    margin-bottom: 0.5rem;
  }

  .sources-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .source-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--card-border-color, #e2e8f0);
    border-radius: 0.6rem;
    background: var(--background-color, #fff);
    cursor: pointer;
    transition:
      border-color 0.18s,
      transform 0.18s,
      box-shadow 0.18s;
  }

  .source-card:hover {
    border-color: #7b79d3;
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(123, 121, 211, 0.18);
  }

  .source-type {
    flex: 0 0 auto;
    font-size: 0.68rem;
    line-height: 1.6;
    padding: 0 0.45rem;
    border-radius: 999px;
    color: #fff;
    background: #9aa0aa;
  }

  .source-type--bookmark {
    background: #4f8cff;
  }
  .source-type--note {
    background: #22b07d;
  }
  .source-type--file {
    background: #f0883e;
  }
  .source-type--tag {
    background: #7b79d3;
  }

  .source-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 1px;
  }

  .source-name {
    font-size: 0.8rem;
    color: var(--text-color, #2d3748);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .source-snippet {
    font-size: 0.7rem;
    color: var(--desc-color, #999);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
