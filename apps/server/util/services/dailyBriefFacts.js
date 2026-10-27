import { summarizePendingOrganizeReview } from './organizeReviewSummary.js';
import { compileWorkshopBriefFacts } from './dailyBriefWorkshop.js';
import { compileBriefTodoFacts } from './dailyBriefTodoFacts.js';
import { listInboxResources } from '../resourceInbox.js';
import { summarizeUntaggedResources } from './resourceInventoryService.js';

export const DAILY_BRIEF_FACT_DEFINITIONS = Object.freeze([
  ['todo_overdue', '单次待办重点（逾期）', 'One-time task focus (overdue)', '/inbox?tab=todo'],
  ['todo_due_today', '单次待办重点（今天到期）', 'One-time task focus (due today)', '/inbox?tab=todo'],
  ['todo_scheduled_today', '单次待办重点（今天安排）', 'One-time task focus (scheduled today)', '/inbox?tab=todo'],
  ['organize_ai_pending', '待审核的整理建议', 'Organizing suggestions to review', '/organize?issue=ai_suggestions'],
  ['organize_pending', '待整理资料', 'Pending resources', '/organize?issue=pending'],
  ['organize_untagged', '无标签资源', 'Untagged resources', '/organize?issue=untagged'],
]);

// 仅供顶部概览，独立于重点条目的筛选和额度，不把收集数量扩写成洞察。
export async function compileBriefActivityFacts(database, userId, calendar) {
  return Promise.all(
    [
      ['bookmark', 'bookmark', 'user_id', '今天新增书签', 'Bookmarks added today'],
      ['note', 'note', 'create_by', '今天新增笔记', 'Notes added today'],
      ['file', 'files', 'create_by', '今天新增文件', 'Files added today'],
    ].map(async ([kind, table, owner, zh, en]) => {
      const [[row]] = await database.query(
        `SELECT COUNT(*) AS total FROM ${table} WHERE ${owner}=? AND del_flag=0 AND create_time>=? AND create_time<?`,
        [userId, calendar.todayStart, calendar.todayEnd],
      );
      return {
        id: `${kind}_created_today`,
        label: calendar.locale === 'en-US' ? en : zh,
        count: Number(row.total),
        samples: [],
      };
    }),
  );
}

// 同一套资格规则供生成决策与交付使用，模型不能把低价值事实重新写回简报。
export function selectDailyBriefFacts(facts) {
  const candidates = facts.filter(
    (fact) =>
      Number(fact.count) > 0 &&
      (['todo_overdue', 'todo_due_today', 'todo_scheduled_today'].includes(fact.id) ||
        ['organize_ai_pending', 'organize_pending', 'organize_untagged'].includes(fact.id) ||
        (['workshop_due', 'workshop_next_step', 'workshop_result', 'workshop_attention'].includes(fact.id) &&
          fact.samples?.length &&
          fact.sources?.length)),
  );
  const project =
    candidates.find((fact) => fact.id === 'workshop_due') ||
    candidates.find((fact) => fact.id === 'workshop_next_step');
  // 项目到期和下一步共用一项；失败与成果独立保留，不能互相遮蔽。
  return candidates.filter((fact) =>
    ['workshop_due', 'workshop_next_step'].includes(fact.id) ? fact === project : true,
  );
}

export async function compileDailyBriefFacts(database, userId, calendar) {
  const [todos, review, pending, untagged, workshop, activity] = await Promise.all([
    compileBriefTodoFacts(database, userId, calendar, DAILY_BRIEF_FACT_DEFINITIONS.slice(0, 3)),
    summarizePendingOrganizeReview(database, userId),
    listInboxResources(database, { userId, limit: 2, view: 'summary', includeCounts: false }),
    summarizeUntaggedResources(database, { userId }),
    compileWorkshopBriefFacts(database, userId, calendar),
    compileBriefActivityFacts(database, userId, calendar),
  ]);
  const organize = [review, pending, untagged];
  return [
    ...todos,
    ...DAILY_BRIEF_FACT_DEFINITIONS.slice(3).map(([id, zh, en, route], index) => ({
      id,
      label: calendar.locale === 'en-US' ? en : zh,
      route: organize[index].route || route,
      count: organize[index].total,
      samples: [],
      revision: organize[index].revision || '',
      ...(id === 'organize_ai_pending'
        ? { resourceTypes: review.resourceTypes || [], kinds: review.kinds || [] }
        : id === 'organize_pending'
          ? {
              // 正文区仅保留最近两项的标题与类型，不读取资料详情。
              resources: (pending.items || [])
                .slice(0, 2)
                .filter(
                  (item) =>
                    ['bookmark', 'note', 'file'].includes(item.resourceType) && item.resourceId && item.title?.trim(),
                )
                .map((item) => ({
                  id: item.resourceId,
                  type: item.resourceType,
                  title: item.title.trim().replace(/\s+/gu, ' ').slice(0, 80),
                })),
            }
          : {}),
    })),
    ...workshop,
    ...activity,
  ];
}
