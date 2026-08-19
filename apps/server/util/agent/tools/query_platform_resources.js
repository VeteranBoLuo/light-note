import pool from '../../../db/index.js';
import { INTERNAL_ROLES } from '../../internalRoles.js';
import { isAllTimeExpression, parseRequiredTimeRange } from '../timeRange.js';

/**
 * 跨用户的平台资源清单。
 *
 * get_resource_creation_ranking 只能回答「谁新增得最多」，追问「那几篇的标题分别是什么」
 * 时没有任何工具能跨用户列明细，模型只能退回 query_notes——那是「我的笔记」作用域，
 * 于是管理员拿到自己的空结果。本工具补的就是这个缺口：同样的统计口径，返回明细而不是计数。
 *
 * 口径必须与 ranking 完全一致（同样排除引导期种子资源与内部账号），否则同一个问题的
 * 「共 5 篇」和逐条清单会对不上，AI 会当场自相矛盾。
 *
 * 只返回标题、归属人和时间，不返回正文——平台级浏览不需要正文，个人资源的正文仍然
 * 只能通过带 user 的 query_notes / query_bookmarks / query_files 按单个用户读取。
 */

const RESOURCE_TYPES = Object.freeze({
  bookmark: { label: '书签', unit: '个' },
  note: { label: '笔记', unit: '篇' },
  file: { label: '云空间文件', unit: '个' },
});

const TYPE_ALIASES = Object.freeze({
  all: 'all',
  total: 'all',
  resource: 'all',
  resources: 'all',
  全部: 'all',
  所有: 'all',
  所有资源: 'all',
  资源: 'all',
  bookmark: 'bookmark',
  bookmarks: 'bookmark',
  书签: 'bookmark',
  收藏: 'bookmark',
  note: 'note',
  notes: 'note',
  笔记: 'note',
  file: 'file',
  files: 'file',
  文件: 'file',
  云空间文件: 'file',
});

function normalizeResourceType(value) {
  const raw = String(value || 'all')
    .trim()
    .toLowerCase();
  const resourceType = TYPE_ALIASES[raw];
  if (!resourceType) throw new Error('平台资源清单类型不支持');
  return resourceType;
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(parsed, 1), 100);
}

function normalizeArgs(args = {}) {
  const requestedTimeRange = String(args.timeRange || args.createdWithin || args.resourceTimeRange || '').trim();
  if (!requestedTimeRange) throw new Error('平台资源清单需要明确时间范围');
  return {
    timeRange: isAllTimeExpression(requestedTimeRange) ? '全部' : requestedTimeRange,
    resourceType: normalizeResourceType(args.resourceType ?? args.type),
    registeredWithin: String(args.registeredWithin || args.userRegisteredWithin || '').trim(),
    includeInternal: args.includeInternal === true,
    limit: normalizeLimit(args.limit),
  };
}

/**
 * 每类资源的字段映射。三张表的归属列和标题列都不同名，UNION 前先统一成
 * resource_type / resource_id / title / owner_id / create_time。
 */
const SOURCES = Object.freeze({
  bookmark: { table: 'bookmark', ownerColumn: 'user_id', titleColumn: 'name', seedType: 'bookmark' },
  note: { table: 'note', ownerColumn: 'create_by', titleColumn: 'title', seedType: 'note' },
  file: { table: 'files', ownerColumn: 'create_by', titleColumn: 'file_name', seedType: 'file' },
});

// bookmark 仍是历史 utf8_general_ci 表，note/files 已是 utf8mb4_unicode_ci。
// MySQL 5.7 不会替 UNION 自动选择兼容排序规则，所有字符串投影必须显式收敛到同一口径。
const UNION_TEXT_COLLATION = 'utf8mb4_unicode_ci';
const ID_EXPRESSION = 'CAST(t.id AS CHAR)';

function asUnionText(expression) {
  return `CONVERT(${expression} USING utf8mb4) COLLATE ${UNION_TEXT_COLLATION}`;
}

function asUnionId(expression) {
  return `CAST(${expression} AS CHAR CHARACTER SET utf8mb4) COLLATE ${UNION_TEXT_COLLATION}`;
}

