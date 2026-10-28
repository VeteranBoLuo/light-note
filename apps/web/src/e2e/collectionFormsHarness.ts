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
import NotificationBell from '@/components/notification/NotificationBell.vue';
import type { NotificationItem } from '@/composables/useNotification';
import { notificationPresentation } from '@lightnote/shared/notification-presentation';
import {
  OTHER_OPTION_ID,
  validateAnswers,
  type FormAnswers,
  type FormDefinition,
} from '@lightnote/shared/collection-forms';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search),
  state = params.get('state') || 'collecting';
const theme = params.get('theme') || 'day',
  locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const membersOnly = params.has('members') || params.has('reward');
const account = params.get('account') === 'guest' ? null : { id: 'fixture-participant', alias: '轻笺体验用户' };
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  params.get('renderProfile') === 'mobile',
);
const definition: FormDefinition = {
  submissionPolicy: membersOnly || params.get('policy') === 'replace' ? 'replace' : 'multiple',
  membersOnly,
  notifyOnSubmission: params.has('notifySubmission'),
  reward: params.has('reward')
    ? { points: params.has('unlimited') ? 50 : 20, maxRecipients: params.has('unlimited') ? null : 100 }
    : null,
  title: params.get('formTitle') || '轻笺体验反馈',
  description: '帮助我们把轻笺做得更好。请分享你的真实体验，所有回答仅收集者可见。',
  successMessage: '谢谢，你的建议我们已经收到。',
  questions: [
    {
      id: 'q1',
      title: params.has('other') ? '你最早是从哪里了解到轻笺的？' : '你最常使用哪些模块？',
      type: params.get('other') === 'single' ? 'single' : 'multiple',
      allowOther: params.has('other') ? true : undefined,
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
if (params.has('other'))
  definition.questions = [
    {
      ...definition.questions[0],
      options: [
        { id: 'a', label: '搜索引擎（百度、必应、Google 等）' },
        { id: 'b', label: '小红书 / 哔哩哔哩（B 站）' },
        { id: 'c', label: '朋友、同事或同学推荐' },
        { id: 'd', label: '记不清了' },
      ],
    },
  ];
const forms: any[] = [
  {
    id: 'sample',
    title: definition.title,
    definition,
    tagIds: ['tag'],
    version: 1,
    published: state === 'draft' ? 0 : 1,
    public_id: 'a'.repeat(48),
    status: state === 'draft' ? 'draft' : state === 'full' ? 'paused' : 'collecting',
    rewardSummary: params.has('reward')
      ? {
          recipients: state === 'full' ? 100 : state === 'draft' ? 0 : 38,
          totalPoints: (state === 'full' ? 100 : state === 'draft' ? 0 : 38) * (definition.reward?.points || 0),
        }
      : undefined,
    total: ['draft', 'emptyResponses'].includes(state) ? 0 : 38,
    unread: ['draft', 'emptyResponses'].includes(state) ? 0 : 3,
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
  ...(membersOnly
    ? {
        respondent_user_id: account?.id || 'fixture-participant',
        respondent_alias: '轻笺体验用户',
        reward_points: definition.reward?.points || 0,
      }
    : {}),
  answers: params.has('other')
    ? ({
        q1: { optionIds: params.get('other') === 'single' ? [] : ['a'], otherText: '朋友推荐，来自一篇工具分享文章。' },
      } as FormAnswers)
    : { q1: ['a', 'b'], q2: 5, q3: '希望移动端的整理操作更方便一些。', q4: 7, q5: '2026-09-30' },
}));
const seenRequests: string[] = [];
const signupSurveyInvitation = { type: 'signup_source_survey', meta: { points: definition.reward?.points || 50 } };
const notices: NotificationItem[] = params.has('notifications')
  ? [
      {
        id: 'survey-invitation',
        type: 'system',
        title: '填写调研，获得 20 积分',
        content: '请分享你从哪个渠道了解到轻笺，提交后奖励自动到账。',
        link: `${location.origin}/f/${forms[0].public_id}?channel=notification#survey`,
        meta: {},
        isRead: 0,
        createTime: new Date().toISOString(),
        ...(params.has('unlimited')
          ? { ...signupSurveyInvitation, ...notificationPresentation(signupSurveyInvitation) }
          : {}),
      },
    ]
  : [];
if (params.has('submissionNotice')) {
  const notice = { type: 'collection_form_submission', meta: { formTitle: definition.title } };
  notices.splice(0, notices.length, {
    ...notice,
    ...notificationPresentation(notice),
    id: 'form-submission-notice',
    link: `${location.origin}/toolbox/forms/sample?view=responses&notice=r0`,
    isRead: 0,
    createTime: new Date().toISOString(),
  });
}
request.defaults.adapter = async (config) => {
  const feedbackPath = params.get('feedbackPath');
  if (
    feedbackPath &&
    String(config.url).includes(feedbackPath) &&
    (!params.get('feedbackMethod') || config.method === params.get('feedbackMethod'))
  ) {
    const feedback = ((window as any).toolboxFeedbackFixture ||= {
      failure: params.has('feedbackFailure'),
      delay: Number(params.get('feedbackDelay') || 0),
      empty: params.has('feedbackEmpty'),
    });
    if (feedback.delay) await new Promise((resolve) => setTimeout(resolve, feedback.delay));
    if (feedback.failure) throw new Error('无法完成请求，请重试 / Unable to complete the request. Try again.');
    if (feedback.empty && String(config.url).endsWith('/text-answers'))
      return {
        data: { status: 200, data: [], msg: '' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
  }

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
  if (url.includes('/notification/')) {
    if (url.endsWith('/markRead')) for (const n of notices) if (body.ids?.includes(n.id)) n.isRead = 1;
    if (url.endsWith('/markAllRead')) for (const n of notices) n.isRead = 1;
    if (url.endsWith('/delete'))
      for (const id of body.ids || []) {
        const index = notices.findIndex((n) => n.id === id);
        if (index >= 0) notices.splice(index, 1);
      }
    const unreadTotal = notices.filter((n) => !n.isRead).length;
    const byType: Record<string, number> = {};
    for (const n of notices) if (!n.isRead) byType[n.type] = (byType[n.type] || 0) + 1;
    const visible = notices.filter((n) =>
      !body.type || body.type === 'all'
        ? true
        : body.type === 'growth'
          ? ['level_up', 'streak_risk', 'collection_form_reward'].includes(n.type)
          : ['system', 'system_group'].includes(body.type)
            ? ['system', 'collection_form_submission', 'signup_source_survey'].includes(n.type)
            : n.type === body.type,
    );
    data = url.endsWith('/list')
      ? { items: visible, total: visible.length, unreadTotal, currentPage: 1, pageSize: 20 }
      : { unreadTotal, byType };
  } else if (url.endsWith('/tags')) data = [{ id: 'tag', name: '产品反馈' }];
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
        choices: [
          ...q.options.map((o, i) => ({ option_id: o.id, count: [30, 24, 12, 8][i] })),
          ...(q.allowOther ? [{ option_id: OTHER_OPTION_ID, count: 6 }] : []),
        ],
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
    const matches = ['draft', 'emptyResponses'].includes(state)
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
let rewardReceived = params.has('submitted');
window.fetch = async (_input, init) => {
  if (state === 'error') throw new Error('模拟网络异常，可刷新重试');
  if (state === 'loading') await new Promise(() => {});
  let data: any;
  if (init?.method === 'POST') {
    const outcome = mySubmission ? 'updated' : 'created';
    mySubmission = { receipt: 'test', answers: validateAnswers(definition, JSON.parse(String(init.body)).answers) };
    if (params.has('notifications') && definition.reward && !rewardReceived) {
      const notice = {
        type: 'collection_form_reward',
        meta: { formTitle: definition.title, points: definition.reward.points },
      };
      notices.unshift({
        ...notice,
        ...notificationPresentation(notice),
        id: 'survey-reward',
        link: '/growth?section=rewards&reward=ledger',
        isRead: 0,
        createTime: new Date().toISOString(),
      });
    }
    rewardReceived = Boolean(definition.reward);
    data = {
      receipt: 'test',
      outcome,
      ...(definition.reward ? { reward: { points: definition.reward.points, received: true } } : {}),
    };
  } else
    data = {
      status: state === 'full' ? 'paused' : ['paused', 'ended'].includes(state) ? state : 'collecting',
      definition,
      submissionPolicy: definition.submissionPolicy,
      mySubmission: definition.submissionPolicy === 'replace' ? mySubmission : null,
      ...(membersOnly
        ? {
            requiresLogin: !account,
            account,
            reward: definition.reward
              ? {
                  points: definition.reward.points,
                  received: rewardReceived,
                  remaining: params.has('unlimited') ? null : state === 'full' ? 0 : 62,
                }
              : null,
          }
        : {}),
    };
  return new Response(JSON.stringify({ status: 200, data }), { headers: { 'Content-Type': 'application/json' } });
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/workbenches',
      name: 'workbenches',
      component: {
        render: () =>
          h('main', { 'data-returned-workbench': true }, locale === 'en-US' ? 'Light Note workspace' : '轻笺工作台'),
      },
    },
    { path: '/notifications', name: 'notifications', component: NotificationBell, props: { page: true } },
    { path: '/growth', component: { render: () => h('main', { 'data-ledger': true }, '积分明细') } },
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
    role: params.get('role') === 'root' ? 'root' : 'user',
    alias: '验收账号',
    preferences: { theme, lang: locale, noteViewMode: 'card' },
  });
bookmarkStore(pinia).screenWidth = window.innerWidth;
await router.push(
  params.has('notifications') || params.has('submissionNotice')
    ? '/notifications'
    : params.get('public')
      ? '/f/' + forms[0].public_id
      : params.get('list')
        ? '/toolbox/forms'
        : '/toolbox/forms/sample',
);
Object.assign(window, { collectionFixture: { router, notices } });
await router.isReady();
app.mount('#app');
