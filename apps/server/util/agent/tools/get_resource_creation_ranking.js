import pool from '../../../db/index.js';
import { INTERNAL_ROLES } from '../../internalRoles.js';
import { isAllTimeExpression, parseRequiredTimeRange } from '../timeRange.js';

const RESOURCE_TYPES = Object.freeze({
  all: { label: '资源', countColumn: 'total_count', unit: '项' },
  bookmark: { label: '书签', countColumn: 'bookmark_count', unit: '个' },
  note: { label: '笔记', countColumn: 'note_count', unit: '篇' },
  file: { label: '文件', countColumn: 'file_count', unit: '个' },
});

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(Math.max(parsed, 1), 50);
}

function normalizeResourceType(value) {
  const raw = String(value || 'all')
    .trim()
    .toLowerCase();
  const aliases = {
    all: 'all',
    total: 'all',
    resource: 'all',
    resources: 'all',
    全部: 'all',
    所有资源: 'all',
    资源: 'all',
    bookmark: 'bookmark',
    bookmarks: 'bookmark',
    书签: 'bookmark',
    note: 'note',
    notes: 'note',
    笔记: 'note',
    file: 'file',
    files: 'file',
    文件: 'file',
    云空间文件: 'file',
  };
  const resourceType = aliases[raw];
  if (!resourceType) throw new Error('资源排行类型不支持');
  return resourceType;
}

function normalizeArgs(args = {}) {
  const requestedTimeRange = String(args.timeRange || args.resourceTimeRange || args.createdWithin || '').trim();
  if (!requestedTimeRange) throw new Error('资源排行需要明确时间范围');
  const allTime = isAllTimeExpression(requestedTimeRange);
  return {
    timeRange: allTime ? '全部' : requestedTimeRange,
    registeredWithin: String(args.registeredWithin || args.userRegisteredWithin || '').trim(),
    resourceType: normalizeResourceType(args.resourceType),
    includeInternal: args.includeInternal === true,
    limit: normalizeLimit(args.limit),
  };
}