function buildBranch(kind, time) {
  const source = SOURCES[kind];
  const params = [];
  let where = 't.del_flag = 0';
  if (time) {
    where += ' AND t.create_time >= ? AND t.create_time <= ?';
    params.push(time.start, time.end);
  }
  // 新注册引导塞给用户的示例资源不是用户自己创建的，ranking 同样把它们排除在外。
  where +=
    ` AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources osr` +
    ` WHERE osr.user_id = t.${source.ownerColumn} AND osr.resource_type = ?` +
    ` AND osr.resource_id = ${ID_EXPRESSION})`;
  params.push(source.seedType);
  const sql =
    `SELECT ${asUnionText(`'${kind}'`)} AS resource_type, ${asUnionId('t.id')} AS resource_id,` +
    ` ${asUnionText(`t.${source.titleColumn}`)} AS title,` +
    ` ${asUnionText(`t.${source.ownerColumn}`)} AS owner_id, t.create_time` +
    ` FROM ${source.table} t WHERE ${where}`;
  return { sql, params };
}

function buildUnion(resourceType, time) {
  const kinds = resourceType === 'all' ? Object.keys(SOURCES) : [resourceType];
  const branches = kinds.map((kind) => buildBranch(kind, time));
  return {
    sql: branches.map((branch) => branch.sql).join(' UNION ALL '),
    params: branches.flatMap((branch) => branch.params),
  };
}

