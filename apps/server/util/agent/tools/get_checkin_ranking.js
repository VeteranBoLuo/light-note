import pool from '../../../db/index.js';
import { INTERNAL_ROLES } from '../../internalRoles.js';
import { withQueryResultMetadata } from '../toolResultMetadata.js';
import { projectAgentTemporalRanges, resolveAgentTimeRange } from '../timeRange.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANKING_TYPES = Object.freeze({
  checkin_days: { label: '签到天数' },
  max_streak: { label: '最长连签' },
  current_streak: { label: '当前连签' },
});

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(Math.max(parsed, 1), 50);
}

function isAllTimeRange(value) {
  const text = String(value || '').trim();
  return !text || text === '全部' || text.toLowerCase() === 'all';
}

function parseOptionalTimeRange(args, slotName, value, fieldName, context) {
  const expression = String(value || '').trim();
  if (isAllTimeRange(expression)) return { expression: '全部', range: null };
  const rangeArgs = String(args?.[slotName] || '').trim() ? args : { ...args, [slotName]: expression };
  const range = resolveAgentTimeRange(rangeArgs, slotName, {
    context,
    required: true,
    label: fieldName,
  });
  return { expression, range };
}

function normalizeRankingType(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'checkin_days';
  const aliases = {
    checkin_days: 'checkin_days',
    total_checkin_days: 'checkin_days',
    max_streak: 'max_streak',
    longest_streak: 'max_streak',
    current_streak: 'current_streak',
  };
  const rankingType = aliases[raw];
  if (!rankingType) throw new Error('签到排行类型不支持');
  return rankingType;
}

function normalizeArgs(args = {}, context = {}) {
  const rankingType = normalizeRankingType(args.rankingType || args.metric || args.type);
  const timeRange = parseOptionalTimeRange(args, 'timeRange', args.timeRange, '签到统计时间', context);
  if (rankingType !== 'checkin_days' && timeRange.range) {
    throw new Error(`${RANKING_TYPES[rankingType].label}仅支持全量排行，不支持按时间范围筛选`);
  }
  const registeredWithin = parseOptionalTimeRange(
    args,
    'registeredWithin',
    args.registeredWithin || args.userRegisteredWithin,
    '用户注册时间',
    context,
  );
  return {
    rankingType,
    timeRange,
    registeredWithin,
    includeInternal: args.includeInternal === true,
    limit: normalizeLimit(args.limit),
  };
}

function formatUtcDayKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function dayInfo(value) {
  const key = String(value || '').trim();
  if (!/^\d{8}$/.test(key)) return null;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(4, 6));
  const day = Number(key.slice(6, 8));
  const local = new Date(year, month - 1, day);
  if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day) return null;
  return { key, ordinal: Math.floor(Date.UTC(year, month - 1, day) / DAY_MS) };
}

function timeRangeBoundaryDay(value) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return matched ? `${matched[1]}${matched[2]}${matched[3]}` : null;
}

function currentBusinessDay(context = {}) {
  const currentDate = String(context?.temporalContext?.currentDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(currentDate)) return currentDate.replaceAll('-', '');
  const todayRange = resolveAgentTimeRange({ timeRange: '今天' }, 'timeRange', {
    context,
    required: true,
    label: '当前日期',
  });
  return timeRangeBoundaryDay(todayRange.localStart || todayRange.start);
}

function previousDayKey(today) {
  const info = dayInfo(today);
  if (!info) return today;
  const date = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(4, 6)) - 1, Number(today.slice(6, 8))) - DAY_MS,
  );
  return formatUtcDayKey(date);
}

function calculateCheckinStats(dayKinds, today) {
  const records = [...dayKinds.entries()]
    .map(([day, isMakeup]) => ({ info: dayInfo(day), isMakeup }))
    .filter((item) => item.info)
    .sort((left, right) => left.info.ordinal - right.info.ordinal);
  const days = records.map((item) => item.info.key);

  let maxStreak = 0;
  let tailStreak = 0;
  let previousOrdinal = null;
  for (const item of records) {
    tailStreak = previousOrdinal !== null && item.info.ordinal === previousOrdinal + 1 ? tailStreak + 1 : 1;
    maxStreak = Math.max(maxStreak, tailStreak);
    previousOrdinal = item.info.ordinal;
  }

  const lastCheckinDate = days.at(-1) || null;
  const activeFrom = previousDayKey(today);
  const currentStreak = lastCheckinDate && lastCheckinDate <= today && lastCheckinDate >= activeFrom ? tailStreak : 0;

  return {
    days,
    totalCheckinDays: days.length,
    maxStreak,
    currentStreak,
    lastCheckinDate,
    checkedInToday: lastCheckinDate === today,
    makeupCheckinDays: records.filter((item) => item.isMakeup).length,
  };
}

