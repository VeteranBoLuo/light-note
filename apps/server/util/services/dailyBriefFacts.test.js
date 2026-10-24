import { beforeEach, expect, it, vi } from 'vitest';
import { compileDailyBriefFacts } from './dailyBriefFacts.js';
import { dailyBriefServiceInternals } from './dailyBriefService.js';
import { briefSnapshot } from './dailyBriefFreshness.js';

const sources = vi.hoisted(() => ({
  todos: vi.fn(),
  review: vi.fn(),
  inbox: vi.fn(),
  untagged: vi.fn(),
  workshop: vi.fn(),
  materials: vi.fn(),
}));
vi.mock('./dailyBriefTodoFacts.js', () => ({ compileBriefTodoFacts: sources.todos }));
vi.mock('./organizeReviewSummary.js', () => ({ summarizePendingOrganizeReview: sources.review }));
vi.mock('../resourceInbox.js', () => ({ listInboxResources: sources.inbox }));
vi.mock('./resourceInventoryService.js', () => ({ summarizeUntaggedResources: sources.untagged }));
vi.mock('./dailyBriefWorkshop.js', () => ({ compileWorkshopBriefFacts: sources.workshop }));
vi.mock('../aiSkill/resourceEvidence.js', () => ({ loadPreparedResourceExcerpts: sources.materials }));

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
});

it('从真实读模型接入所有整理来源；十月十六日的有效建议仍可出现在二十二日简报', async () => {
  const db = database();
  const facts = await compileDailyBriefFacts(db, 'owner', calendar);
  expect(sources.inbox).toHaveBeenCalledWith(db, {
    userId: 'owner',
    limit: 20,
    view: 'summary',
    includeCounts: false,
  });
  expect(sources.untagged).toHaveBeenCalledWith(db, { userId: 'owner' });
  expect(sources.review).toHaveBeenCalledWith(db, 'owner');
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

it('材料正文读取失败不能变成无可读资料或空建议', async () => {
  sources.materials.mockRejectedValue(new Error('material read failed'));
  await expect(compileDailyBriefFacts(database(), 'owner', calendar)).rejects.toThrow('material read failed');
});
