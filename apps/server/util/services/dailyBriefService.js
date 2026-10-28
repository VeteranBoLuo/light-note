import {
  ADVICE_POLICY_VERSION,
  MIN_SAFE_ADVICE_POLICY_VERSION,
  DAILY_BRIEF_OUTPUT_ERROR_CODES,
  adviceContext,
  adviceModelSignals,
  resolveAdvice,
} from './dailyBriefAdvice.js';
import { randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import pool from '../../db/index.js';
import { parseTimeRange, normalizeAgentTimeZone } from '../agent/timeRange.js';
import { executeAiSkill } from '../aiSkill/runtime.js';
import { withActiveUserAiDispatch } from '../aiOutboundDispatchGuard.js';
import { isDailyBriefFeatureEnabled } from '../dailyBriefFeature.js';
import { normalizeTodoLocale } from '../todoDateFormat.js';
import { compileDailyBriefFacts, selectDailyBriefFacts } from './dailyBriefFacts.js';
import {
  needsAdviceResultRecovery,
  briefFreshness,
  briefSnapshot,
  DAILY_BRIEF_REFRESH_POLICY,
} from './dailyBriefFreshness.js';

const DEFAULT_TIMEZONE = 'Asia/Shanghai';
const LEASE_SECONDS = 180;
const DAILY_BRIEF_VERSION = 2;
const DAILY_BRIEF_TEMPLATE_TOKEN = /\{\{([a-z_]+)\.(count|sample)\}\}/gu;

const SECTION_TITLES = Object.freeze({
  'zh-CN': Object.freeze({
    today_actions: '今日行动',
    organize: '待整理',
  }),
  'en-US': Object.freeze({
    today_actions: "Today's Actions",
    organize: 'To Organize',
  }),
});

function serviceError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function renderNarrativeTemplate(value, factsById) {
  return String(value || '').replace(DAILY_BRIEF_TEMPLATE_TOKEN, (_token, factId, field) => {
    const fact = factsById.get(factId);
    return field === 'sample' ? String(fact?.samples?.[0] || '') : String(fact?.count ?? 0);
  });
}

function hydrateBriefNarrative(brief) {
  if (!brief || typeof brief !== 'object') return brief;
  if (brief.narrativeHydrated) return brief;
  const facts = (Array.isArray(brief.sections) ? brief.sections : []).flatMap((section) =>
    Array.isArray(section?.items) ? section.items : [],
  );
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  if (!factsById.size) return brief;
  return {
    ...brief,
    headline: renderNarrativeTemplate(brief.headline, factsById),
    recommendation: renderNarrativeTemplate(brief.recommendation, factsById),
    insights: Array.isArray(brief.insights)
      ? brief.insights.map((insight) => ({
          ...insight,
          text: renderNarrativeTemplate(insight.text, factsById),
        }))
      : brief.insights,
    sections: brief.sections.map((section) => ({
      ...section,
      items: Array.isArray(section.items)
        ? section.items.map((item) => ({
            ...item,
            text: item.text ? renderNarrativeTemplate(item.text, factsById) : item.text,
          }))
        : section.items,
    })),
  };
}

// 低于安全展示版本的输出不能作为“上次建议”；只投影缓存，不触发模型或批量回写。
function currentAdviceProjection(brief) {
  if (!brief || typeof brief !== 'object') return brief;
  const safeVersion = (value) =>
    Number.isInteger(value) && value >= MIN_SAFE_ADVICE_POLICY_VERSION && value <= ADVICE_POLICY_VERSION;
  const invalidCurrent = Boolean(brief.recommendation) && !safeVersion(brief.advicePolicyVersion);
  const invalidPrevious =
    Boolean(brief.lastAdviceResult?.recommendation) && !safeVersion(brief.lastAdviceResult.advicePolicyVersion);
  if (!invalidCurrent && !invalidPrevious) return brief;
  const result = { ...brief };
  if (invalidCurrent) {
    result.recommendation = '';
    if (result.adviceStatus === 'ready') result.adviceStatus = 'not_evaluated';
    for (const key of [
      'recommendationKind',
      'recommendationFactIds',
      'recommendationSources',
      'adviceKey',
      'adviceProposal',
    ])
      delete result[key];
  }
  if (invalidPrevious) delete result.lastAdviceResult;
  return result;
}

function sqlDateTime(value) {
  return String(value || '').slice(0, 19);
}

function resolveCalendar(preferences, now = new Date()) {
  const timezone = normalizeAgentTimeZone(preferences?.timezone, DEFAULT_TIMEZONE);
  const locale = normalizeTodoLocale(preferences?.locale);
  const todayRange = parseTimeRange('今天', { now, timeZone: timezone });
  const tomorrowRange = parseTimeRange('明天', { now, timeZone: timezone });
  const yesterdayRange = parseTimeRange('昨天', { now, timeZone: timezone });
  const instant = Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(timezone);
  const nextDateAt = instant.toPlainDate().add({ days: 1 }).toZonedDateTime(timezone).toInstant().toString();
  return Object.freeze({
    timezone,
    locale,
    date: instant.toPlainDate().toString(),
    // 由账号时区计算下一个自然日边界，前端据此做一次性唤醒；不能用浏览器本地零点代替。
    nextDateAt,
    now: sqlDateTime(todayRange.endExclusive),
    todayStart: sqlDateTime(todayRange.start),
    todayEnd: sqlDateTime(tomorrowRange.start),
    yesterdayStart: sqlDateTime(yesterdayRange.start),
  });
}

export async function getDailyBriefPreference(database = pool, userId) {
  const ownerId = String(userId || '').trim();
  if (!ownerId) throw serviceError('DAILY_BRIEF_AUTH_REQUIRED', '登录后才能查看每日简报', 401);
  const [rows] = await database.query('SELECT preferences FROM user WHERE id = ? AND del_flag = 0 LIMIT 1', [ownerId]);
  if (!rows.length) throw serviceError('DAILY_BRIEF_USER_NOT_FOUND', '账号不存在', 404);
  const preferences = parseJson(rows[0].preferences, {}) || {};
  return Object.freeze({
    enabled: preferences.dailyBrief !== false,
    autoUpdate: preferences.dailyBriefAutoUpdate !== false,
    timezone: normalizeAgentTimeZone(preferences.timezone, DEFAULT_TIMEZONE),
    locale: normalizeTodoLocale(preferences.lang),
  });
}

export async function updateDailyBriefPreference(database = pool, userId, enabled, autoUpdate) {
  if (typeof enabled !== 'boolean') throw serviceError('DAILY_BRIEF_PREFERENCE_INVALID', '每日简报开关必须是布尔值');
  if (autoUpdate !== undefined && typeof autoUpdate !== 'boolean')
    throw serviceError('DAILY_BRIEF_PREFERENCE_INVALID', '自动更新开关必须是布尔值');
  const ownerId = String(userId || '').trim();
  if (!ownerId) throw serviceError('DAILY_BRIEF_AUTH_REQUIRED', '登录后才能设置每日简报', 401);
  const [result] = await database.query(
    `UPDATE user
        SET preferences = JSON_SET(
          CASE WHEN JSON_VALID(preferences) THEN preferences ELSE JSON_OBJECT() END,
          '$.dailyBrief',
          CAST(? AS JSON)${autoUpdate === undefined ? '' : ", '$.dailyBriefAutoUpdate', CAST(? AS JSON)"}
        )
      WHERE id = ? AND del_flag = 0`,
    [enabled ? 'true' : 'false', ...(autoUpdate === undefined ? [] : [autoUpdate ? 'true' : 'false']), ownerId],
  );
  if (!Number(result?.affectedRows || 0)) throw serviceError('DAILY_BRIEF_USER_NOT_FOUND', '账号不存在', 404);
  return Object.freeze({ enabled, ...(autoUpdate === undefined ? {} : { autoUpdate }) });
}

const compileFacts = compileDailyBriefFacts;
function validAdviceProposal(proposal, signals) {
  if (proposal === undefined) return false;
  try {
    resolveAdvice(proposal, signals);
    return true;
  } catch (error) {
    if (!Object.hasOwn(DAILY_BRIEF_OUTPUT_ERROR_CODES, error.message)) throw error;
    return false;
  }
}
const BRIEF_RESOURCE_NAMES = {
  bookmark: ['书签', 'bookmarks'],
  note: ['笔记', 'notes'],
  file: ['文件', 'files'],
  tag: ['标签', 'tags'],
};
const BRIEF_SUGGESTION_NAMES = {
  title: ['标题', 'titles'],
  description: ['描述', 'descriptions'],
  tags: ['标签', 'tags'],
  archive: ['网页存档', 'webpage archives'],
  duplicate: ['重复资料', 'duplicates'],
  empty: ['空内容', 'empty content'],
  tag_merge: ['标签合并', 'tag merging'],
  tag_icon: ['标签图标', 'tag icons'],
};
function briefTitle(value) {
  const title = String(value || '')
    .replace(/\s+/gu, ' ')
    .trim();
  return title.length > 48 ? `${title.slice(0, 47)}…` : title;
}
function reviewContext(fact, english) {
  const join = (values, names) =>
    new Intl.ListFormat(english ? 'en-US' : 'zh-CN').format(
      [...new Set(values || [])]
        .filter((value) => Object.hasOwn(names, value))
        .map((value) => names[value][english ? 1 : 0]),
    );
  const types = join(fact.resourceTypes, BRIEF_RESOURCE_NAMES);
  const kinds = join(fact.kinds, BRIEF_SUGGESTION_NAMES);
  if (!types && !kinds) return '';
  return english
    ? ` ${[types && `Covering ${types}`, kinds && `suggestions include ${kinds}`].filter(Boolean).join('; ')}.`
    : `${types ? `涉及${types}` : ''}${types && kinds ? '，' : ''}${kinds ? `包括${kinds}建议` : ''}。`;
}

function pendingResourceContext(facts, english) {
  const examples = (facts.find((fact) => fact.id === 'organize_pending')?.resources || [])
    .slice(0, 2)
    .filter((resource) => resource.title && Object.hasOwn(BRIEF_RESOURCE_NAMES, resource.type))
    .map((resource) =>
      english
        ? `“${briefTitle(resource.title)}”`
        : `${BRIEF_RESOURCE_NAMES[resource.type][0]}《${briefTitle(resource.title)}》`,
    );
  if (!examples.length) return '';
  return english
    ? ` Recently collected: ${new Intl.ListFormat('en-US').format(examples)}.`
    : `最近收集的有${examples.join('、')}。`;
}

function todoBriefText(entry, factId, calendar) {
  const english = calendar.locale === 'en-US';
  const raw = String(entry.at || '').replace('T', ' ');
  const date = raw.slice(5, 10);
  const time = raw.slice(11, 16);
  const today = raw.slice(0, 10) === calendar.date;
  const at = today && time ? (english ? `today at ${time}` : `今天 ${time}`) : raw.slice(5, 16);
  const title = english ? `“${entry.title}”` : `「${entry.title}」`;
  if (entry.reason === 'plan')
    return factId === 'todo_overdue'
      ? english
        ? `${title} was planned${date ? ` for ${date}` : ' earlier'} and is still pending.`
        : `此前安排的${title}仍待完成${date ? `（计划日期 ${date}）` : ''}。`
      : english
        ? `${title} is on today's plan and is still pending.`
        : `今天安排了${title}，这项待办目前还未完成。`;
  if (entry.reason === 'due')
    return factId === 'todo_overdue'
      ? english
        ? `${title} is overdue${at ? ` (due ${at})` : ''} and is still incomplete.`
        : `${title}已超过截止时间${at ? `（${at}）` : ''}，目前仍未完成。`
      : english
        ? `${title} is due${at ? ` ${at}` : ' today'} and is still pending.`
        : `${title}需要在${at ? `${at} 前` : '今天内'}完成，目前仍待处理。`;
  if (entry.reason === 'start')
    return english
      ? `${title} is scheduled to start${at ? ` ${at}` : ' today'} and is still pending.`
      : `${title}安排在${at ? `${at} ` : '今天'}开始，目前仍待处理。`;
  return english
    ? `Today's reminder is for ${title}${at ? `, ${at}` : ''}. The task is still pending.`
    : `今天留意一下${title}：${time ? `已设置 ${time} 提醒，` : ''}目前仍待完成。`;
}

function buildBrief(calendar, facts, narrative = null) {
  const english = calendar.locale === 'en-US';
  const eligible = selectDailyBriefFacts(facts);
  const todos = eligible.filter((fact) => fact.id.startsWith('todo_'));
  const todoInsights = todos
    .flatMap((fact) =>
      (fact.entries || []).map((entry) => {
        return {
          id: `todo_${entry.id}`,
          factIds: [fact.id],
          text: todoBriefText(entry, fact.id, calendar),
          sources: [{ type: 'todo', id: entry.id, title: entry.title }],
        };
      }),
    )
    .slice(0, 1);
  const insights = [];
  const attention = eligible.find((fact) => fact.id === 'workshop_attention');
  if (attention)
    insights.push({
      id: attention.id,
      factIds: [attention.id],
      text: attention.samples[0],
      sources: attention.sources,
    });
  insights.push(...todoInsights);
  const due = eligible.find((fact) => fact.id === 'workshop_due');
  const project = due || eligible.find((fact) => fact.id === 'workshop_next_step');
  if (project)
    insights.push({ id: project.id, factIds: [project.id], text: project.samples[0], sources: project.sources });
  const result = eligible.find((fact) => fact.id === 'workshop_result');
  if (result) {
    insights.push({
      id: 'workshop_result',
      factIds: [result.id],
      text: result.sources?.[0]?.title
        ? english
          ? `“${briefTitle(result.sources[0].title)}” is ready and has not been saved.`
          : `《${briefTitle(result.sources[0].title)}》已生成，尚未保存。`
        : result.samples[0],
      sources: result.sources,
    });
  }
  const review = eligible.find((fact) => fact.id === 'organize_ai_pending');
  const resources = ['organize_pending', 'organize_untagged']
    .map((id) => eligible.find((fact) => fact.id === id))
    .filter(Boolean);
  const organizeTexts = [];
  if (review)
    organizeTexts.push(
      (english
        ? `${review.count} organizing suggestions are ready for review.`
        : `有 ${review.count} 条 AI 整理建议待审核。`) + reviewContext(review, english),
    );
  if (resources.length)
    organizeTexts.push(
      // 这两个集合可能重叠；分别说明数量，不相加为“待处理总量”。
      `${resources
        .map((fact) =>
          fact.id === 'organize_pending'
            ? english
              ? `${fact.count} resources await organizing`
              : `${fact.count} 项资料待整理`
            : english
              ? `${fact.count} resources have no tags`
              : `${fact.count} 项资源尚无标签`,
        )
        .join(english ? '; ' : '；')}${english ? '.' : '。'}${pendingResourceContext(resources, english)}`,
    );
  if (organizeTexts.length)
    insights.push({
      id: 'organize_summary',
      factIds: [...(review ? [review.id] : []), ...resources.map((fact) => fact.id)],
      text: organizeTexts.join(' '),
    });
  const activityNames = {
    bookmark_created_today: ['条书签', 'bookmark', 'bookmarks'],
    note_created_today: ['篇笔记', 'note', 'notes'],
    file_created_today: ['个文件', 'file', 'files'],
  };
  const activity = facts.filter((fact) => Object.hasOwn(activityNames, fact.id) && fact.count > 0);
  const activityMeasured = Object.keys(activityNames).every((id) =>
    facts.some((fact) => fact.id === id && Number.isFinite(fact.count) && fact.count >= 0),
  );
  const activityHeadline = activity.length
    ? (english ? 'Added today: ' : '今天新增 ') +
      new Intl.ListFormat(english ? 'en-US' : 'zh-CN').format(
        activity.map((fact) => `${fact.count} ${activityNames[fact.id][english ? (fact.count === 1 ? 1 : 2) : 0]}`),
      )
    : activityMeasured
      ? english
        ? insights.length
          ? 'No resources added today.'
          : 'No resources added today, and nothing needs special attention.'
        : insights.length
          ? '今天暂无新增资源'
          : '今天暂无新增资源，也没有需要特别关注的事项。'
      : insights.length
        ? ''
        : english
          ? 'Nothing needs special attention today.'
          : '今天暂无需特别关注的事项';
  // 与正文共用已核实的整理事实；顶部只说明仍有事项，不重复数量。
  const organizingHeadline = resources.length
    ? english
      ? 'Resources still await organizing'
      : '仍有资料待整理'
    : review
      ? english
        ? 'Organizing suggestions await review'
        : '仍有整理建议待审核'
      : '';
  const headline = organizingHeadline
    ? activityHeadline
      ? `${activityHeadline.replace(/[.。]$/, '')}${english ? '; ' : '，'}${english ? organizingHeadline.charAt(0).toLowerCase() + organizingHeadline.slice(1) : organizingHeadline}`
      : organizingHeadline
    : activityHeadline;
  const advice = adviceContext(facts, calendar.locale);
  const onboarding = !advice.signals.length && facts.some((fact) => fact.id === 'onboarding_empty' && fact.count === 1);
  const recommendation =
    narrative?.adviceKey === advice.key
      ? resolveAdvice(
          narrative.adviceProposal,
          advice.signals,
          insights.map((item) => item.text),
        )
      : null;
  return {
    version: DAILY_BRIEF_VERSION,
    date: calendar.date,
    generatedBy: narrative ? 'ai' : 'facts',
    narrativeHydrated: true,
    headline,
    // 失败、单次待办、项目、成果、整理各最多一项，不靠截断遗漏后面的类别。
    insights,
    recommendation: onboarding
      ? english
        ? 'Start by collecting a resource, writing a note, or creating a to-do—one small step to get started with Light Note.'
        : '可以先收集一份资料、写一篇笔记，或新建一条待办，从一件小事开始使用轻笺。'
      : recommendation?.action || '',
    advicePolicyVersion: ADVICE_POLICY_VERSION,
    adviceStatus: onboarding
      ? 'ready'
      : !advice.signals.length
        ? 'no_evidence'
        : narrative?.adviceKey === advice.key
          ? recommendation
            ? 'ready'
            : 'no_value'
          : 'not_evaluated',
    ...(narrative?.adviceKey === advice.key && advice.key
      ? { adviceKey: advice.key, adviceProposal: recommendation ? narrative.adviceProposal : null }
      : {}),
    ...(recommendation
      ? {
          recommendationKind: 'ai',
          recommendationFactIds: recommendation.factIds,
          recommendationSources: recommendation.sources,
        }
      : {}),
    ...(onboarding ? { recommendationKind: 'action', recommendationFactIds: ['onboarding_empty'] } : {}),
    sections: [
      { id: 'today_actions', title: SECTION_TITLES[calendar.locale]?.today_actions || '今日行动', items: todos },
      ...(activity.length || activityMeasured
        ? [
            {
              id: 'new_content',
              title: english ? 'Added today' : '今日新增',
              items: activity.length ? activity : facts.filter((fact) => Object.hasOwn(activityNames, fact.id)),
            },
          ]
        : []),
      {
        id: 'organize',
        title: SECTION_TITLES[calendar.locale]?.organize || '待整理',
        items: [...(review ? [review] : []), ...resources],
      },
    ],
  };
}

function rowStatus({ featureEnabled, preference, calendar, row }) {
  if (!featureEnabled || !preference.enabled) {
    return {
      featureEnabled,
      enabled: preference.enabled,
      date: calendar.date,
      nextDateAt: calendar.nextDateAt || null,
      status: 'disabled',
      brief: null,
      generatedAt: null,
      lastErrorCode: null,
    };
  }
  if (!row) {
    return {
      featureEnabled,
      enabled: true,
      date: calendar.date,
      nextDateAt: calendar.nextDateAt || null,
      status: 'not_generated',
      brief: null,
      generatedAt: null,
      lastErrorCode: null,
    };
  }
  const parsedBrief = currentAdviceProjection(hydrateBriefNarrative(parseJson(row.briefJson ?? row.brief_json, null)));
  const staleReadyBrief =
    String(row.status || '') === 'ready' && Number(parsedBrief?.version || 0) < DAILY_BRIEF_VERSION;
  if (staleReadyBrief) {
    return {
      featureEnabled,
      enabled: true,
      date: calendar.date,
      nextDateAt: calendar.nextDateAt || null,
      status: 'not_generated',
      brief: null,
      generatedAt: null,
      lastErrorCode: null,
    };
  }
  const leaseExpired =
    String(row.status || '') === 'generating' && Number(row.leaseExpired ?? row.lease_expired ?? 0) === 1;
  return {
    featureEnabled,
    enabled: true,
    date: calendar.date,
    nextDateAt: calendar.nextDateAt || null,
    // GET 保持只读。过期租约仅映射成可重试失败态，真正的重领仍只由显式 POST ensure 完成。
    status: leaseExpired ? 'failed' : String(row.status || 'failed'),
    brief: parsedBrief,
    generatedAt: row.generatedAt ?? row.generated_at ?? null,
    lastErrorCode: leaseExpired ? 'DAILY_BRIEF_GENERATION_STALE' : (row.lastErrorCode ?? row.last_error_code ?? null),
  };
}

async function loadBriefRow(database, userId, date) {
  const [rows] = await database.query(
    `SELECT id, status, facts_json AS factsJson, brief_json AS briefJson, generated_at AS generatedAt, last_error_code AS lastErrorCode,
            CASE WHEN status = 'generating' AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
              THEN 1 ELSE 0 END AS leaseExpired
       FROM workbench_daily_briefs WHERE user_id = ? AND brief_date = ? LIMIT 1`,
    [userId, date],
  );
  return rows[0] || null;
}

// Dismissal is effective even with automatic generation disabled or an older stored brief.
// This read projection never generates advice or changes billing/history.
async function hideDismissedBriefTasks(database, userId, row) {
  const brief = parseJson(row?.briefJson ?? row?.brief_json);
  const taskIds = (sources = []) =>
    sources.filter((source) => source.type === 'toolbox_task').map((source) => String(source.id));
  const ids = [
    ...new Set([
      ...(brief?.insights || []).flatMap((item) => taskIds(item.sources)),
      ...taskIds(brief?.recommendationSources),
      ...taskIds(brief?.lastAdviceResult?.recommendationSources),
    ]),
  ];
  if (!ids.length) return row;
  const [hidden] = await database.query(
    `SELECT id FROM toolbox_jobs WHERE user_id=? AND id IN (${ids.map(() => '?').join(',')})
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(options_json,'$.homeDismissed')),'false') IN ('true','1')`,
    [userId, ...ids],
  );
  if (!hidden.length) return row;
  const dismissed = new Set(hidden.map((item) => String(item.id)));
  const projected = {
    ...brief,
    insights: brief.insights.filter(
      (item) =>
        !(item.sources || []).some((source) => source.type === 'toolbox_task' && dismissed.has(String(source.id))),
    ),
  };
  if (taskIds(brief.recommendationSources).some((id) => dismissed.has(id))) {
    projected.recommendation = '';
    projected.adviceStatus = 'not_evaluated';
    for (const key of [
      'recommendationSources',
      'recommendationFactIds',
      'recommendationKind',
      'adviceKey',
      'adviceProposal',
    ])
      delete projected[key];
  }
  if (taskIds(brief.lastAdviceResult?.recommendationSources).some((id) => dismissed.has(id)))
    delete projected.lastAdviceResult;
  return { ...row, briefJson: projected };
}

export async function getDailyBrief(
  database = pool,
  { userId, now = new Date(), env = process.env, check = false } = {},
  dependencies = {},
) {
  const preference = await getDailyBriefPreference(database, userId);
  const calendar = resolveCalendar(preference, now);
  const featureEnabled = isDailyBriefFeatureEnabled(env);
  if (!featureEnabled || !preference.enabled)
    return { ...rowStatus({ featureEnabled, preference, calendar, row: null }), autoUpdate: preference.autoUpdate };
  const row = await hideDismissedBriefTasks(database, userId, await loadBriefRow(database, userId, calendar.date));
  const facts =
    check && (row?.status !== 'generating' || Number(row?.leaseExpired || 0))
      ? await (dependencies.compileFacts || compileFacts)(database, userId, calendar)
      : null;
  return {
    ...rowStatus({ featureEnabled, preference, calendar, row }),
    ...briefFreshness({ row, facts, calendar, preference, now }),
    timezone: calendar.timezone,
  };
}

async function generateDailyBriefForActiveUser(
  database,
  { userId, req, now, preference, calendar, featureEnabled, refresh = false },
  dependencies,
) {
  const existing = await loadBriefRow(database, userId, calendar.date);
  if (existing?.status === 'generating' && !Number(existing.leaseExpired || 0)) {
    return {
      ...rowStatus({ featureEnabled, preference, calendar, row: existing }),
      autoUpdate: preference.autoUpdate,
      timezone: calendar.timezone,
    };
  }
  const facts = await (dependencies.compileFacts || compileFacts)(database, userId, calendar);
  const freshness = briefFreshness({ row: existing, facts, calendar, preference, now, automatic: !refresh });
  if (!freshness.shouldGenerate) {
    return {
      ...rowStatus({ featureEnabled, preference, calendar, row: existing }),
      ...freshness,
      timezone: calendar.timezone,
    };
  }
  const currentSnapshot = briefSnapshot(facts, calendar, now.toISOString());
  const id = randomUUID();
  const leaseToken = randomUUID();
  const previousAttempt = parseJson(existing?.factsJson, {});
  const advice = adviceContext(facts, calendar.locale);
  let previousBrief = currentAdviceProjection(parseJson(existing?.briefJson));
  if (!previousBrief && (advice.key || facts.some((fact) => fact.id === 'workshop_result' && fact.count > 0))) {
    const [previousRows] = await database.query(
      `SELECT brief_json AS briefJson FROM workbench_daily_briefs
        WHERE user_id = ? AND brief_date < ? AND brief_json IS NOT NULL
        ORDER BY brief_date DESC LIMIT 1`,
      [userId, calendar.date],
    );
    previousBrief = currentAdviceProjection(parseJson(previousRows[0]?.briefJson));
  }
  const cacheKeyMatches = Boolean(advice.key && previousBrief?.adviceKey === advice.key);
  const cachedAdvice = cacheKeyMatches && validAdviceProposal(previousBrief.adviceProposal, advice.signals);
  if (cacheKeyMatches && !cachedAdvice) {
    previousBrief = { ...previousBrief, recommendation: '', adviceStatus: 'not_evaluated' };
    for (const key of [
      'adviceKey',
      'adviceProposal',
      'recommendationKind',
      'recommendationFactIds',
      'recommendationSources',
      'lastAdviceResult',
    ])
      delete previousBrief[key];
  }
  const cachedNarrative = cachedAdvice ? { adviceKey: advice.key, adviceProposal: previousBrief.adviceProposal } : null;
  const interval =
    refresh || needsAdviceResultRecovery(previousBrief)
      ? DAILY_BRIEF_REFRESH_POLICY.manualIntervalMs
      : DAILY_BRIEF_REFRESH_POLICY.normalIntervalMs;
  const lastAttempt = Math.max(
    Date.parse(previousAttempt.attemptedAt || '') || 0,
    Date.parse(previousBrief?.adviceAttemptedAt || '') || 0,
  );
  const previousAdviceFailed = previousBrief?.adviceStatus === 'failed';
  // 旧失败也保留，直到本次材料变化或用户明确重试；正文变化不代表重试授权。
  const sameFailedAdvice =
    previousAdviceFailed &&
    Boolean(advice.key) &&
    (previousBrief.adviceAttemptKey === advice.key || !previousBrief.adviceAttemptKey);
  const quotaBlocked = /^AI_QUOTA_(EXCEEDED|INSUFFICIENT_FOR_REQUEST)$/.test(
    previousBrief?.adviceFailureCode || existing?.lastErrorCode || '',
  );
  const modelAllowed =
    (!lastAttempt || now.getTime() - lastAttempt >= interval) &&
    (refresh ||
      (Number(previousAttempt.automaticAttempts || 0) < DAILY_BRIEF_REFRESH_POLICY.maxAutomaticAttempts &&
        !quotaBlocked)) &&
    (refresh || !sameFailedAdvice);
  const modelSignals = modelAllowed && !cachedAdvice ? advice.signals : [];
  const needsModel = Boolean(modelSignals.length);
  const adviceDeferred = Boolean(
    advice.signals.length &&
    !cachedAdvice &&
    !modelAllowed &&
    !sameFailedAdvice &&
    Number(previousAttempt.automaticAttempts || 0) < DAILY_BRIEF_REFRESH_POLICY.maxAutomaticAttempts &&
    !quotaBlocked,
  );
  const serializedFacts = JSON.stringify({
    version: 1,
    facts,
    attemptedAt: needsModel ? now.toISOString() : lastAttempt ? new Date(lastAttempt).toISOString() : null,
    automaticAttempts: Number(previousAttempt?.automaticAttempts || 0) + (refresh || !needsModel ? 0 : 1),
  });
  let ownsLease = false;

  // 决策在账号外发屏障内完成；自动和手动共用围栏，后到请求必须先重读已经交付的快照。
  if (existing) {
    const [refreshClaimResult] = await database.query(
      `UPDATE workbench_daily_briefs
          SET status = 'generating', facts_json = ?, timezone = ?, lease_token = ?,
              lease_expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND), last_error_code = NULL
        WHERE user_id = ? AND brief_date = ?
          AND (status IN ('ready', 'failed')
            OR (status = 'generating' AND (lease_expires_at IS NULL OR lease_expires_at < NOW())))`,
      [serializedFacts, calendar.timezone, leaseToken, LEASE_SECONDS, userId, calendar.date],
    );
    ownsLease = Number(refreshClaimResult?.affectedRows || 0) === 1;
  }

  if (!ownsLease) {
    const [insertResult] = await database.query(
      `INSERT IGNORE INTO workbench_daily_briefs
         (id, user_id, brief_date, timezone, status, facts_json, lease_token, lease_expires_at)
       VALUES (?, ?, ?, ?, 'generating', ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [id, userId, calendar.date, calendar.timezone, serializedFacts, leaseToken, LEASE_SECONDS],
    );
    ownsLease = Number(insertResult?.affectedRows || 0) === 1;
  }

  if (!ownsLease) {
    const existing = await loadBriefRow(database, userId, calendar.date);
    return rowStatus({ featureEnabled, preference, calendar, row: existing });
  }

  const runSkill = dependencies.executeAiSkill || executeAiSkill;
  let committedBrief = null;
  let deliveryAttempted = false;
  let adviceFailed = !needsModel && (sameFailedAdvice || (quotaBlocked && advice.signals.length));
  let adviceFailureReason = adviceFailed ? previousBrief?.adviceFailureReason || 'GENERATION_UNAVAILABLE' : null;
  let adviceFailureCode = adviceFailed ? previousBrief?.adviceFailureCode || existing?.lastErrorCode : null;
  const commitBrief = async (narrative = cachedNarrative) => {
    const brief = {
      ...buildBrief(calendar, facts, narrative),
      snapshot: currentSnapshot,
      ...(advice.signals.length && !cachedAdvice && !needsModel && !adviceFailed
        ? { adviceStatus: adviceDeferred ? 'deferred' : 'paused' }
        : {}),
      ...(adviceDeferred ? { adviceDeferred: true } : {}),
      ...(modelSignals.length || adviceFailed
        ? {
            adviceAttemptKey:
              adviceFailed && !modelSignals.length ? previousBrief?.adviceAttemptKey || advice.key : advice.key,
            adviceAttemptedAt: modelSignals.length
              ? now.toISOString()
              : previousBrief?.adviceAttemptedAt || (lastAttempt ? new Date(lastAttempt).toISOString() : null),
          }
        : {}),
      ...(adviceFailed ? { adviceStatus: 'failed', adviceFailureReason, adviceFailureCode } : {}),
    };
    // 保留最近一次完成的分析结果，与本轮调度/失败状态分开，刷新或重进页面不会丢失。
    const completed = ['ready', 'no_value', 'no_evidence'];
    const candidateResult = completed.includes(brief.adviceStatus)
      ? brief
      : completed.includes(previousBrief?.adviceStatus)
        ? previousBrief
        : previousBrief?.lastAdviceResult;
    const isFixedGuide = candidateResult?.recommendationFactIds?.includes('onboarding_empty');
    const lastResult =
      !isFixedGuide &&
      (!candidateResult?.recommendation ||
        (validAdviceProposal(
          { factIds: candidateResult.recommendationFactIds, action: candidateResult.recommendation },
          advice.signals,
        ) &&
          (candidateResult.recommendationSources || []).every((source) =>
            advice.signals.some((signal) =>
              signal.sources.some((current) => current.type === source.type && current.id === source.id),
            ),
          )))
        ? candidateResult
        : null;
    if (lastResult) {
      brief.lastAdviceResult = {
        adviceStatus: lastResult.adviceStatus,
        ...(lastResult.advicePolicyVersion ? { advicePolicyVersion: lastResult.advicePolicyVersion } : {}),
        recommendation: lastResult.recommendation || '',
        ...(lastResult.recommendationKind ? { recommendationKind: lastResult.recommendationKind } : {}),
        ...(lastResult.recommendationFactIds ? { recommendationFactIds: lastResult.recommendationFactIds } : {}),
        ...(lastResult.recommendationSources ? { recommendationSources: lastResult.recommendationSources } : {}),
      };
    }
    // 有实际判断或明确阻塞后才完成兼容；冷却中的旧记录仍由自动检查接续。
    if (!needsAdviceResultRecovery(previousBrief) || !needsAdviceResultRecovery(brief) || modelSignals.length)
      brief.adviceResultVersion = 1;
    deliveryAttempted = true;
    const [updateResult] = await database.query(
      `UPDATE workbench_daily_briefs
          SET status = 'ready', brief_json = ?, generated_at = NOW(),
              lease_token = NULL, lease_expires_at = NULL, last_error_code = NULL
        WHERE user_id = ? AND brief_date = ? AND status = 'generating' AND lease_token = ?`,
      [JSON.stringify(brief), userId, calendar.date, leaseToken],
    );
    if (Number(updateResult?.affectedRows || 0) !== 1)
      throw serviceError('DAILY_BRIEF_LEASE_LOST', '每日简报生成租约已失效', 409);
    committedBrief = brief;
  };
  try {
    if (!needsModel) await commitBrief();
    else {
      try {
        await runSkill(
          {
            protocolVersion: 1,
            requestId: randomUUID(),
            skillId: 'routine.daily_brief',
            skillVersion: 2,
            threadId: null,
            input: {
              date: calendar.date,
              timezone: calendar.timezone,
              locale: calendar.locale,
              signals: adviceModelSignals(modelSignals),
            },
            scope: { resourceRefs: [] },
            client: { locale: calendar.locale, timezone: calendar.timezone, surface: 'desktop_workbench' },
          },
          req,
          {
            database,
            internalCaller: 'daily_brief_service',
            commitValidatedResult: async ({ response }) => {
              if (
                modelSignals.length &&
                (!Object.hasOwn(response.result, 'recommendation') || response.result.recommendation === undefined)
              ) {
                throw Object.assign(new Error('Missing advice decision'), {
                  code: DAILY_BRIEF_OUTPUT_ERROR_CODES.ADVICE_DECISION_MISSING,
                  details: { reason: 'ADVICE_DECISION_MISSING' },
                });
              }
              return commitBrief({
                ...cachedNarrative,
                narrativeHydrated: true,
                ...(modelSignals.length
                  ? { adviceKey: advice.key, adviceProposal: response.result.recommendation }
                  : {}),
              });
            },
          },
        );
      } catch (error) {
        // 模型失败不挡住行动事实；持久化/租约失败仍必须作为失败返回，不能覆盖迟到产物。
        if (deliveryAttempted || String(error?.code || '').startsWith('DAILY_BRIEF_')) throw error;
        adviceFailed = Boolean(modelSignals.length);
        adviceFailureCode =
          /^AI_QUOTA_(EXCEEDED|INSUFFICIENT_FOR_REQUEST)$/.test(error?.code || '') ||
          Object.values(DAILY_BRIEF_OUTPUT_ERROR_CODES).includes(error?.code)
            ? error.code
            : 'AI_ADVICE_GENERATION_FAILED';
        const reason = error?.details?.reason;
        adviceFailureReason = [
          'ADVICE_SHAPE',
          'ADVICE_DECISION_MISSING',
          'ADVICE_SOURCE_UNKNOWN',
          'ADVICE_ACTION_LENGTH',
          'ADVICE_NUMBER_UNSUPPORTED',
          'INSIGHTS_SHAPE',
          'FACT_IDS_INVALID',
        ].includes(reason)
          ? reason
          : 'GENERATION_UNAVAILABLE';
        await commitBrief();
      }
    }
    if (!committedBrief) {
      throw serviceError('DAILY_BRIEF_DELIVERY_NOT_COMMITTED', '每日简报未完成持久化交付', 503);
    }
    // 模型运行期间可能发生编辑，产物保留生成前的快照时间，绝不把旧输入标成实时。
    const latestFacts = await (dependencies.compileFacts || compileFacts)(database, userId, calendar).catch(() => null);
    return {
      featureEnabled,
      enabled: true,
      date: calendar.date,
      nextDateAt: calendar.nextDateAt || null,
      status: 'ready',
      brief: committedBrief,
      generatedAt: now.toISOString(),
      lastErrorCode: null,
      timezone: calendar.timezone,
      ...briefFreshness({
        row: { status: 'ready', briefJson: committedBrief, factsJson: serializedFacts },
        facts: latestFacts,
        calendar,
        preference,
        now,
      }),
      // 交付后复核失败表示新鲜度未知，不能让手动更新宣称已核实当前资料。
      ...(!latestFacts ? { stale: true, staleFactIds: Object.keys(currentSnapshot.factRevisions) } : {}),
    };
  } catch (error) {
    const errorCode = String(error?.code || 'DAILY_BRIEF_GENERATION_FAILED').slice(0, 64);
    await database
      .query(
        `UPDATE workbench_daily_briefs
            SET status = 'failed', lease_token = NULL, lease_expires_at = NULL, last_error_code = ?
          WHERE user_id = ? AND brief_date = ? AND status = 'generating' AND lease_token = ?`,
        [errorCode, userId, calendar.date, leaseToken],
      )
      .catch(() => {});
    throw error;
  }
}

export async function ensureDailyBrief(
  database = pool,
  { userId, req, now, env = process.env } = {},
  dependencies = {},
) {
  const preference = await getDailyBriefPreference(database, userId);
  const calendar = resolveCalendar(preference, now || new Date());
  const featureEnabled = isDailyBriefFeatureEnabled(env);
  if (!featureEnabled || !preference.enabled) return rowStatus({ featureEnabled, preference, calendar, row: null });

  // 屏障从确定性事实读取前开始持有，既防止注销提交后再外发，也防止账号清理
  // 已完成后才迟到地插入一条 brief 行。
  const withDispatch = dependencies.withActiveUserAiDispatch || withActiveUserAiDispatch;
  return withDispatch(database, userId, async () => {
    const currentPreference = await getDailyBriefPreference(database, userId);
    const currentNow = now || new Date();
    const currentCalendar = resolveCalendar(currentPreference, currentNow);
    if (!currentPreference.enabled)
      return rowStatus({ featureEnabled, preference: currentPreference, calendar: currentCalendar, row: null });
    return generateDailyBriefForActiveUser(
      database,
      { userId, req, now: currentNow, preference: currentPreference, calendar: currentCalendar, featureEnabled },
      dependencies,
    );
  });
}

export async function refreshDailyBrief(
  database = pool,
  { userId, req, now, env = process.env } = {},
  dependencies = {},
) {
  const preference = await getDailyBriefPreference(database, userId);
  const calendar = resolveCalendar(preference, now || new Date());
  const featureEnabled = isDailyBriefFeatureEnabled(env);
  if (!featureEnabled || !preference.enabled) return rowStatus({ featureEnabled, preference, calendar, row: null });

  const withDispatch = dependencies.withActiveUserAiDispatch || withActiveUserAiDispatch;
  return withDispatch(database, userId, async () => {
    const currentPreference = await getDailyBriefPreference(database, userId);
    const currentNow = now || new Date();
    const currentCalendar = resolveCalendar(currentPreference, currentNow);
    if (!currentPreference.enabled)
      return rowStatus({ featureEnabled, preference: currentPreference, calendar: currentCalendar, row: null });
    return generateDailyBriefForActiveUser(
      database,
      {
        userId,
        req,
        now: currentNow,
        preference: currentPreference,
        calendar: currentCalendar,
        featureEnabled,
        refresh: true,
      },
      dependencies,
    );
  });
}

export const dailyBriefServiceInternals = Object.freeze({
  DAILY_BRIEF_VERSION,
  SECTION_TITLES,
  LEASE_SECONDS,
  buildBrief,
  compileFacts,
  hydrateBriefNarrative,
  parseJson,
  resolveCalendar,
  rowStatus,
});