function scoreFor(item, rankingType) {
  if (rankingType === 'max_streak') return item.maxStreak;
  if (rankingType === 'current_streak') return item.currentStreak;
  return item.periodCheckinDays ?? item.totalCheckinDays;
}

function rankingTitle(raw) {
  if (raw?.rankingType === 'max_streak') return '历史最长连签排行';
  if (raw?.rankingType === 'current_streak') return '当前连签排行';
  return raw?.timeRange && raw.timeRange !== '全部' ? `${raw.timeRange}签到天数排行` : '累计签到天数排行';
}

function scoreLabel(item, rankingType, timeRange) {
  if (rankingType === 'max_streak') return `最长连签 ${item.maxStreak} 天`;
  if (rankingType === 'current_streak') return `当前连签 ${item.currentStreak} 天`;
  const value = item.periodCheckinDays ?? item.totalCheckinDays;
  return `${timeRange && timeRange !== '全部' ? `${timeRange}签到` : '签到'} ${value} 天`;
}

// 【root】全站签到榜单(只读)。账本是事实源；不以积分、经验或资源创建替代签到。
export default {
  name: 'get_checkin_ranking',
  description:
    '【管理员】查询全站签到排行榜。rankingType=checkin_days 为签到天数排行（可用 timeRange 指定“本周”“本月”“最近30天”，默认累计全部）；max_streak 为历史最长连续签到排行；current_streak 为当前仍未断的连续签到排行。每位上榜用户同时返回累计签到、最长连签、当前连签、最近签到日与补签天数。只统计有效签到账本，默认排除 root/test 和已删除账号。回答“目前签到天数排名”“最长连签排名”“当前连签排名”“本月谁签到最多”必须使用此工具，不能用积分或操作日志代替。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      rankingType: {
        type: 'string',
        enum: ['checkin_days', 'max_streak', 'current_streak'],
        description:
          '排行指标：checkin_days（签到天数，默认）、max_streak（历史最长连签）、current_streak（当前未断连签）',
      },
      timeRange: {
        type: 'string',
        description: '仅 checkin_days 可用：签到日期范围，如“本周”“本月”“最近30天”；默认“全部”统计累计签到天数',
      },
      registeredWithin: {
        type: 'string',
        description: '可选，仅统计在该时间范围内注册的用户，如“本月”；不传则统计全部用户',
      },
      includeInternal: {
        type: 'boolean',
        description: '是否包含 root/test 内部账号，默认 false',
      },
      limit: {
        type: 'integer',
        description: '返回排行榜人数，默认10，最大50',
      },
    },
  },
  requireRoot: true,
  async execute(args = {}, ctx = {}) {
    const normalized = normalizeArgs(args, ctx);
    const userFilters = ['u.del_flag = 0'];
    const params = [];
    if (!normalized.includeInternal) {
      userFilters.push(`(u.role IS NULL OR u.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(', ')}))`);
      params.push(...INTERNAL_ROLES);
    }
    if (normalized.registeredWithin.range) {
      userFilters.push('u.create_time >= ? AND u.create_time < ?');
      params.push(normalized.registeredWithin.range.start, normalized.registeredWithin.range.endExclusive);
    }

    const [rows] = await pool.query(
      `SELECT
         ge.user_id,
         u.alias,
         ge.day,
         CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(ge.meta, '$.protectCard')) = 'true' THEN 1 ELSE 0 END AS is_makeup
       FROM growth_events ge
       INNER JOIN \`user\` u ON u.id = ge.user_id
       WHERE ge.source = 'checkin'
         AND ge.status = 'granted'
         AND ge.day IS NOT NULL
         AND ${userFilters.join(' AND ')}
       ORDER BY ge.user_id ASC, ge.day ASC`,
      params,
    );

    const users = new Map();
    for (const row of rows) {
      const info = dayInfo(row.day);
      if (!info) continue;
      const userId = String(row.user_id || '');
      if (!userId) continue;
      let user = users.get(userId);
      if (!user) {
        user = { userId, alias: String(row.alias || '').trim() || '未设置昵称', dayKinds: new Map() };
        users.set(userId, user);
      }
      user.dayKinds.set(info.key, user.dayKinds.get(info.key) === true || Number(row.is_makeup) === 1);
    }

    const today = currentBusinessDay(ctx);
    const rangeStart = normalized.timeRange.range
      ? timeRangeBoundaryDay(normalized.timeRange.range.localStart || normalized.timeRange.range.start)
      : null;
    const rangeEnd = normalized.timeRange.range
      ? timeRangeBoundaryDay(normalized.timeRange.range.localEnd || normalized.timeRange.range.end)
      : null;
    const allItems = [...users.values()].map((user) => {
      const stats = calculateCheckinStats(user.dayKinds, today);
      const periodDays =
        rangeStart && rangeEnd ? stats.days.filter((day) => day >= rangeStart && day <= rangeEnd) : null;
      const periodMakeupCheckinDays =
        rangeStart && rangeEnd
          ? [...user.dayKinds.entries()].filter(([day, isMakeup]) => day >= rangeStart && day <= rangeEnd && isMakeup)
              .length
          : null;
      return {
        userId: user.userId,
        alias: user.alias,
        ...stats,
        periodCheckinDays: periodDays ? periodDays.length : null,
        periodMakeupCheckinDays,
      };
    });

    const ranked = allItems
      .map((item) => ({ ...item, rankingValue: scoreFor(item, normalized.rankingType) }))
      .filter((item) => item.rankingValue > 0)
      .sort(
        (left, right) =>
          right.rankingValue - left.rankingValue ||
          left.alias.localeCompare(right.alias, 'zh-CN') ||
          left.userId.localeCompare(right.userId),
      );
    for (let index = 0; index < ranked.length; index += 1) {
      ranked[index].rank =
        index === 0 || ranked[index].rankingValue !== ranked[index - 1].rankingValue
          ? index + 1
          : ranked[index - 1].rank;
    }

    const items = ranked.slice(0, normalized.limit);
    return withQueryResultMetadata(
      {
        rankingType: normalized.rankingType,
        timeRange: normalized.timeRange.expression,
        registeredWithin: normalized.registeredWithin.range ? normalized.registeredWithin.expression : null,
        includeInternal: normalized.includeInternal,
        businessDay: today,
        generatedAt: new Date().toISOString(),
        eligibleUserCount: allItems.length,
        rankedUserCount: ranked.length,
        total: ranked.length,
        items,
      },
      {
        resolvedRanges: projectAgentTemporalRanges(args),
        truncationReason: items.length < ranked.length ? 'limit' : null,
      },
    );
  },
  getDependencyRefs(raw) {
    return (raw?.items || []).map((item) => ({ type: 'user', id: item.userId }));
  },
  transform(raw) {
    const title = rankingTitle(raw);
    const items = raw?.items || [];
    if (!items.length) return `${title}：暂无符合条件的有效签到记录。`;
    const lines = items.map((item) => {
      const details = [
        `累计签到 ${item.totalCheckinDays} 天`,
        `最长连签 ${item.maxStreak} 天`,
        `当前连签 ${item.currentStreak} 天`,
        `最近签到 ${item.lastCheckinDate || '无'}`,
        item.checkedInToday ? '今日已签到' : '今日未签到',
      ];
      if (item.periodCheckinDays !== null && item.periodCheckinDays !== undefined) {
        details.splice(1, 0, `${raw.timeRange}签到 ${item.periodCheckinDays} 天`);
      }
      if (item.makeupCheckinDays > 0) details.push(`含补签 ${item.makeupCheckinDays} 天`);
      return `${item.rank}. ${item.alias} — ${scoreLabel(item, raw.rankingType, raw.timeRange)}（${details.join(' · ')}）`;
    });
    const cohort = raw?.registeredWithin ? `；限定${raw.registeredWithin}注册用户` : '';
    return `${title}（${raw.rankedUserCount} 人上榜，统计截至 ${raw.businessDay}${cohort}）：\n${lines.join('\n')}`;
  },
  summarize(raw) {
    const title = rankingTitle(raw);
    const first = raw?.items?.[0];
    if (!first) return `${title}：无记录`;
    return `${title}：${first.alias} 第 1 名，${scoreLabel(first, raw.rankingType, raw.timeRange)}`;
  },
};
