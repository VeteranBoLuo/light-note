import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { applyUiDensity } from '@/composables/useUiDensity';
import { bookmarkStore, useUserStore } from '@/store';
import globalDirect from '@/config/globalDirect';
import request from '@/http/request';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import FormsWorkspace from '@/view/toolbox/forms/FormsWorkspace.vue';
import PublicForm from '@/view/toolbox/forms/PublicForm.vue';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search),
  state = params.get('state') || 'collecting';
const theme = params.get('theme') || 'day',
  locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  params.get('renderProfile') === 'mobile',
);
const definition = {
  submissionPolicy: params.get('policy') === 'replace' ? 'replace' : 'multiple',
  title: '轻笺体验反馈',
  description: '帮助我们把轻笺做得更好。请分享你的真实体验，所有回答仅收集者可见。',
  successMessage: '谢谢，你的建议我们已经收到。',
  questions: [
    {
      id: 'q1',
      title: '你最常使用哪些模块？',
      type: 'multiple',
      required: true,
      options: [
        { id: 'a', label: '书签' },
        { id: 'b', label: '笔记' },
        { id: 'c', label: '云空间' },
        { id: 'd', label: '待办' },
      ],
    },
    { id: 'q2', title: '你对整体体验的评分', type: 'rating', required: true, options: [] },
    { id: 'q3', title: '有什么希望改进的地方？', type: 'long', required: false, options: [] },
    { id: 'q4', title: '每周大约使用几次？', type: 'number', required: false, options: [] },
    { id: 'q5', title: '希望何时收到回复？', type: 'date', required: false, options: [] },
  ],
};
const forms: any[] = [
  {
    id: 'sample',
    title: definition.title,
    definition,
    tagIds: ['tag'],
    version: 1,
    published: state === 'draft' ? 0 : 1,
    public_id: 'a'.repeat(48),
    status: state === 'draft' ? 'draft' : 'collecting',
    total: state === 'emptyResponses' ? 0 : 38,
    unread: state === 'emptyResponses' ? 0 : 3,
  },
  {
    id: 'second',
    title: '周末读书分享会 · 问题征集',
    definition: { ...definition, title: '周末读书分享会 · 问题征集' },
    tagIds: [],
    version: 1,
    published: 1,
    public_id: 'b'.repeat(48),
    status: 'paused',
    total: 12,
    unread: 0,
  },
];
const submissions = Array.from({ length: 38 }, (_, i) => ({
  id: `r${i}`,
  created_at: new Date(Date.now() - i * 3600000).toISOString(),
  is_read: i > 2 ? 1 : 0,
  processed: i > 4 ? 1 : 0,
  spam: 0,
  private_note: '',
  answers: { q1: ['a', 'b'], q2: 5, q3: '希望移动端的整理操作更方便一些。', q4: 7, q5: '2026-09-30' },
}));
const seenRequests: string[] = [];
request.defaults.adapter = async (config) => {
  seenRequests.push(String(config.url));
  document.documentElement.dataset.collectionRequests = JSON.stringify(seenRequests);
  const url = String(config.url),
    body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {},
    parts = url.split('/'),
    id = parts[4],
    form = forms.find((f) => f.id === id) || forms[0];
  let data: any = {};
  if (state === 'error') throw new Error('模拟网络异常，可刷新重试');
  if (state === 'loading') await new Promise(() => {});
  if (url.endsWith('/tags')) data = [{ id: 'tag', name: '产品反馈' }];
  else if (url.endsWith('/forms') && config.method === 'get')
    data =
      state === 'empty'
        ? []
        : forms.filter(
            (f) =>
              (!config.params?.status || config.params.status === 'all' || f.status === config.params.status) &&
              (!config.params?.search || f.title.includes(config.params.search)),
          );
  else if (url.endsWith('/forms') && config.method === 'post') {
    data = { id: crypto.randomUUID() };
    forms.unshift({
      ...forms[0],
      ...data,
      definition: body.definition,
      tagIds: body.tagIds || [],
      title: body.definition.title,
      status: 'draft',
      published: 0,
      total: 0,
      unread: 0,
    });
  } else if (url.endsWith('/statistics'))
    data = {
      summary: { total: 38, valid: 36, spam: 2 },
      trend: [
        { day: '2026-09-20', count: 8 },
        { day: '2026-09-21', count: 12 },
        { day: '2026-09-22', count: 16 },
      ],
      questions: definition.questions.map((q) => ({
        ...q,
        answered: 36,
        average: 4.3,
        minimum: 1,
        maximum: 12,
        choices: q.options.map((o, i) => ({ option_id: o.id, count: [30, 24, 12, 8][i] })),
        values:
          q.type === 'rating'
            ? [
                { value: '3', count: 4 },
                { value: '4', count: 17 },
                { value: '5', count: 15 },
              ]
            : q.type === 'date'
              ? [{ value: '2026-09-30', count: 36 }]
              : [],
      })),
    };
  else if (url.endsWith('/responses/actions')) {
    for (const r of submissions.filter((r) => body.ids?.includes(r.id))) {
      if (body.action === 'read') r.is_read = 1;
      if (body.action === 'processed') r.processed = 1;
      if (body.action === 'pending') r.processed = 0;
      if (body.action === 'spam') r.spam = 1;
      if (body.action === 'restore') r.spam = 0;
      if (body.action === 'note') r.private_note = body.note;
    }
  } else if (url.endsWith('/responses')) {
    const filter = config.params || {};
    const matches =
      state === 'emptyResponses'
        ? []
        : submissions.filter((r) => {
            const day = new Date(+new Date(r.created_at) + 8 * 3600000).toISOString().slice(0, 10);
            if ((filter.from && day < filter.from) || (filter.to && day > filter.to)) return false;
            if (filter.state === 'spam') return !!r.spam;
            if (filter.state !== 'all' && r.spam) return false;
            if (filter.state === 'unread') return !r.is_read;
            if (filter.state === 'pending') return !r.processed;
            if (filter.state === 'processed') return !!r.processed;
            return true;
          });
    const offset = (Number(filter.page || 1) - 1) * 30;
    data = { watermark: new Date().toISOString(), items: matches.slice(offset, offset + 30), total: matches.length };
  } else if (url.endsWith('/text-answers')) data = [{ text_value: '希望移动端的整理操作更方便一些。' }];
  else if (url.endsWith('/actions')) {
    if (body.action === 'publish') {
      form.status = 'collecting';
      form.published = 1;
    }
    if (body.action === 'pause') form.status = 'paused';
    if (body.action === 'resume') form.status = 'collecting';
    if (body.action === 'end') form.status = 'ended';
    data = { status: form.status };
    form.version++;
  } else if (config.method === 'patch') {
    form.definition = body.definition;
    form.title = body.definition.title;
    form.tagIds = body.tagIds;
    form.version++;
  } else data = form;
  if (url.endsWith('/statistics') && ['statsSparse', 'statsEmpty'].includes(state)) {
    const empty = state === 'statsEmpty';
    data = {
      summary: { total: empty ? 0 : 2, valid: empty ? 0 : 2, spam: 0 },
      trend: empty ? [] : [{ day: '2026-09-24', count: 2 }],
      questions: [
        {
          id: 's1',
          title: '你更倾向于哪个选项？',
          type: 'single',
          answered: empty ? 0 : 2,
          options: [
            { id: 'a', label: '选项一' },
            { id: 'b', label: '选项二' },
          ],
          choices: [{ option_id: 'b', count: empty ? 0 : 2 }],
        },
        {
          id: 's2',
          title: '整体体验评分',
          type: 'rating',
          answered: empty ? 0 : 2,
          average: empty ? null : 1.5,
          values: empty
            ? []
            : [
                { value: 1, count: 1 },
                { value: 2, count: 1 },
              ],
        },
      ],
    };
  }
  return {
    data: { status: 200, data: JSON.parse(JSON.stringify(data)), msg: '' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  };
};
let mySubmission: any = params.get('submitted') ? { receipt: 'test', answers: submissions[0].answers } : null;
window.fetch = async (_input, init) => {
  let data: any;
  if (init?.method === 'POST') {
    const outcome = mySubmission ? 'updated' : 'created';
    mySubmission = { receipt: 'test', answers: JSON.parse(String(init.body)).answers };
    data = { receipt: 'test', outcome };
  } else
    data = {
      status: ['paused', 'ended'].includes(state) ? state : 'collecting',
      definition,
      submissionPolicy: definition.submissionPolicy,
      mySubmission: definition.submissionPolicy === 'replace' ? mySubmission : null,
    };
  return new Response(JSON.stringify({ status: 200, data }), { headers: { 'Content-Type': 'application/json' } });
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/toolbox/forms/:formId?', name: 'collectionForms', component: FormsWorkspace },
    {
      path: '/f/:publicId',
      name: 'publicCollectionForm',
      meta: { publicStandalone: true, hideAiAssistant: true, seoIndexable: false },
      component: PublicForm,
    },
  ],
});
const app = createApp(params.get('shell') ? (await import('@/App.vue')).default : { render: () => h(RouterView) }),
  pinia = createPinia();
app.use(pinia);
app.use(router);
app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
if (!params.get('shell'))
  useUserStore(pinia).setUserInfo({
    id: 'fixture-owner',
    role: 'user',
    alias: '验收账号',
    preferences: { theme, lang: locale, noteViewMode: 'card' },
  });
bookmarkStore(pinia).screenWidth = window.innerWidth;
await router.push(
  params.get('public') ? '/f/' + forms[0].public_id : params.get('list') ? '/toolbox/forms' : '/toolbox/forms/sample',
);
await router.isReady();
app.mount('#app');
