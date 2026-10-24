import { createApp, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { bookmarkStore, useUserStore } from '@/store';
import { usePublicResourceScope } from '@/store/publicResourceScope';
import { useMobileGlobalSearch } from '@/composables/useMobileGlobalSearch';
import { applyUiDensity } from '@/composables/useUiDensity';
import '@/assets/css/index.less';

// Local, disposable fixture: every API request is intercepted, with no real accounts or writes.
const params = new URLSearchParams(location.search);
const surface = params.get('surface') || 'search';
const english = params.get('locale') === 'en-US';
const aiEnabled = params.get('ai') === 'on';
const pinia = createPinia();
setActivePinia(pinia);
const user = useUserStore(pinia);
user.id = 'public-resource-fixture';
user.role = surface === 'moderation' ? 'root' : 'user';
const bookmark = bookmarkStore(pinia);
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
function syncFixtureViewport() {
  bookmark.screenWidth = innerWidth;
  applyUiDensity(params.get('density') || 'medium', innerWidth < 1000);
}
syncFixtureViewport();
window.addEventListener('resize', syncFixtureViewport);
const id = '10000000-0000-4000-8000-000000000001';
const title = english ? 'A practical guide to personal knowledge management' : '如何搭建适合自己的知识管理系统';
const body = english
  ? 'Start with a small inbox and review it regularly.\n\nKeep the source and your own observations together. A public revision is independent of your private draft.\n\nReview useful notes each week and connect related ideas.'
  : '先建立一个轻量收集箱，定期整理输入的信息。\n\n将资料来源与自己的思考放在一起，形成可复用的文字笔记。公开版本独立于私人原稿，修改原稿后需要重新提交。\n\n每周回顾值得保留的笔记，并建立相关主题之间的联系。';
const now = '2026-10-21T09:30:00.000Z';
const ai = {
  decision: 'pass',
  categories: [],
  reason: english ? 'No obvious issues found in this submission.' : '本次提交未发现明显风险，建议通过。',
  evidence: [],
};
const material = {
  kind: 'note',
  title,
  body:
    params.get('state') === 'long' || params.get('content') === 'long'
      ? (body + '\n\n').repeat(Math.ceil(30000 / body.length)).slice(0, 30000)
      : body,
  url: '',
  description: '',
};
const resource = {
  ...material,
  origin: 'public',
  publicId: id,
  summary: body,
  author: { publicId: 'author-public-id', name: english ? 'River' : '林间', communityId: 'LN88888' },
  publishedAt: now,
  revision: 1,
  version: 2,
};
const revision = {
  ...material,
  revision: 1,
  status: 'approved',
  reason: '',
  createdAt: now,
  aiStatus: aiEnabled ? 'done' : 'hold',
  ai: aiEnabled ? ai : null,
  aiPolicy: 'public-resource-v1',
  aiFinishedAt: now,
};
let ownItems = ['published', 'pending_review', 'rejected', 'withdrawn', 'removed'].map((status, index) => ({
  publicId: index ? `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` : id,
  kind: index % 2 ? 'bookmark' : 'note',
  sourceId: 'source-' + index,
  title: index ? `${title} ${index + 1}` : title,
  version: 2,
  status,
  oldVersionPublic: status === 'pending_review' || status === 'rejected',
  hasUnpublishedChanges: index === 0,
  sourceUnavailable: false,
  reason:
    status === 'rejected'
      ? english
        ? 'Please remove personal contact information.'
        : '请移除内容中的私人联系方式。'
      : status === 'removed'
        ? english
          ? 'Please verify the source of this content.'
          : '请核实内容来源。'
        : '',
  createdAt: now,
  updatedAt: now,
  publishedAt: now,
  pendingRevision: status === 'pending_review' ? 2 : null,
  publishedRevision: status === 'withdrawn' || status === 'removed' ? null : 1,
  latestRevision: status === 'pending_review' || status === 'rejected' ? 2 : 1,
  aiStatus: aiEnabled ? 'done' : 'hold',
  aiCompleted: aiEnabled,
}));
if (params.get('state') === 'orphan')
  Object.assign(ownItems[0], {
    status: 'withdrawn',
    sourceUnavailable: true,
    publishedRevision: null,
    pendingRevision: null,
    oldVersionPublic: false,
  });
const personal = ['bookmark', 'note', 'file'].flatMap((type) =>
  Array.from({ length: 8 }, (_, i) => ({
    id: `${type}-${i}`,
    origin: 'personal',
    type,
    title: english
      ? `Knowledge ${type} ${i + 1}`
      : `知识 ${type === 'note' ? '笔记' : type === 'bookmark' ? '书签' : '文件'} ${i + 1}`,
    description: english ? 'Your own saved resource.' : '我的私人资料与整理记录。',
    raw: { update_time: '2026-10-21 17:30:00' },
    tags: [{ id: 'tag-private', name: english ? 'Knowledge' : '知识管理' }],
  })),
);
const publicRows = ['bookmark', 'note'].flatMap((type) =>
  Array.from({ length: 5 }, (_, i) => ({
    ...personal[0],
    id: `${type === 'bookmark' ? '20000000' : '30000000'}-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    type,
    origin: 'public',
    title: i ? `${title} ${i + 1}` : title,
    description: body,
    tags: [],
    raw: undefined,
    publicResource: {
      ...resource,
      publicId: `${type === 'bookmark' ? '20000000' : '30000000'}-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      kind: type,
      title: i ? `${title} ${i + 1}` : title,
    },
  })),
);
const candidates = Array.from(
  { length: params.get('selection') === 'thousand' ? 1005 : params.get('selection') === 'large' ? 120 : 26 },
  (_, index) => ({
    sourceId: 'source-' + index,
    kind: index % 2 ? 'bookmark' : 'note',
    title: index ? `${title} ${index + 1}` : title,
  }),
);
if (params.get('history') === 'unsupported') ownItems[0].sourceUnavailable = true;
const moderationItems = Array.from({ length: 42 }, (_, index) => ({
  publicId: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  kind: index % 2 ? 'bookmark' : 'note',
  title: index ? `${title} ${index + 1}` : title,
  version: 2,
  revision: 2,
  authorName: resource.author.name,
  createdAt: now,
  isUpdate: true,
  aiStatus: aiEnabled ? 'done' : 'hold',
  ai: aiEnabled ? ai : null,
  reviewState: 'pending',
}));
const receipts = new Map<string, unknown>();
const receiptLookups = new Map<string, number>();
const conflicted = new Set<string>();
const batchScenario = params.get('batch') || '';
const unsupportedSources = new Set(params.get('unsupported') === 'on' ? ['source-6', 'source-7', 'source-8'] : []);
let delayedReceipt = '';
let reportTransition = '';
const requests: string[] = [];
request.defaults.adapter = async (config) => {
  const path = String(config.url).replace(/^.*\/api\//, '');
  requests.push(path);
  document.documentElement.dataset.fixtureRequests = requests.join(',');
  const input = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  const query = { ...config.params, ...input };
  let data: any = [];
  let status = 200;
  let code = '';
  const finish = () => ({
    data: { status, data: code ? { code } : data, msg: status === 200 ? '' : 'Fixture unavailable' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
  if (input.requestId && receipts.has(input.requestId)) {
    data = receipts.get(input.requestId);
    return finish();
  }
  if (params.get('state') === 'loading') await new Promise((resolve) => setTimeout(resolve, 1500));
  if (path === 'public-resources/capabilities')
    data = {
      enabled: params.get('state') !== 'off',
      submissionsEnabled: params.get('state') !== 'off',
      aiEnabled,
      moderationEnabled: user.role === 'root',
    };
  else if (path.startsWith('public-resources/operations/')) {
    const requestId = path.split('/').pop()!;
    const lookups = (receiptLookups.get(requestId) || 0) + 1;
    receiptLookups.set(requestId, lookups);
    const found = receipts.has(requestId) && (requestId !== delayedReceipt || lookups >= 3);
    data = { found, result: found ? receipts.get(requestId) : null };
  } else if (path === 'public-resources/own/resolve') {
    const wanted = new Set(input.ids);
    const items = ownItems.filter((i) => wanted.has(i.publicId));
    data = { items, unavailableIds: input.ids.filter((key: string) => !items.some((i) => i.publicId === key)) };
  } else if (path === 'public-resources/saved-source') {
    data = {
      source: {
        authorName: resource.author.name,
        authorPublicId: resource.author.publicId,
        url: 'https://boluo66.top/public-resources/' + id,
        revision: 1,
      },
    };
  } else if (path === 'public-resources/workspace') {
    const rows = candidates
      .map((source) => ({
        ...source,
        updatedAt: now,
        sourceUnavailable:
          ownItems.find((i) => i.kind === source.kind && i.sourceId === source.sourceId)?.sourceUnavailable || false,
        publication: ownItems.find((i) => i.kind === source.kind && i.sourceId === source.sourceId) || null,
      }))
      .filter((source) => !source.sourceUnavailable);
    const filtered = (params.get('state') === 'empty' ? [] : rows).filter(
      (i) =>
        (!query.kind || query.kind === 'all' || i.kind === query.kind) &&
        (!query.q || i.title.toLowerCase().includes(query.q.toLowerCase())),
    );
    const totals = Object.fromEntries(
      ['all', 'unpublished', 'published', 'reviewing', 'rejected', 'withdrawn', 'removed'].map((key) => [
        key,
        key === 'all'
          ? filtered.length
          : filtered.filter((i) =>
              key === 'unpublished'
                ? !i.publication
                : key === 'reviewing'
                  ? ['ai_checking', 'pending_review'].includes(i.publication?.status || '')
                  : i.publication?.status === key,
            ).length,
      ]),
    );
    const matching = filtered.filter(
      (i) =>
        !query.status ||
        query.status === 'all' ||
        (query.status === 'unpublished'
          ? !i.publication
          : query.status === 'reviewing'
            ? ['ai_checking', 'pending_review'].includes(i.publication?.status || '')
            : i.publication?.status === query.status),
    );
    const page = Number(query.page) || 1,
      pageSize = Math.min(Number(query.pageSize) || 1000, 1000);
    data = {
      items: matching.slice((page - 1) * pageSize, page * pageSize),
      totals,
      total: matching.length,
      page,
      pageSize,
      hasMore: page * pageSize < matching.length,
    };
  } else if (path === 'public-resources/own') {
    const filtered = (params.get('state') === 'empty' ? [] : ownItems).filter(
      (i) => (query.kind === 'all' || !query.kind || i.kind === query.kind) && (!query.q || i.title.includes(query.q)),
    );
    const totals = Object.fromEntries(
      ['all', 'published', 'reviewing', 'rejected', 'withdrawn', 'removed'].map((key) => [
        key,
        key === 'all'
          ? filtered.length
          : filtered.filter((i) =>
              key === 'reviewing' ? ['ai_checking', 'pending_review'].includes(i.status) : i.status === key,
            ).length,
      ]),
    );
    const items =
      params.get('state') === 'empty'
        ? []
        : filtered.filter(
            (i) =>
              query.status === 'all' ||
              !query.status ||
              (query.status === 'reviewing'
                ? ['ai_checking', 'pending_review'].includes(i.status)
                : i.status === query.status),
          );
    data = { items, totals, total: items.length, page: 1, pageSize: 20, hasMore: false };
  } else if (path.startsWith('public-resources/own/') && config.method === 'get') {
    const item = ownItems.find((i) => i.publicId === path.split('/').pop()) || ownItems[0];
    const contents =
      item.kind === 'bookmark' ? { body: '', url: 'https://example.org/knowledge', description: body } : {};
    data = {
      publicId: item.publicId,
      kind: item.kind,
      version: item.version,
      reason: item.reason,
      revisions: [
        {
          ...revision,
          ...contents,
          title: item.title,
          fingerprint: 'fixture-fingerprint-' + (item.sourceId === 'source-0' ? 'old' : item.sourceId),
        },
        {
          ...revision,
          ...contents,
          title: item.title,
          revision: 2,
          status: item.status,
          body:
            item.kind === 'note'
              ? body + '\n\n' + (english ? 'This is the updated submission.' : '这是本次修改后提交的内容。')
              : '',
        },
      ],
    };
  } else if (path === 'public-resources/candidates') {
    const filtered = (
      params.get('state') === 'empty' ? [] : candidates.filter((i) => !unsupportedSources.has(i.sourceId))
    ).filter(
      (i) =>
        (!query.kind || query.kind === 'all' || i.kind === query.kind) &&
        (!query.q || i.title.toLowerCase().includes(query.q.toLowerCase())),
    );
    const page = Number(query.page) || 1;
    data = {
      items: filtered.slice((page - 1) * 20, page * 20),
      total: filtered.length,
      page,
      pageSize: 20,
      hasMore: page * 20 < filtered.length,
    };
  } else if (path === 'public-resources/preview') {
    const source = candidates.find((i) => i.sourceId === input.sourceId && i.kind === input.kind);
    const publication = ownItems.find((i) => i.sourceId === input.sourceId && i.kind === input.kind);
    if (!source || publication?.sourceUnavailable) {
      status = 404;
      code = 'PUBLIC_RESOURCE_SOURCE_UNAVAILABLE';
    } else if (publication?.status === 'removed') {
      status = 423;
      code = 'PUBLIC_RESOURCE_REMOVED';
    } else if (
      unsupportedSources.has(input.sourceId) ||
      (input.sourceId === 'source-2' && batchScenario === 'partial')
    ) {
      status = 422;
      code = 'PUBLIC_RESOURCE_TEXT_ONLY';
    } else
      data = {
        ...material,
        kind: input.kind,
        title: source.title,
        ...(input.kind === 'bookmark'
          ? { body: '', url: 'https://example.org/knowledge/' + input.sourceId, description: body }
          : {}),
        fingerprint: 'fixture-fingerprint-' + input.sourceId,
        publicationId: publication?.publicId || null,
        expectedVersion: publication?.version || 0,
      };
  } else if (path === 'public-resources/batch/preview') {
    data = {
      items: input.items.map((item: any) => {
        const source = candidates.find((row) => row.kind === item.kind && row.sourceId === item.sourceId);
        const publication = ownItems.find((row) => row.kind === item.kind && row.sourceId === item.sourceId);
        return {
          ...item,
          title: source?.title,
          fingerprint: 'fixture-fingerprint-' + item.sourceId,
          expectedVersion: publication?.version || 0,
          code: !source
            ? 'PUBLIC_RESOURCE_SOURCE_UNAVAILABLE'
            : unsupportedSources.has(item.sourceId) || (batchScenario === 'partial' && item.sourceId === 'source-2')
              ? 'PUBLIC_RESOURCE_TEXT_ONLY'
              : publication?.status === 'removed'
                ? 'PUBLIC_RESOURCE_REMOVED'
                : '',
        };
      }),
    };
  } else if (path === 'public-resources/batch' || path === 'public-resources/moderation/batch') {
    const outcomes: any[] = [];
    for (const item of input.items) {
      if (receipts.has(item.requestId)) {
        outcomes.push({ requestId: item.requestId, state: 'success', result: receipts.get(item.requestId) });
        continue;
      }
      const publication = ownItems.find((row) =>
        input.action === 'submit'
          ? row.kind === item.kind && row.sourceId === item.sourceId
          : row.publicId === item.publicId,
      );
      if (batchScenario === 'partial' && item.sourceId === 'source-1' && !conflicted.has('submit')) {
        conflicted.add('submit');
        outcomes.push({ requestId: item.requestId, state: 'failed', code: 'PUBLIC_RESOURCE_MATERIAL_CHANGED' });
        continue;
      }
      let result: any;
      if (input.action === 'submit') {
        if (publication && ['published', 'pending_review', 'ai_checking'].includes(publication.status))
          result = { publicId: publication.publicId, version: publication.version, reused: true };
        else {
          const publicId =
            publication?.publicId ||
            `40000000-0000-4000-8000-${String(Number(item.sourceId.split('-')[1]) + 1).padStart(12, '0')}`;
          result = { publicId, version: (publication?.version || 0) + 1 };
          const updated = {
            ...ownItems[0],
            publicId,
            sourceId: item.sourceId,
            kind: item.kind,
            title: candidates.find((row) => row.sourceId === item.sourceId)!.title,
            version: result.version,
            status: aiEnabled ? 'ai_checking' : 'pending_review',
            pendingRevision: (publication?.latestRevision || 0) + 1,
            latestRevision: (publication?.latestRevision || 0) + 1,
            publishedRevision: publication?.publishedRevision || null,
            oldVersionPublic: !!publication?.publishedRevision,
            aiCompleted: false,
            aiStatus: aiEnabled ? 'pending' : 'hold',
            reason: '',
          };
          if (publication) Object.assign(publication, updated);
          else ownItems.push(updated);
        }
      } else if (input.action === 'withdraw') {
        if (!publication) {
          outcomes.push({ requestId: item.requestId, state: 'failed', code: 'PUBLIC_RESOURCE_UNAVAILABLE' });
          continue;
        }
        result = { publicId: publication.publicId, version: publication.version + 1 };
        Object.assign(publication, {
          version: result.version,
          status: 'withdrawn',
          publishedRevision: null,
          pendingRevision: null,
          oldVersionPublic: false,
        });
      } else {
        const target = moderationItems.find((row) => row.publicId === item.publicId);
        if (!target || target.version !== item.expectedVersion || target.reviewState !== 'pending') {
          outcomes.push({ requestId: item.requestId, state: 'failed', code: 'PUBLIC_RESOURCE_VERSION_CONFLICT' });
          continue;
        }
        target.version++;
        target.reviewState = input.action === 'approve' ? 'published' : 'rejected';
        result = { publicId: target.publicId, version: target.version };
      }
      receipts.set(item.requestId, result);
      outcomes.push({ requestId: item.requestId, state: result.reused ? 'reused' : 'success', result });
    }
    data = { items: outcomes };
    if (batchScenario === 'unknown' && !delayedReceipt && input.items[0]) {
      delayedReceipt = input.items[0].requestId;
      status = 503;
      code = 'PUBLIC_RESOURCE_TEMPORARY';
      return finish();
    }
  } else if (path === 'public-resources/submit') {
    const publication = ownItems.find((i) => i.sourceId === input.sourceId && i.kind === input.kind);
    if (batchScenario === 'partial' && input.sourceId === 'source-1' && !conflicted.has('submit')) {
      conflicted.add('submit');
      status = 409;
      code = 'PUBLIC_RESOURCE_MATERIAL_CHANGED';
    } else {
      const publicId =
        publication?.publicId ||
        `40000000-0000-4000-8000-${String(Number(input.sourceId.split('-')[1]) + 1).padStart(12, '0')}`;
      data = { publicId, version: (publication?.version || 0) + 1 };
      if (publication)
        Object.assign(publication, {
          version: data.version,
          status: aiEnabled ? 'ai_checking' : 'pending_review',
          oldVersionPublic: !!publication.publishedRevision,
          pendingRevision: publication.latestRevision + 1,
          latestRevision: publication.latestRevision + 1,
          aiCompleted: false,
          aiStatus: aiEnabled ? 'queued' : 'hold',
        });
      else
        ownItems.push({
          ...ownItems[0],
          publicId,
          sourceId: input.sourceId,
          kind: input.kind,
          title: candidates.find((i) => i.sourceId === input.sourceId)!.title,
          version: data.version,
          status: aiEnabled ? 'ai_checking' : 'pending_review',
          pendingRevision: 1,
          publishedRevision: null,
          latestRevision: 1,
          oldVersionPublic: false,
          aiCompleted: false,
          aiStatus: aiEnabled ? 'queued' : 'hold',
        });
    }
  } else if (path.endsWith('/withdraw')) {
    const publication = ownItems.find((i) => i.publicId === path.split('/')[2]);
    if (batchScenario === 'partial' && publication?.sourceId === 'source-1' && !conflicted.has('withdraw')) {
      conflicted.add('withdraw');
      publication.version++;
      status = 409;
      code = 'PUBLIC_RESOURCE_VERSION_CONFLICT';
    } else if (publication) {
      data = {
        publicId: publication.publicId,
        version: publication.version + 1,
        reused: publication.status === 'withdrawn',
      };
      Object.assign(publication, {
        version: data.version,
        status: 'withdrawn',
        oldVersionPublic: false,
        pendingRevision: null,
        publishedRevision: null,
      });
    } else {
      status = 404;
      code = 'PUBLIC_RESOURCE_UNAVAILABLE';
    }
  } else if (path === 'public-resources/moderation') {
    const rows = (params.get('state') === 'empty' ? [] : moderationItems).filter(
      (row) =>
        row.reviewState === (query.status || 'pending') &&
        (!query.kind || query.kind === 'all' || row.kind === query.kind) &&
        (!query.q || row.title.includes(query.q) || row.authorName.includes(query.q)),
    );
    const page = Number(query.page) || 1,
      pageSize = Number(query.pageSize) || 20;
    data = {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
      hasMore: page * pageSize < rows.length,
    };
  } else if (path.endsWith('/history'))
    data = {
      items: [
        {
          publicId: 'action-1',
          action: 'submit',
          actorName: resource.author.name,
          reason: '',
          version: 2,
          revision: 2,
          createdAt: now,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    };
  else if (path.startsWith('public-resources/moderation/') && config.method === 'get') {
    const item = moderationItems.find((row) => row.publicId === path.split('/').pop()) || moderationItems[0];
    data = {
      publicId: item.publicId,
      kind: item.kind,
      version: item.version,
      removed: false,
      withdrawn: false,
      hasPending: item.reviewState === 'pending',
      authorName: item.authorName,
      reason: '',
      latestRevision: 2,
      publishedRevision: 1,
      revisions: [
        {
          ...revision,
          kind: item.kind,
          title: item.title,
          body: item.kind === 'note' ? material.body : '',
          url: item.kind === 'bookmark' ? 'https://example.org/knowledge' : '',
          description: item.kind === 'bookmark' ? body : '',
        },
        {
          ...revision,
          kind: item.kind,
          title: item.title,
          revision: 2,
          status: item.reviewState === 'pending' ? 'pending_review' : item.reviewState,
          body:
            item.kind === 'note'
              ? material.body + '\n\n' + (english ? 'Additional advice for weekly reviews.' : '补充每周回顾的方法。')
              : '',
          url: item.kind === 'bookmark' ? 'https://example.org/knowledge' : '',
          description: item.kind === 'bookmark' ? body : '',
        },
      ],
      actions: [],
      reports: [],
    };
  } else if (path.endsWith('/decide')) data = { publicId: id, version: 3 };
  else if (path.endsWith('/save')) {
    const found = publicRows.find((row) => row.id === path.split('/').at(-2));
    data = {
      kind: found?.type || (params.get('type') === 'bookmark' ? 'bookmark' : 'note'),
      id: 'saved-copy',
      existing: params.get('state') === 'existing',
      inTrash: params.get('state') === 'trash',
    };
    if (params.get('state') === 'saveError') {
      status = 503;
      code = 'PUBLIC_RESOURCE_TEMPORARY';
    }
  } else if (path.endsWith('/report')) {
    const scenario = params.get('report');
    if (!reportTransition && (scenario === 'changed' || scenario === 'withdrawn')) {
      reportTransition = scenario;
      status = scenario === 'changed' ? 409 : 404;
      code = scenario === 'changed' ? 'PUBLIC_RESOURCE_VERSION_CONFLICT' : 'PUBLIC_RESOURCE_UNAVAILABLE';
    } else if (scenario === 'error') {
      status = 503;
      code = 'PUBLIC_RESOURCE_UNAVAILABLE';
    } else data = { reportId: 'fixture-report' };
  } else if (path.startsWith('search/') || path === 'public-resources/search/combined') {
    const isPublic = path === 'public-resources/search/combined';
    if (params.get('state') === 'error' && isPublic) status = 503;
    let rows = isPublic
      ? ['bookmark', 'note', 'file'].flatMap((type) => [
          ...personal.filter((i) => i.type === type).slice(0, 1),
          ...publicRows.filter((i) => i.type === type).slice(0, 2),
          ...personal.filter((i) => i.type === type).slice(1),
        ])
      : personal;
    rows =
      params.get('state') === 'empty'
        ? []
        : rows.filter(
            (i) =>
              (!query.types?.length || query.types.includes(i.type)) &&
              (!query.keyword || i.title.toLowerCase().includes(query.keyword.toLowerCase())),
          );
    if (query.mode === 'suggest') {
      const counts: Record<string, number> = {};
      rows = rows.filter((i) => {
        counts[i.type] = (counts[i.type] || 0) + 1;
        return counts[i.type] <= (query.suggestLayout === 'compact' ? 3 : query.keyword ? 5 : 3);
      });
      if (query.suggestLayout === 'compact') rows = rows.slice(0, 8);
    }
    const types = ['bookmark', 'note', 'file', 'todo'];
    const typeTotals = Object.fromEntries(types.map((type) => [type, rows.filter((i) => i.type === type).length]));
    data = {
      items: rows,
      groups: types.map((type) => ({ type, items: rows.filter((i) => i.type === type) })),
      total: rows.length,
      typeTotals,
      personalTypeTotals: Object.fromEntries(
        types.map((type) => [type, rows.filter((i) => i.type === type && i.origin === 'personal').length]),
      ),
      personalTotal: rows.filter((i) => i.origin === 'personal').length,
      publicTotal: rows.filter((i) => i.origin === 'public').length,
      hasMore: false,
      nextCursor: null,
      tagOptions: ['知识管理'],
      tagMatches: [],
    };
  } else if (path.startsWith('public-resources/') && config.method === 'get') {
    if (params.get('state') === 'invalid' || reportTransition === 'withdrawn') status = 404;
    else {
      const found = publicRows.find((row) => row.id === path.split('/').pop());
      const kind = found?.type || (surface === 'detail' && params.get('type') === 'bookmark' ? 'bookmark' : 'note');
      data = {
        ...resource,
        publicId: found?.id || id,
        kind,
        ...(kind === 'bookmark' ? { url: 'https://example.org/knowledge', description: body, body: '' } : {}),
        ...(surface === 'detail' && params.get('state') === 'longFields'
          ? { title: title.repeat(6), url: 'https://example.org/' + 'knowledge-'.repeat(40) }
          : {}),
        ...(reportTransition === 'changed'
          ? {
              title: title + (english ? ' (updated)' : '（已更新）'),
              revision: 2,
              version: resource.version + 1,
            }
          : {}),
      };
    }
  }
  // Fail the old feed deliberately: the public moderation partition must still work.
  else if (path.startsWith('community-feed/')) status = 503;
  if (
    params.get('state') === 'error' &&
    !['search', 'quick', 'mobileQuick'].includes(surface) &&
    path.startsWith('public-resources/') &&
    path !== 'public-resources/capabilities'
  )
    status = 503;
  if (input.requestId && status === 200) {
    receipts.set(input.requestId, data);
    if (
      batchScenario === 'unknown' &&
      !delayedReceipt &&
      (path === 'public-resources/submit' || path.endsWith('/withdraw'))
    ) {
      delayedReceipt = input.requestId;
      status = 408;
      code = 'ETIMEDOUT';
    }
  }
  if (code) data = { code };
  return {
    data: { status, data, msg: status === 200 ? '' : 'Fixture unavailable' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  };
};
const [SearchCenter, Publications, PublicResourceDetail, CommunityFeed, GlobalSearch, MobileSearch, SavedSource] =
  await Promise.all([
    import('@/view/search/SearchCenter.vue'),
    import('@/view/search/Publications.vue'),
    import('@/view/search/PublicResourceDetail.vue'),
    import('@/view/community/CommunityFeed.vue'),
    import('@/components/search/GlobalSearch.vue'),
    import('@/components/globalSearch/MobileGlobalSearchOverlay.vue'),
    import('@/components/publicResources/PublicResourceSavedSource.vue'),
  ]);
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/search', name: 'searchCenter', meta: { requireAuth: true }, component: SearchCenter.default },
    {
      path: '/search/publications',
      name: 'publications',
      meta: { requireAuth: true },
      component: Publications.default,
    },
    {
      path: '/fixture/saved-source',
      component: {
        render: () =>
          h('main', { style: 'padding:24px;color:var(--text-color);background:var(--background-color);height:100%' }, [
            h('h2', english ? 'My saved bookmark' : '我保存的书签'),
            h('p', 'https://example.org/knowledge'),
            h('p', english ? 'The original bookmark description remains intact.' : '原有书签说明完整保留。'),
            h(SavedSource.default, { resourceId: 'saved-bookmark' }),
          ]),
      },
    },
    {
      path: '/public-resources/:id',
      name: 'publicResourceDetail',
      meta: { requireAuth: true },
      component: PublicResourceDetail.default,
    },
    {
      path: '/community/moderation',
      name: 'communityModeration',
      component: CommunityFeed.default,
      meta: { feedMode: 'moderation' },
    },
    {
      path: '/home',
      name: 'home',
      meta: { requireAuth: true },
      component: { render: () => h('h1', english ? 'Bookmarks · original page' : '书签 · 来源页面') },
    },
    { path: '/:pathMatch(.*)*', component: { render: () => h('p', 'Fixture destination') } },
  ],
});
await router.push(
  surface === 'savedSource'
    ? '/fixture/saved-source'
    : surface === 'publications'
      ? '/search/publications'
      : surface === 'moderation'
        ? '/community/moderation?tab=publicResources'
        : surface === 'detail'
          ? '/public-resources/' + id
          : params.get('origin') === 'home'
            ? '/home?folder=demo#cards'
            : {
                path: '/search',
                query:
                  params.get('scope') === 'remembered' ? {} : { public: params.get('scope') === 'off' ? '0' : '1' },
              },
);
const app = createApp({
  render: () =>
    surface === 'quick'
      ? h('div', { style: 'height:100%', 'data-fixture-route': router.currentRoute.value.fullPath }, [
          h(RouterView),
          h(GlobalSearch.default),
        ])
      : surface === 'mobileQuick'
        ? h('div', [h(RouterView), h(MobileSearch.default)])
        : h(RouterView),
});
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }))
  .use(globalDirect);
app.mount('#app');
await usePublicResourceScope(pinia).ensure();
if ((surface === 'quick' || surface === 'mobileQuick') && !params.has('scope'))
  usePublicResourceScope(pinia).setIncluded(true);
if (surface === 'mobileQuick') useMobileGlobalSearch().openSearch(english ? 'knowledge' : '知识');