export default {
  name: 'query_platform_resources',
  appliesToDomains: ['admin', 'content', 'note', 'bookmark', 'file'],
  description:
    '【管理员】跨用户列出全平台新增的书签/笔记/云空间文件清单，返回每一条的标题、归属用户和创建时间。' +
    '回答“今天平台新增的笔记都有哪些”“这些资源的标题分别是什么”“昨天大家都收藏了什么”这类需要逐条明细、且不限定某一个用户的问题时用它。' +
    'get_resource_creation_ranking 只给每人的数量排行，需要具体标题就用本工具，两者统计口径一致（都不含引导示例资源和内部账号）。' +
    '只查某一位用户自己的资源时用 query_notes / query_bookmarks / query_files 并传 user。' +
    '如果是在“今天新增了哪些用户”之后追问“他们今天新增了哪些资源”，必须同时传 registeredWithin="今天" 与 timeRange="今天"。' +
    '本工具不返回正文内容。timeRange 必填，问累计或当前总量时传“全部”。',
  routing: {
    targetScope: 'platform',
    requireAny: [
      /(?:平台|大家|所有用户|全站|这些用户|他们).{0,28}(?:资源|内容|书签|笔记|文件)/iu,
      /(?:这些|上述|刚才|前面).{0,20}(?:资源|内容|书签|笔记|文件).{0,28}(?:清单|明细|标题|分别是什么|有哪些)/iu,
    ],
    preferAny: [/(?:哪些|清单|明细|标题|分别是什么|都收藏了什么)/iu],
    excludeAny: [/(?:最多|排行|排名|榜单|第[一1]名|top\s*\d*)/iu],
  },
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['timeRange'],
    properties: {
      timeRange: {
        type: 'string',
        description:
          '资源创建时间范围，如“今天”“昨天”“本周”“最近7天”；要全量清单时传“全部”。用户没说时间口径时先追问，禁止猜测',
      },
      resourceType: {
        type: 'string',
        enum: ['all', 'bookmark', 'note', 'file'],
        description: '资源类型：all=三类都要，bookmark=书签，note=笔记，file=云空间文件；默认 all',
      },
      includeInternal: {
        type: 'boolean',
        description: '是否包含 root/test 等内部账号，默认 false',
      },
      registeredWithin: {
        type: 'string',
        description:
          '可选：只列该注册时间段内新增用户创建的资源，例如“今天”“昨天”。用于承接“今天新增了哪些用户”后的追问',
      },
      limit: {
        type: 'integer',
        description: '返回条数，默认30，最大100',
      },
    },
  },
  requireRoot: true,
  async execute(args = {}) {
    const normalized = normalizeArgs(args);
    const time = parseRequiredTimeRange(normalized.timeRange, { label: '资源新增时间', allowAll: true });
    const union = buildUnion(normalized.resourceType, time);

    const userFilters = ['u.del_flag = 0'];
    const userParams = [];
    if (!normalized.includeInternal) {
      userFilters.push(`(u.role IS NULL OR u.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(', ')}))`);
      userParams.push(...INTERNAL_ROLES);
    }
    const registeredTime = normalized.registeredWithin
      ? parseRequiredTimeRange(normalized.registeredWithin, { label: '用户注册时间' })
      : null;
    if (registeredTime) {
      userFilters.push('u.create_time >= ? AND u.create_time <= ?');
      userParams.push(registeredTime.start, registeredTime.end);
    }

    const from =
      `FROM (${union.sql}) resources` +
      // user.id 也来自历史 utf8 表；按二进制 ID 连接可避免再次触发跨排序规则比较。
      ` INNER JOIN \`user\` u ON BINARY u.id = BINARY resources.owner_id` +
      ` WHERE ${userFilters.join(' AND ')}`;

    const [[rows], [countRows]] = await Promise.all([
      pool.query(
        `SELECT resources.resource_type, resources.resource_id, resources.title, resources.create_time,
                u.id AS user_id, u.alias, u.email
           ${from}
          ORDER BY resources.create_time DESC, resources.resource_id ASC
          LIMIT ?`,
        [...union.params, ...userParams, normalized.limit],
      ),
      pool.query(`SELECT COUNT(*) AS total ${from}`, [...union.params, ...userParams]),
    ]);

    return {
      timeRange: normalized.timeRange,
      resourceType: normalized.resourceType,
      includeInternal: normalized.includeInternal,
      registeredWithin: normalized.registeredWithin || null,
      total: Number(countRows[0]?.total || 0),
      items: rows.map((row) => ({
        resourceType: row.resource_type,
        resourceId: String(row.resource_id),
        title: row.title || '',
        createTime: row.create_time,
        userId: row.user_id,
        alias: row.alias,
        email: row.email,
      })),
    };
  },
  transform(raw) {
    const items = raw?.items || [];
    const cohort = raw?.registeredWithin ? `${raw.registeredWithin}注册用户中，` : '';
    const period =
      raw?.timeRange === '全部' ? `${cohort}平台全部` : `${cohort}${raw?.timeRange || '指定时间段'}平台新增`;
    const scope = raw?.resourceType === 'all' ? '资源' : RESOURCE_TYPES[raw.resourceType].label;
    if (!items.length) return `${period}的${scope}：没有记录`;

    // 按归属人分组，让「都是谁的」和「标题分别是什么」能用同一份结果回答。
    const groups = new Map();
    for (const item of items) {
      const key = item.userId || item.email || item.alias || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, { identity: item.alias || '未设置昵称', email: item.email || '', list: [] });
      }
      groups.get(key).list.push(item);
    }

    const lines = [];
    for (const group of groups.values()) {
      const account = group.email ? `（${group.email}）` : '';
      lines.push(`${group.identity}${account}：${group.list.length} 条`);
      for (const item of group.list) {
        const label = RESOURCE_TYPES[item.resourceType]?.label || item.resourceType;
        const time = item.createTime ? new Date(item.createTime).toLocaleString('zh-CN') : '';
        lines.push(`  - [${label}]《${item.title || '无标题'}》 ${time}`);
      }
    }
    const truncated = raw.total > items.length ? `（共 ${raw.total} 条，以下是最近 ${items.length} 条）` : '';
    return `${period}的${scope}：${groups.size} 位用户共 ${raw.total} 条${truncated}\n${lines.join('\n')}`;
  },
  summarize(raw) {
    const items = raw?.items || [];
    const cohort = raw?.registeredWithin ? `${raw.registeredWithin}注册用户中，` : '';
    const period =
      raw?.timeRange === '全部' ? `${cohort}平台全部` : `${cohort}${raw?.timeRange || '指定时间段'}平台新增`;
    const scope = raw?.resourceType === 'all' ? '资源' : RESOURCE_TYPES[raw.resourceType].label;
    if (!items.length) return `${period}${scope}清单：无记录`;
    const owners = new Set(items.map((item) => item.userId));
    return `${period}${scope}清单：${owners.size} 位用户共 ${raw.total} 条，已返回 ${items.length} 条标题`;
  },
};
