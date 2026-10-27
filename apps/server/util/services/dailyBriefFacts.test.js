import { beforeEach, expect, it, vi } from 'vitest';
import { compileDailyBriefFacts, compileBriefActivityFacts, compileBriefOnboardingFact } from './dailyBriefFacts.js';
import { adviceContext } from './dailyBriefAdvice.js';
import { dailyBriefServiceInternals } from './dailyBriefService.js';
import { briefSnapshot } from './dailyBriefFreshness.js';

const sources = vi.hoisted(() => ({
  todos: vi.fn(),
  review: vi.fn(),
  inbox: vi.fn(),
  untagged: vi.fn(),
  workshop: vi.fn(),
  materials: vi.fn(),
  extractionReady: vi.fn(),
}));
vi.mock('./dailyBriefTodoFacts.js', () => ({ compileBriefTodoFacts: sources.todos }));
vi.mock('./organizeReviewSummary.js', () => ({ summarizePendingOrganizeReview: sources.review }));
vi.mock('../resourceInbox.js', () => ({ listInboxResources: sources.inbox }));
vi.mock('./resourceInventoryService.js', () => ({ summarizeUntaggedResources: sources.untagged }));
vi.mock('./dailyBriefWorkshop.js', () => ({ compileWorkshopBriefFacts: sources.workshop }));
vi.mock('../aiSkill/resourceEvidence.js', () => ({ loadPreparedResourceExcerpts: sources.materials }));
vi.mock('../extraction/schema.js', async (importOriginal) => ({
  ...(await importOriginal()),
  extractionSchemaReady: sources.extractionReady,
}));

const database = () => ({ query: vi.fn().mockResolvedValue([[{ total: 0 }]]) });
const calendar = {
  date: '2026-10-22',
  yesterdayStart: '2026-10-21 00:00:00',
  todayEnd: '2026-10-23 00:00:00',
  locale: 'zh-CN',
};
beforeEach(() => {
  vi.clearAllMocks();
  sources.todos.mockResolvedValue([{ id: 'todo_due_today', count: 0, entries: [] }]);
  sources.review.mockResolvedValue({
    total: 3,
    revision: 'current:oct16:3',
    resourceTypes: ['bookmark', 'note'],
    kinds: ['tags', 'title'],
    route: '/organize?issue=ai_suggestions&review=pending&runId=oct16&resourceType=bookmark',
  });
  sources.inbox.mockResolvedValue({
    total: 4,
    items: [
      { resourceId: 'note-a', resourceType: 'note', title: '简报优化', detail: '不应被扩写的资料正文' },
      { resourceId: 'file-b', resourceType: 'file', title: '方案截图.png' },
    ],
  });
  sources.untagged.mockResolvedValue({ total: 510, revision: 'untagged-revision' });
  sources.workshop.mockResolvedValue([]);
  sources.materials.mockResolvedValue([]);
  sources.extractionReady.mockResolvedValue(false);
});

it('从真实读模型接入所有整理来源；十月十六日的有效建议仍可出现在二十二日简报', async () => {
  const db = database();
  const facts = await compileDailyBriefFacts(db, 'owner', calendar);
  expect(sources.inbox).toHaveBeenCalledWith(db, {
    userId: 'owner',
    limit: 2,
    view: 'summary',
    includeCounts: false,
    excludeOnboardingSeeds: true,
  });
  expect(sources.untagged).toHaveBeenCalledWith(db, { userId: 'owner', excludeOnboardingSeeds: true });
  expect(sources.review).toHaveBeenCalledWith(db, 'owner', { excludeOnboardingSeeds: true });
  const brief = dailyBriefServiceInternals.buildBrief(calendar, facts);
  expect(brief.insights.map((item) => item.text)).toEqual([
    '有 3 条 AI 整理建议待审核。涉及书签和笔记，包括标签和标题建议。 4 项资料待整理；510 项资源尚无标签。最近收集的有笔记《简报优化》、文件《方案截图.png》。',
  ]);
  const organize = brief.sections.find((section) => section.id === 'organize');
  expect(organize.items.map(({ id, count }) => ({ id, count }))).toEqual([
    { id: 'organize_ai_pending', count: 3 },
    { id: 'organize_pending', count: 4 },
    { id: 'organize_untagged', count: 510 },
  ]);
  expect(organize.items[0].route).toContain('runId=oct16');
  expect(JSON.stringify(brief)).not.toContain('不应被扩写');
});

it('同数量下更名或替换代表资料也更新快照，缺少有效对象时不编造背景', async () => {
  const first = await compileDailyBriefFacts(database(), 'owner', calendar);
  sources.inbox.mockResolvedValue({ total: 4, items: [{ resourceId: 'new', resourceType: 'note', title: '新资料' }] });
  const changed = await compileDailyBriefFacts(database(), 'owner', calendar);
  expect(briefSnapshot(first, calendar).fingerprint).not.toBe(briefSnapshot(changed, calendar).fingerprint);
  sources.inbox.mockResolvedValue({ total: 4, items: [{ resourceType: 'unknown', title: '不能使用' }] });
  const withoutExamples = dailyBriefServiceInternals.buildBrief(
    calendar,
    await compileDailyBriefFacts(database(), 'owner', calendar),
  );
  expect(withoutExamples.insights.at(-1).text).toBe(
    '有 3 条 AI 整理建议待审核。涉及书签和笔记，包括标签和标题建议。 4 项资料待整理；510 项资源尚无标签。',
  );
});

