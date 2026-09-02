import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { AI_QUOTA_ERROR_CODES } from '@lightnote/shared/ai-quota-protocol';
import globalDirect from '@/config/globalDirect';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import NoteAiReplyHarness from './NoteAiReplyHarness.vue';

type VisualState = 'success' | 'loading' | 'error' | 'empty' | 'quota-exhausted' | 'quota-insufficient';

const params = new URLSearchParams(window.location.search);
const requestedState = params.get('state');
const state: VisualState = ['success', 'loading', 'error', 'empty', 'quota-exhausted', 'quota-insufficient'].includes(
  String(requestedState),
)
  ? (requestedState as VisualState)
  : 'success';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const noteType = params.get('noteType') === 'markdown' ? 'markdown' : 'html';

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', window.innerWidth <= 720);
document.body.dataset.visualState = state;

const markdownResult = `### 待办事项摘要

- **用户反馈与通知：** 进入网站查询新反馈并弹窗确认；支持对反馈回复、确认和邮件通知。

- **笔记模块：** 新增多选删除、关键词搜索、导出 Markdown、关联书签与 AI 问答。

  - 修复新建即保存和粘贴图片报错。
  - 优化移动端工具栏与顶部布局。

- **云空间：** 增加文件夹关联、文档预览、批量删除和文件过长处理。`;

const htmlResult = `<h3>待办事项摘要</h3>

<ul>
  <li><strong>用户反馈与通知：</strong>进入网站查询新反馈并弹窗确认；支持对反馈回复、确认和邮件通知。</li>

  <li><strong>笔记模块：</strong>新增多选删除、关键词搜索、导出 Markdown、关联书签与 AI 问答。
    <ul>
      <li>修复新建即保存和粘贴图片报错。</li>
      <li>优化移动端工具栏与顶部布局。</li>
    </ul>
  </li>

  <li><strong>云空间：</strong>增加文件夹关联、文档预览、批量删除和文件过长处理。</li>
</ul>`;

function completedResponse(content: string) {
  return {
    protocolVersion: 1,
    requestId: '11111111-1111-4111-8111-111111111111',
    skillId: 'note.transform_text',
    skillVersion: 1,
    status: 'completed',
    threadId: null,
    scopeDigest: null,
    result: { kind: 'grounded_markdown', content },
    sources: [],
    coverage: { complete: true, warnings: [] },
    availableActions: [],
    receipt: { resourceCount: 1, modelCalled: true, writeCommitted: false },
    error: null,
  };
}

function sseResponse(frames: Array<{ event: string; data: unknown }>, keepOpen = false) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(encoder.encode(`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`));
        }
        if (!keepOpen) controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

window.fetch = async () => {
  if (state === 'loading') return sseResponse([{ event: 'start', data: {} }], true);
  if (state === 'quota-exhausted') {
    return sseResponse([
      { event: 'start', data: {} },
      { event: 'error', data: { code: AI_QUOTA_ERROR_CODES.EXHAUSTED, status: 429 } },
    ]);
  }
  if (state === 'quota-insufficient') {
    return sseResponse([
      { event: 'start', data: {} },
      {
        event: 'error',
        data: {
          code: AI_QUOTA_ERROR_CODES.INSUFFICIENT_FOR_REQUEST,
          status: 429,
          requiredTokens: 26_900,
          availableTokens: 21_700,
        },
      },
    ]);
  }
  if (state === 'error') {
    return sseResponse([
      { event: 'start', data: {} },
      { event: 'error', data: { code: 'VISUAL_FIXTURE_ERROR', message: 'AI 服务暂时繁忙，请稍后重试。' } },
    ]);
  }
  const content = noteType === 'markdown' ? markdownResult : htmlResult;
  return sseResponse([
    { event: 'start', data: {} },
    { event: 'delta', data: { content } },
    { event: 'complete', data: completedResponse(content) },
  ]);
};

const app = createApp(NoteAiReplyHarness, { noteType });
app.use(createPinia());
app.use(
  createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, 'en-US': enUS },
  }),
);
globalDirect(app);
app.mount('#app');

if (state !== 'empty') {
  requestAnimationFrame(() => {
    document.querySelectorAll<HTMLButtonElement>('.action-btn')[2]?.click();
  });
}
