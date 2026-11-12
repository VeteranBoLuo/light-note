// In-memory fixture. The adapter intercepts every business request before transport.
import { createApp, h, KeepAlive } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import CoBuildPage from '@/view/coBuild/CoBuildPage.vue';
import CoBuildDetail from '@/view/coBuild/CoBuildDetail.vue';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import globalDirect from '@/config/globalDirect';
import request from '@/http/request';
import type { FeatureRequestDetail, FeatureRequestProgressStatus } from '@/api/featureRequestApi';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// Reload the isolated app before HMR can replace its intercepted HTTP singleton.
import.meta.hot?.on('vite:beforeUpdate', () => location.reload());

const params = new URLSearchParams(location.search);
const role = params.get('role') === 'visitor' ? 'visitor' : params.get('role') === 'user' ? 'user' : 'root';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const state = params.get('state') || 'default';
const account = 'co-build-fixture';
const specs = [
  [
    '移动端增加知识库入口',
    '希望在手机端也能快速找到知识库，减少来回查找入口。',
    'experience',
    'user',
    'evaluating',
    12,
  ],
  ['笔记编辑器支持更清晰的目录导航', '长文笔记可在编辑时快速定位章节。', 'note', 'official', 'in_progress', 8],
  [
    '书签支持批量修改标签',
    '整理收藏时，希望一次给多条书签添加或移除标签。\n\n目前需要逐条打开书签修改标签，集中整理时操作比较重复。\n\n希望批量处理时能看清影响范围，并保留已有标签。',
    'bookmark',
    'user',
    'planned',
    21,
  ],
  [
    '云空间上传后提供更明确的完成反馈',
    '上传结束后保留结果提示，并提供文件定位入口。',
    'cloud',
    'official',
    'released',
    16,
  ],
  ['AI助手回答时显示引用位置', '方便回到相关笔记核对原文。', 'ai', 'user', 'evaluating', 9],
  ['支持自定义全部页面配色', '希望按个人习惯设置页面颜色。', 'experience', 'user', 'declined', 3],
] as const;
let entries: FeatureRequestDetail[] = specs.map((item, index) => ({
  id: String(index + 1),
  title: item[0],
  content: item[1],
  category: item[2],
  sourceType: item[3],
  progressStatus: item[4],
  voteCount: item[5],
  moderationStatus: 'published',
  showIdentity: false,
  viewerVoted: index === 0,
  viewerIsOwner: index === 2,
  submitterAlias: '',
  createTime: '2026-11-02 10:00:00',
  updateTime: `2026-11-0${6 - index} 10:00:00`,
  developerReply:
    index === 1
      ? '目录与正文定位方案正在完善，会保留现有编辑习惯。'
      : index === 2
        ? '已纳入后续计划，优先梳理批量操作范围。'
        : index === 5
          ? '目前先统一主题与资源色，暂不开放逐页自定义。'
          : '',
  releaseUrl: index === 3 ? '/release-notes' : '',
  updates: [
    {
      id: `submitted-${index}`,
      type: 'submitted',
      actorType: 'submitter',
      content: '建议已提交，等待审核',
      createTime: '2026-11-02 10:00:00',
    },
    {
      id: `review-${index}`,
      type: 'moderation',
      actorType: 'developer',
      toStatus: 'published',
      createTime: '2026-11-03 10:00:00',
    },
  ],
}));
for (const entry of entries) {
  if (entry.developerReply)
    entry.updates.push({
      id: `reply-${entry.id}`,
      type: 'developer_reply',
      actorType: 'developer',
      content: entry.developerReply,
      createTime: '2026-11-04 10:00:00',
    });
  entry.updates.push({
    id: `progress-${entry.id}`,
    type: 'status_change',
    actorType: 'developer',
    toStatus: entry.progressStatus,
    createTime: '2026-11-04 11:00:00',
  });
}
if (state === 'long') {
  entries[0].title =
    '希望在手机端、平板和桌面连续整理资料时，能够保留当前分类、筛选条件与阅读位置，返回列表后继续处理尚未完成的内容';
  entries[0].content = 'LongUnbrokenTitleAndLink'.repeat(20);
  entries[0].developerReply = '需要兼顾长标题、多个标签与较长的开发者答复。'.repeat(8);
}
if (state === 'few') entries = entries.slice(0, 1);
if (state === 'empty') entries = [];
const privateEntry: FeatureRequestDetail = {
  id: 'pending',
  title: '等待审核的本人建议',
  content: '希望更方便地补充一个具体的使用场景，待审核内容不会进入公开列表。',
  category: 'experience',
  sourceType: 'user',
  moderationStatus: 'pending_review',
  progressStatus: 'evaluating',
  viewerIsOwner: true,
  viewerVoted: false,
  showIdentity: false,
  voteCount: 0,
  createTime: '2026-11-06 11:00:00',
  updateTime: '2026-11-06 11:00:00',
  updates: [],
};
const privateEntries = state === 'empty' ? [] : [privateEntry];
let failNext = state === 'error';
let sequence = 100;
request.defaults.adapter = async (config) => {
  const url = config.url || '';
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let status = 200;
  let data: unknown = {};
  const target = [...entries, ...privateEntries].find((entry) => entry.id === body.id);
  const summary = () =>
    Object.fromEntries(
      ['evaluating', 'planned', 'in_progress', 'released', 'declined'].map((key) => [
        key,
        entries.filter((entry) => entry.moderationStatus === 'published' && entry.progressStatus === key).length,
      ]),
    );
  if (url.includes('/featureRequest/')) {
    if (params.has('slow')) await new Promise((resolve) => setTimeout(resolve, 700));
    if (failNext && (url.endsWith('/listPublic') || url.endsWith('/getPublicDetail'))) {
      failNext = false;
      status = 500;
    } else if (url.endsWith('/listPublic') || url.endsWith('/listMine') || url.endsWith('/admin/list')) {
      let rows = url.endsWith('/listPublic')
        ? entries.filter((entry) => entry.moderationStatus === 'published')
        : url.endsWith('/listMine')
          ? [...entries, ...privateEntries].filter((entry) => entry.viewerIsOwner)
          : [...entries, ...privateEntries];
      const filters = body.filters || {};
      rows = rows.filter(
        (entry) =>
          (!filters.keyword || `${entry.title} ${entry.content}`.includes(filters.keyword)) &&
          (!filters.category || filters.category === entry.category) &&
          (!filters.progressStatus || filters.progressStatus === entry.progressStatus) &&
          (!filters.moderationStatus || filters.moderationStatus === entry.moderationStatus),
      );
      if (filters.sort === 'popular') rows.sort((a, b) => b.voteCount - a.voteCount);
      const offset = ((body.currentPage || 1) - 1) * (body.pageSize || 12);
      data = {
        items: rows.slice(offset, offset + (body.pageSize || 12)),
        total: rows.length,
        currentPage: body.currentPage || 1,
        pageSize: body.pageSize || 12,
        summary: summary(),
      };
    } else if (url.endsWith('/getPublicDetail')) {
      if (
        !target ||
        (role !== 'root' && !target.viewerIsOwner && !['published', 'merged'].includes(target.moderationStatus))
      )
        status = 404;
      else data = target;
    } else if (url.endsWith('/toggleVote')) {
      if (!target || role === 'visitor' || target.moderationStatus !== 'published') status = 403;
      else {
        target.viewerVoted = !target.viewerVoted;
        target.voteCount += target.viewerVoted ? 1 : -1;
        data = { voted: target.viewerVoted, voteCount: target.voteCount };
      }
    } else if (url.endsWith('/create')) {
      const official = url.includes('/admin/');
      if (role === 'visitor' || (official && role !== 'root')) status = 403;
      else {
        const entry: FeatureRequestDetail = {
          ...privateEntry,
          ...body,
          id: String(++sequence),
          updates: [],
          viewerIsOwner: true,
          sourceType: official ? 'official' : 'user',
          moderationStatus: official ? 'published' : 'pending_review',
        };
        (official ? entries : privateEntries).push(entry);
        data = { id: entry.id };
      }
    } else if (target) {
      if (url.endsWith('/addSubmitterUpdate')) {
        target.updates.push({
          id: String(++sequence),
          type: 'submitter_addition',
          actorType: 'submitter',
          content: body.content,
          createTime: '2026-11-06 12:00:00',
        });
      } else if (role !== 'root') status = 403;
      else if (url.endsWith('/updateStatus')) {
        target.progressStatus = body.progressStatus as FeatureRequestProgressStatus;
        target.releaseUrl = body.releaseUrl;
        target.updates.push({
          id: String(++sequence),
          type: 'status_change',
          actorType: 'developer',
          toStatus: body.progressStatus,
          createTime: '2026-11-06 12:00:00',
        });
      } else if (url.endsWith('/reply')) {
        target.developerReply = body.content;
        target.updates.push({
          id: String(++sequence),
          type: 'developer_reply',
          actorType: 'developer',
          content: body.content,
          createTime: '2026-11-06 12:00:00',
        });
      } else if (url.endsWith('/review')) target.moderationStatus = body.moderationStatus;
      else if (url.endsWith('/edit')) Object.assign(target, body, { id: target.id });
      else if (url.endsWith('/deleteUpdate'))
        target.updates = target.updates.filter((update) => update.id !== body.updateId);
      else if (url.endsWith('/merge')) {
        const merged = entries.find((entry) => entry.id === body.targetRequestId);
        if (!merged || merged.id === target.id) status = 400;
        else {
          target.moderationStatus = 'merged';
          target.mergedTo = { id: merged.id, title: merged.title };
        }
      }
    }
  }
  return {
    data: { status, data: JSON.parse(JSON.stringify(data)), msg: status === 200 ? '' : '隔离验收中的模拟错误' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  };
};

const pinia = createPinia();
useUserStore(pinia).$patch({ id: role === 'visitor' ? '' : account, role, alias: '隔离验收' });
const bookmark = bookmarkStore(pinia);
function syncViewport() {
  bookmark.screenWidth = innerWidth;
  applyUiDensity(params.get('density'), !bookmark.isDesktop);
  document.documentElement.classList.toggle(
    'light-note-mobile-rendering',
    params.get('renderProfile') === 'mobile' || !bookmark.isDesktop,
  );
}
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
syncViewport();
window.addEventListener('resize', syncViewport);
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/co-build', name: 'coBuild', component: CoBuildPage, meta: { keepAlive: true } },
    { path: '/co-build/:id', name: 'coBuildDetail', component: CoBuildDetail },
    { path: '/release-notes', component: { render: () => h('p', '隔离验收更新说明') } },
  ],
});
const app = createApp({
  render: () =>
    h('div', { class: 'co-build-fixture' }, [
      h(
        'p',
        { class: 'co-build-fixture-notice' },
        `共建轻笺隔离验收 · ${role} · ${state} · 所有数据与写入仅保存在内存`,
      ),
      h(
        'div',
        { class: 'co-build-fixture-page' },
        h(RouterView, null, {
          default: ({ Component }: { Component: unknown }) =>
            h(KeepAlive, { include: ['CoBuildPage'] }, { default: () => h(Component as Parameters<typeof h>[0]) }),
        }),
      ),
    ]),
});
app.use(pinia);
app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
globalDirect(app);
await router.push(params.get('view') === 'detail' ? `/co-build/${params.get('id') || '3'}` : '/co-build');
await router.isReady();
app.mount('#app');
