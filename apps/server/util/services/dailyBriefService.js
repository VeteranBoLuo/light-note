import { randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import pool from '../../db/index.js';
import { parseTimeRange, normalizeAgentTimeZone } from '../agent/timeRange.js';
import { executeAiSkill } from '../aiSkill/runtime.js';
import { withActiveUserAiDispatch } from '../aiOutboundDispatchGuard.js';
import { isDailyBriefFeatureEnabled } from '../dailyBriefFeature.js';
import { normalizeTodoLocale } from '../todoDateFormat.js';
import { compileDailyBriefFacts, DAILY_BRIEF_FACT_DEFINITIONS } from './dailyBriefFacts.js';
import { briefFreshness, briefSnapshot } from './dailyBriefFreshness.js';

const DEFAULT_TIMEZONE = 'Asia/Shanghai';
const LEASE_SECONDS = 180;
const DAILY_BRIEF_VERSION = 2;
const DAILY_BRIEF_TEMPLATE_TOKEN = /\{\{([a-z_]+)\.(count|sample)\}\}/gu;
const FACT_DEFINITIONS = DAILY_BRIEF_FACT_DEFINITIONS;

const SECTION_TITLES = Object.freeze({
  'zh-CN': Object.freeze({
    today_actions: '今日行动',
    new_content: '近期新增',
    organize: '待整理',
    recommendation: '一句建议',
    daily_recommendation: '今日建议',
  }),
  'en-US': Object.freeze({
    today_actions: "Today's Actions",
    new_content: 'Recent additions',
    organize: 'To Organize',
    recommendation: 'Suggestion',
    daily_recommendation: 'Daily suggestion',
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
function buildBrief(calendar, facts, narrative) {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const items = (...ids) => ids.map((id) => byId.get(id));
  const titles = SECTION_TITLES[calendar.locale] || SECTION_TITLES['zh-CN'];
  const selected = [...(Array.isArray(narrative.insights) ? narrative.insights : [])];
  const due = byId.get('workshop_due');
  if (due?.count > 0 && due.urgency === 'today' && !selected.some((item) => item.factIds.includes('workshop_due'))) {
    selected.unshift({ factIds: ['workshop_due'], text: '{{workshop_due.sample}}' });
  }
  selected.sort((a, b) => Number(b.factIds.includes('workshop_due')) - Number(a.factIds.includes('workshop_due')));
  let workshopCount = 0;
  const insights = selected
    .filter((item) => !item.factIds.some((id) => id.startsWith('workshop_')) || ++workshopCount <= 2)
    .slice(0, 5)
    .map((insight, index) => {
      const factIds = [...insight.factIds];
      const text = renderNarrativeTemplate(insight.text, byId);
      const connection = factIds.includes('resource_connection') ? byId.get('resource_connection') : null;
      return Object.freeze({
        id: `insight_${index + 1}`,
        text,
        factIds: Object.freeze(factIds),
        ...(factIds.some((id) => id.startsWith('workshop_'))
          ? {
              sources: [
                ...new Map(
                  factIds.flatMap((id) => byId.get(id)?.sources || []).map((s) => [`${s.type}:${s.id}`, s]),
                ).values(),
              ],
            }
          : {}),
        ...(connection?.count
          ? {
              sources: [
                ...connection.sources,
                ...factIds.filter((id) => id.startsWith('workshop_')).flatMap((id) => byId.get(id)?.sources || []),
              ],
              tagName: connection.tagName,
              tagRoute: connection.route,
            }
          : {}),
      });
    });
  const headline = renderNarrativeTemplate(narrative.headline, byId);
  const recommendation = renderNarrativeTemplate(narrative.recommendation, byId);
  return Object.freeze({
    version: DAILY_BRIEF_VERSION,
    date: calendar.date,
    generatedBy: 'ai',
    narrativeHydrated: true,
    headline,
    insights: Object.freeze(insights),
    recommendation,
    sections: Object.freeze([
      Object.freeze({
        id: 'today_actions',
        title: titles.today_actions,
        items: Object.freeze(
          items(
            'todo_overdue',
            'todo_due_today',
            ...facts.filter((fact) => ['workshop_due', 'workshop_next_step'].includes(fact.id)).map((fact) => fact.id),
          ),
        ),
      }),
      Object.freeze({
        id: 'new_content',
        title: titles.new_content,
        items: Object.freeze(
          items(
            'bookmark_created_yesterday',
            ...facts.filter((fact) => fact.id === 'workshop_result').map((fact) => fact.id),
            'note_created_yesterday',
            'file_created_yesterday',
            'bookmark_created_today',
            'note_created_today',
            'file_created_today',
          ),
        ),
      }),
      Object.freeze({
        id: 'organize',
        title: titles.organize,
        items: Object.freeze(items('organize_untagged', 'organize_ai_pending')),
      }),
      Object.freeze({
        id: 'recommendation',
        title: titles.recommendation,
        items: Object.freeze([
          Object.freeze({
            id: 'daily_recommendation',
            label: titles.daily_recommendation,
            text: recommendation,
            factIds: Object.freeze([...new Set(insights.flatMap((insight) => insight.factIds))]),
          }),
        ]),
      }),
    ]),
  });
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
  const parsedBrief = hydrateBriefNarrative(parseJson(row.briefJson ?? row.brief_json, null));
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
  const row = await loadBriefRow(database, userId, calendar.date);
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
  let previousBrief = parseJson(existing?.briefJson);
  if (!previousBrief) {
    // 跨天仍识别长期不变的整理积压；只取最近一次已交付快照，不把昨日正文当今日结果。
    const [previousRows] = await database.query(
      `SELECT brief_json AS briefJson FROM workbench_daily_briefs
        WHERE user_id = ? AND brief_date < ? AND brief_json IS NOT NULL
        ORDER BY brief_date DESC LIMIT 1`,
      [userId, calendar.date],
    );
    previousBrief = parseJson(previousRows[0]?.briefJson);
  }
  const currentSnapshot = briefSnapshot(facts, calendar, now.toISOString());
  const unchangedFactIds = Object.keys(currentSnapshot.factRevisions).filter(
    (id) => currentSnapshot.factRevisions[id] === previousBrief?.snapshot?.factRevisions?.[id],
  );
  const id = randomUUID();
  const leaseToken = randomUUID();
  const previousAttempt = parseJson(existing?.factsJson, {});
  const serializedFacts = JSON.stringify({
    version: 1,
    facts,
    attemptedAt: now.toISOString(),
    automaticAttempts: Number(previousAttempt?.automaticAttempts || 0) + (refresh ? 0 : 1),
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
  try {
    await runSkill(
      {
        protocolVersion: 1,
        requestId: randomUUID(),
        skillId: 'routine.daily_brief',
        skillVersion: 1,
        threadId: null,
        input: {
          date: calendar.date,
          timezone: calendar.timezone,
          locale: calendar.locale,
          facts: facts.map(({ id, label, route, count, samples }) => ({ id, label, route, count, samples })),
          unchangedFactIds,
        },
        scope: { resourceRefs: [] },
        client: { locale: calendar.locale, timezone: calendar.timezone, surface: 'desktop_workbench' },
      },
      req,
      {
        database,
        internalCaller: 'daily_brief_service',
        commitValidatedResult: async ({ response }) => {
          const brief = {
            ...buildBrief(calendar, facts, response.result),
            snapshot: currentSnapshot,
          };
          const [updateResult] = await database.query(
            `UPDATE workbench_daily_briefs
                SET status = 'ready', brief_json = ?, generated_at = NOW(),
                    lease_token = NULL, lease_expires_at = NULL, last_error_code = NULL
              WHERE user_id = ? AND brief_date = ? AND status = 'generating' AND lease_token = ?`,
            [JSON.stringify(brief), userId, calendar.date, leaseToken],
          );
          if (Number(updateResult?.affectedRows || 0) !== 1) {
            throw serviceError('DAILY_BRIEF_LEASE_LOST', '每日简报生成租约已失效', 409);
          }
          committedBrief = brief;
        },
      },
    );
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
  FACT_DEFINITIONS,
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
