import { summarizePendingOrganizeReview } from './organizeReviewSummary.js';
import { compileWorkshopBriefFacts } from './dailyBriefWorkshop.js';
import { compileBriefTodoFacts } from './dailyBriefTodoFacts.js';
import { listInboxResources } from '../resourceInbox.js';
import { summarizeUntaggedResources } from './resourceInventoryService.js';
import { extractionSchemaReady } from '../extraction/schema.js';
import { taskVisibleSql } from '../toolbox/taskIdentity.js';

export const DAILY_BRIEF_FACT_DEFINITIONS = Object.freeze([
  ['todo_overdue', '单次待办重点（逾期）', 'One-time task focus (overdue)', '/inbox?tab=todo'],
  ['todo_due_today', '单次待办重点（今天到期）', 'One-time task focus (due today)', '/inbox?tab=todo'],
  ['todo_scheduled_today', '单次待办重点（今天安排）', 'One-time task focus (scheduled today)', '/inbox?tab=todo'],
  ['organize_ai_pending', '待审核的整理建议', 'Organizing suggestions to review', '/organize?issue=ai_suggestions'],
  ['organize_pending', '待整理资料', 'Pending resources', '/organize?issue=pending'],
  ['organize_untagged', '无标签资源', 'Untagged resources', '/organize?issue=untagged'],
]);

// 注册赠送资源按来源登记排除；新增计数供顶部概览，个人库存存在性仅用于引导，不进入模型。
export async function compileBriefActivityFacts(database, userId, calendar) {
  return Promise.all(
    [
      ['bookmark', 'bookmark', 'user_id', '今天新增书签', 'Bookmarks added today'],
      ['note', 'note', 'create_by', '今天新增笔记', 'Notes added today'],
      ['file', 'files', 'create_by', '今天新增文件', 'Files added today'],
    ].map(async ([kind, table, owner, zh, en]) => {
      const [[row]] = await database.query(
        `SELECT COUNT(*) AS total,
          EXISTS(SELECT 1 FROM ${table} r WHERE r.${owner}=? AND r.del_flag=0
            AND NOT EXISTS(SELECT 1 FROM onboarding_seed_resources seed
              WHERE seed.user_id=r.${owner} AND seed.resource_type='${kind}' AND seed.resource_id=CAST(r.id AS CHAR)) LIMIT 1) AS hasResources
          FROM ${table} r WHERE r.${owner}=? AND r.del_flag=0 AND r.create_time>=? AND r.create_time<?
            AND NOT EXISTS(SELECT 1 FROM onboarding_seed_resources seed
              WHERE seed.user_id=r.${owner} AND seed.resource_type='${kind}' AND seed.resource_id=CAST(r.id AS CHAR))`,
        [userId, userId, calendar.todayStart, calendar.todayEnd],
      );
      return {
        id: `${kind}_created_today`,
        label: calendar.locale === 'en-US' ? en : zh,
        count: Number(row.total),
        samples: [],
        inventoryEmpty: [0, '0'].includes(row.hasResources) ? true : [1, '1'].includes(row.hasResources) ? false : null,
      };
    }),
  );
}

// 今日没有新增不代表账号没有资料；仅对已核实全空的账号给固定引导。
export async function compileBriefOnboardingFact(database, userId, activity, knownWork = []) {
  const empty = { id: 'onboarding_empty', count: 0 };
  if (
    activity.length !== 3 ||
    !activity.every((fact) => fact.inventoryEmpty === true) ||
    knownWork.some((fact) => fact.count > 0)
  )
    return empty;
  const extractionReady = await extractionSchemaReady(database);
  const [[presence]] = await database.query(
    `SELECT
      EXISTS(SELECT 1 FROM todo_items i WHERE i.user_id=? AND i.del_flag=0
        AND NOT EXISTS(SELECT 1 FROM onboarding_seed_resources seed
          WHERE seed.user_id=i.user_id AND seed.resource_type='todo' AND seed.resource_id=i.id) LIMIT 1) AS hasTodos,
      EXISTS(SELECT 1 FROM toolbox_workspaces WHERE user_id=? LIMIT 1) AS hasWorkspaces,
      EXISTS(SELECT 1 FROM toolbox_jobs job WHERE user_id=? AND ${taskVisibleSql()} LIMIT 1) AS hasJobs,
      ${extractionReady ? 'EXISTS(SELECT 1 FROM toolbox_extractions WHERE user_id=? LIMIT 1)' : '0'} AS hasExtractions`,
    [userId, userId, userId, ...(extractionReady ? [userId] : [])],
  );
  return {
    ...empty,
    count: ['hasTodos', 'hasWorkspaces', 'hasJobs', 'hasExtractions'].every((key) =>
      [0, '0', false].includes(presence?.[key]),
    )
      ? 1
      : 0,
  };
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
    summarizePendingOrganizeReview(database, userId, { excludeOnboardingSeeds: true }),
    listInboxResources(database, {
      userId,
      limit: 2,
      view: 'summary',
      includeCounts: false,
      excludeOnboardingSeeds: true,
    }),
    summarizeUntaggedResources(database, { userId, excludeOnboardingSeeds: true }),
    compileWorkshopBriefFacts(database, userId, calendar),
    compileBriefActivityFacts(database, userId, calendar),
  ]);
  const organize = [review, pending, untagged];
  const onboarding = await compileBriefOnboardingFact(database, userId, activity, [
    ...todos,
    ...workshop,
    ...organize.map((item) => ({ count: item.total })),
  ]);
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
    onboarding,
  ];
}
