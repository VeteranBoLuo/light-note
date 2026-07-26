import pool from '../../../db/index.js';
import { INTERNAL_ROLES } from '../../internalRoles.js';
import { parseTimeRange } from '../timeRange.js';

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(Math.max(parsed, 1), 50);
}

function parseRequiredTimeRange(value, fieldName) {
  const expression = String(value || '').trim();
  const time = parseTimeRange(expression);
  if (!time) {
    throw new Error(`${fieldName === 'registeredWithin' ? '用户注册' : '资源新增'}时间范围无法识别`);
  }
  return time;
}

function normalizeArgs(args = {}) {
  return {
    timeRange: String(args.timeRange || args.resourceTimeRange || args.createdWithin || '昨天').trim(),
    registeredWithin: String(args.registeredWithin || args.userRegisteredWithin || '').trim(),
    includeInternal: args.includeInternal === true,
    limit: normalizeLimit(args.limit),
  };
}

export default {
  name: 'get_resource_creation_ranking',
  description:
    '【管理员】按用户汇总指定时间段内实际新增的书签、笔记和云空间文件，并按总数降序排行。回答“昨天谁新增的资源最多”“本周新增内容排行榜”必须用此工具，不要改查操作日志。timeRange 表示资源创建时间；如果是在“昨天新增了哪些用户”之后追问这些新用户中谁新增资源最多，同时传 registeredWithin="昨天"限制用户注册范围。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      timeRange: {
        type: 'string',
        description: '资源创建时间范围，如“昨天”“今天”“本周”“最近7天”，默认“昨天”',
      },
      registeredWithin: {
        type: 'string',
        description: '可选，只统计在该时间范围内注册的用户；用于“昨天新增的用户中谁新增资源最多”',
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
  async execute(args = {}) {
    const normalized = normalizeArgs(args);
    const resourceTime = parseRequiredTimeRange(normalized.timeRange, 'timeRange');
    const registeredTime = normalized.registeredWithin
      ? parseRequiredTimeRange(normalized.registeredWithin, 'registeredWithin')
      : null;

    const params = [
      resourceTime.start,
      resourceTime.end,
      resourceTime.start,
      resourceTime.end,
      resourceTime.start,
      resourceTime.end,
    ];
    const userFilters = ['u.del_flag = 0'];

    if (!normalized.includeInternal) {
      userFilters.push(`(u.role IS NULL OR u.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(', ')}))`);
      params.push(...INTERNAL_ROLES);
    }
    if (registeredTime) {
      userFilters.push('u.create_time >= ? AND u.create_time <= ?');
      params.push(registeredTime.start, registeredTime.end);
    }

    params.push(normalized.limit);
    const [rows] = await pool.query(
      `SELECT
         u.id AS user_id,
         u.alias,
         u.email,
         SUM(resource_counts.bookmark_count) AS bookmark_count,
         SUM(resource_counts.note_count) AS note_count,
         SUM(resource_counts.file_count) AS file_count,
         SUM(resource_counts.bookmark_count + resource_counts.note_count + resource_counts.file_count) AS total_count
       FROM (
         SELECT
           bookmark.user_id AS user_id,
           COUNT(*) AS bookmark_count,
           0 AS note_count,
           0 AS file_count
         FROM bookmark
         WHERE bookmark.del_flag = 0
           AND bookmark.create_time >= ?
           AND bookmark.create_time <= ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = bookmark.user_id
               AND osr.resource_type = 'bookmark'
               AND osr.resource_id = bookmark.id
           )
         GROUP BY bookmark.user_id
         UNION ALL
         SELECT
           note.create_by AS user_id,
           0 AS bookmark_count,
           COUNT(*) AS note_count,
           0 AS file_count
         FROM note
         WHERE note.del_flag = 0
           AND note.create_time >= ?
           AND note.create_time <= ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = note.create_by
               AND osr.resource_type = 'note'
               AND osr.resource_id = note.id
           )
         GROUP BY note.create_by
         UNION ALL
         SELECT
           files.create_by AS user_id,
           0 AS bookmark_count,
           0 AS note_count,
           COUNT(*) AS file_count
         FROM files
         WHERE files.del_flag = 0
           AND files.create_time >= ?
           AND files.create_time <= ?
           AND NOT EXISTS (
             SELECT 1 FROM onboarding_seed_resources osr
             WHERE osr.user_id = files.create_by
               AND osr.resource_type = 'file'
               AND osr.resource_id = CAST(files.id AS CHAR)
           )
         GROUP BY files.create_by
       ) resource_counts
       INNER JOIN \`user\` u ON u.id = resource_counts.user_id
       WHERE ${userFilters.join(' AND ')}
       GROUP BY u.id, u.alias, u.email
       ORDER BY total_count DESC, bookmark_count DESC, note_count DESC, file_count DESC, u.id ASC
       LIMIT ?`,
      params,
    );

    return {
      timeRange: normalized.timeRange,
      registeredWithin: normalized.registeredWithin || null,
      includeInternal: normalized.includeInternal,
      items: rows.map((row) => ({
        userId: row.user_id,
        alias: row.alias,
        email: row.email,
        bookmarkCount: Number(row.bookmark_count || 0),
        noteCount: Number(row.note_count || 0),
        fileCount: Number(row.file_count || 0),
        totalCount: Number(row.total_count || 0),
      })),
    };
  },
  transform(raw) {
    const items = raw?.items || [];
    const cohort = raw?.registeredWithin ? `${raw.registeredWithin}注册的用户中，` : '';
    if (!items.length) {
      return `${cohort}${raw?.timeRange || '指定时间段'}没有用户新增有效书签、笔记或文件`;
    }

    const topCount = items[0].totalCount;
    const topUsers = items.filter((item) => item.totalCount === topCount);
    const topSummary =
      topUsers.length === 1
        ? `新增最多的是 ${topUsers[0].alias || topUsers[0].email || '未知用户'}，共 ${topCount} 项`
        : `${topUsers.map((item) => item.alias || item.email || '未知用户').join('、')} 并列最多，各 ${topCount} 项`;
    const lines = items.map((item, index) => {
      const identity = item.alias || '未设置昵称';
      const account = item.email ? ` (${item.email})` : '';
      return `${index + 1}. ${identity}${account}：${item.totalCount} 项（书签 ${item.bookmarkCount}、笔记 ${item.noteCount}、文件 ${item.fileCount}）`;
    });

    return `${cohort}${raw.timeRange}资源新增排行：${topSummary}\n${lines.join('\n')}`;
  },
  summarize(raw) {
    const items = raw?.items || [];
    if (!items.length) return `资源新增排行：${raw?.timeRange || '指定时间段'}无记录`;
    const topCount = items[0].totalCount;
    const topNames = items
      .filter((item) => item.totalCount === topCount)
      .map((item) => item.alias || item.email || '未知用户')
      .join('、');
    return `资源新增排行：${topNames}最多，共 ${topCount} 项`;
  },
};