it('所有待处理来源为空时保持安静，查询失败不能伪装成没有待处理事项', async () => {
  sources.review.mockResolvedValue({ total: 0, revision: 'none' });
  sources.inbox.mockResolvedValue({ total: 0, items: [] });
  sources.untagged.mockResolvedValue({ total: 0, revision: 'none' });
  const brief = dailyBriefServiceInternals.buildBrief(
    calendar,
    await compileDailyBriefFacts(database(), 'owner', calendar),
  );
  expect(brief.insights).toEqual([]);
  sources.inbox.mockRejectedValue(new Error('inbox unavailable'));
  await expect(compileDailyBriefFacts(database(), 'owner', calendar)).rejects.toThrow('inbox unavailable');
});

it('行动建议编译不读取资料正文，详情读取器不可用也不影响工作台事实', async () => {
  sources.materials.mockRejectedValue(new Error('must not read content'));
  const facts = await compileDailyBriefFacts(database(), 'owner', calendar);
  expect(sources.materials).not.toHaveBeenCalled();
  expect(facts.some((fact) => fact.id === 'organize_pending' && fact.count === 4)).toBe(true);
  expect(JSON.stringify(facts)).not.toContain('不应被扩写');
});

const emptyInventory = ['bookmark', 'note', 'file'].map((type) => ({
  id: `${type}_created_today`,
  count: 0,
  inventoryEmpty: true,
}));
it('今日零新增与库存全空分别核实；其他账号的资料不影响本账号', async () => {
  const db = { query: vi.fn().mockResolvedValue([[{ total: 0, hasResources: 1 }]]) };
  const facts = await compileBriefActivityFacts(db, 'owner', calendar);
  expect(facts.every((fact) => fact.count === 0 && fact.inventoryEmpty === false)).toBe(true);
  expect(db.query.mock.calls.every(([, params]) => params[0] === 'owner' && params[1] === 'owner')).toBe(true);
  expect(await compileBriefOnboardingFact(db, 'owner', facts)).toMatchObject({ count: 0 });
  expect(db.query).toHaveBeenCalledTimes(3);
});
it('全空账号得到固定中英文引导，元信息不进入模型上下文', async () => {
  const db = { query: vi.fn().mockResolvedValue([[{ hasTodos: 0, hasWorkspaces: 0, hasJobs: 0, hasExtractions: 0 }]]) };
  const onboarding = await compileBriefOnboardingFact(db, 'owner', emptyInventory);
  expect(onboarding).toEqual({ id: 'onboarding_empty', count: 1 });
  const facts = [...emptyInventory, onboarding];
  const brief = dailyBriefServiceInternals.buildBrief(calendar, facts);
  expect(brief).toMatchObject({
    generatedBy: 'facts',
    recommendationKind: 'action',
    adviceStatus: 'ready',
    recommendationFactIds: ['onboarding_empty'],
  });
  expect(brief.recommendation).toContain('先收集一份资料');
  expect(dailyBriefServiceInternals.buildBrief({ ...calendar, locale: 'en-US' }, facts).recommendation).toContain(
    'Start by collecting',
  );
  expect(adviceContext(facts, 'zh-CN')).toEqual({ signals: [], key: '' });
});
it.each(['hasTodos', 'hasWorkspaces', 'hasJobs', 'hasExtractions'])(
  '有历史或未来记录时不当成全空账号：%s',
  async (key) => {
    sources.extractionReady.mockResolvedValue(true);
    const db = {
      query: vi.fn().mockResolvedValue([[{ hasTodos: 0, hasWorkspaces: 0, hasJobs: 0, hasExtractions: 0, [key]: 1 }]]),
    };
    expect(await compileBriefOnboardingFact(db, 'owner', emptyInventory)).toMatchObject({ count: 0 });
    expect(db.query.mock.calls[0][1]).toEqual(['owner', 'owner', 'owner', 'owner']);
  },
);
it('未知库存和读取失败不伪装成全空；已有明确事项时不额外查询', async () => {
  const db = { query: vi.fn().mockResolvedValue([[{}]]) };
  expect(
    await compileBriefOnboardingFact(
      db,
      'owner',
      emptyInventory.map((fact) => ({ ...fact, inventoryEmpty: null })),
    ),
  ).toMatchObject({ count: 0 });
  expect(await compileBriefOnboardingFact(db, 'owner', emptyInventory, [{ count: 1 }])).toMatchObject({ count: 0 });
  expect(db.query).not.toHaveBeenCalled();
  expect(await compileBriefOnboardingFact(db, 'owner', emptyInventory)).toMatchObject({ count: 0 });
  db.query.mockRejectedValue(new Error('presence unavailable'));
  await expect(compileBriefOnboardingFact(db, 'owner', emptyInventory)).rejects.toThrow('presence unavailable');
});