export default {
  name: 'get_resource_creation_ranking',
  appliesToDomains: ['admin', 'content', 'note', 'bookmark', 'file'],
  description:
    '【管理员】按用户统计书签、笔记或云空间文件排行。既支持“昨天谁新增的资源最多”“本周新增内容排行榜”等时间段新增排行，也支持“目前项目的书签数量排行”“当前笔记最多的是谁”等当前有效存量排行。resourceType 指定 all/bookmark/note/file；问当前、目前、累计或总量时必须传 timeRange="全部"。如果用户没有说明当前存量或具体新增时间范围，必须先追问时间口径，不得默认成昨天，也不得调用本工具。不要改查操作日志。如果是在“昨天新增了哪些用户”之后追问这些新用户中谁新增资源最多，同时传 registeredWithin="昨天"限制用户注册范围。',
  routing: {
    targetScope: 'platform',
    requireAny: [
      /(?:书签|笔记|文件|资源|内容).{0,24}(?:最多|排行|排名|榜单|第[一1]名|top\s*\d*)|(?:最多|排行|排名|榜单|第[一1]名|top\s*\d*).{0,24}(?:书签|笔记|文件|资源|内容)/iu,
    ],
    preferAny: [/(?:书签|笔记|文件|资源|内容).{0,24}(?:新增|创建|存量|总量|最多|排行|排名)/iu],
    excludeAny: [/(?:活跃用户|用户活跃|API\s*请求|安全|风险|签到|积分)/iu],
  },
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['timeRange'],
    properties: {
      timeRange: {
        type: 'string',
        description:
          '资源创建时间范围，如“昨天”“今天”“本周”“最近7天”；查询当前存量、目前总量或累计数量时传“全部”。用户未说明时间口径时先追问，禁止省略或猜测',
      },
      resourceType: {
        type: 'string',
        enum: ['all', 'bookmark', 'note', 'file'],
        description: '排行资源类型：all=三类资源总数，bookmark=书签，note=笔记，file=云空间文件；默认 all',
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
    const resourceTime = parseRequiredTimeRange(normalized.timeRange, { label: '资源新增时间', allowAll: true });
    const registeredTime = normalized.registeredWithin
      ? parseRequiredTimeRange(normalized.registeredWithin, { label: '用户注册时间' })
      : null;

    const resourceTimeFilter = resourceTime ? 'AND create_time >= ? AND create_time <= ?' : '';
    const params = resourceTime
      ? [
          resourceTime.start,
          resourceTime.end,
          resourceTime.start,
          resourceTime.end,
          resourceTime.start,
          resourceTime.end,
        ]
      : [];
    const userFilters = ['u.del_flag = 0'];
    const ranking = RESOURCE_TYPES[normalized.resourceType];

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
           ${resourceTimeFilter.replaceAll('create_time', 'bookmark.create_time')}
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
           ${resourceTimeFilter.replaceAll('create_time', 'note.create_time')}
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
           ${resourceTimeFilter.replaceAll('create_time', 'files.create_time')}
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
       HAVING ${ranking.countColumn} > 0
       ORDER BY ${ranking.countColumn} DESC, total_count DESC, bookmark_count DESC, note_count DESC, file_count DESC, u.id ASC
       LIMIT ?`,
      params,
    );

    return {
      timeRange: normalized.timeRange,
      registeredWithin: normalized.registeredWithin || null,
      resourceType: normalized.resourceType,
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
    const resourceType = RESOURCE_TYPES[raw?.resourceType] ? raw.resourceType : 'all';
    const ranking = RESOURCE_TYPES[resourceType];
    const countOf = (item) => Number(item?.[ranking.countColumn.replace('_count', 'Count')] || 0);
    const cohort = raw?.registeredWithin ? `${raw.registeredWithin}注册的用户中，` : '';
    const period =
      raw?.timeRange === '全部'
        ? `当前有效${ranking.label}存量`
        : `${raw?.timeRange || '指定时间段'}${ranking.label}新增`;
    if (!items.length) {
      return `${cohort}${period}没有可排行的数据`;
    }

    const topCount = countOf(items[0]);
    const topUsers = items.filter((item) => countOf(item) === topCount);
    const topSummary =
      topUsers.length === 1
        ? `最多的是 ${topUsers[0].alias || topUsers[0].email || '未知用户'}，共 ${topCount} ${ranking.unit}`
        : `${topUsers.map((item) => item.alias || item.email || '未知用户').join('、')} 并列最多，各 ${topCount} ${ranking.unit}`;
    const lines = items.map((item, index) => {
      const identity = item.alias || '未设置昵称';
      const account = item.email ? ` (${item.email})` : '';
      if (resourceType !== 'all')
        return `${index + 1}. ${identity}${account}：${countOf(item)} ${ranking.unit}${ranking.label}`;
      return `${index + 1}. ${identity}${account}：${item.totalCount} 项（书签 ${item.bookmarkCount}、笔记 ${item.noteCount}、文件 ${item.fileCount}）`;
    });

    return `${cohort}${period}排行：${topSummary}\n${lines.join('\n')}`;
  },
  summarize(raw) {
    const items = raw?.items || [];
    const resourceType = RESOURCE_TYPES[raw?.resourceType] ? raw.resourceType : 'all';
    const ranking = RESOURCE_TYPES[resourceType];
    const countKey = ranking.countColumn.replace('_count', 'Count');
    const period =
      raw?.timeRange === '全部'
        ? `当前有效${ranking.label}存量`
        : `${raw?.timeRange || '指定时间段'}${ranking.label}新增`;
    if (!items.length) return `${period}排行：无记录`;
    const topCount = Number(items[0]?.[countKey] || 0);
    const topNames = items
      .filter((item) => Number(item?.[countKey] || 0) === topCount)
      .map((item) => item.alias || item.email || '未知用户')
      .join('、');
    return `${period}排行：${topNames}最多，共 ${topCount} ${ranking.unit}`;
  },
};
