import { compileWorkshopBriefFacts } from './dailyBriefWorkshop.js';
import { summarizeUntaggedResources } from './resourceInventoryService.js';
import { compileBriefConnection } from './dailyBriefConnections.js';

// 同时供事实编译器和 internal-only Skill 校验使用，不在 Prompt 维护另一套 ID。
export const DAILY_BRIEF_FACT_DEFINITIONS = Object.freeze([
  ['todo_overdue', '已逾期待办', 'Overdue todos', '/inbox?tab=todo'],
  ['todo_due_today', '今天待办', "Today's todos", '/inbox?tab=todo'],
  ['bookmark_created_yesterday', '昨天新增书签', 'Bookmarks added yesterday', '/home'],
  ['note_created_yesterday', '昨天新增笔记', 'Notes added yesterday', '/noteLibrary'],
  ['file_created_yesterday', '昨天新增文件', 'Files added yesterday', '/cloudSpace'],
  ['bookmark_created_today', '今天新增书签', 'Bookmarks added today', '/home'],
  ['note_created_today', '今天新增笔记', 'Notes added today', '/noteLibrary'],
  ['file_created_today', '今天新增文件', 'Files added today', '/cloudSpace'],
  ['organize_untagged', '待整理的无标签内容', 'Untagged content to organize', '/organize?issue=untagged'],
  ['organize_ai_pending', '待确认的 AI 整理建议', 'AI suggestions to review', '/organize?issue=ai_suggestions'],
]);

export async function compileDailyBriefFacts(database, userId, calendar) {
  const definitions = {
    todo_overdue: {
      table: 'todo_items',
      owner: 'user_id',
      title: 'title',
      order: 'COALESCE(due_at, occurrence_date) ASC, id ASC',
      filter:
        "del_flag = 0 AND status = 'pending' AND ((due_at IS NOT NULL AND due_at < ?) OR (due_at IS NULL AND occurrence_date IS NOT NULL AND occurrence_date < ?))",
      params: [calendar.now, calendar.date],
      revision: 'id, title, due_at, occurrence_date',
    },
    todo_due_today: {
      table: 'todo_items',
      owner: 'user_id',
      title: 'title',
      order: 'COALESCE(due_at, occurrence_date) ASC, id ASC',
      filter:
        "del_flag = 0 AND status = 'pending' AND ((due_at IS NOT NULL AND due_at >= ? AND due_at < ?) OR (due_at IS NULL AND occurrence_date = ?))",
      params: [calendar.now, calendar.todayEnd, calendar.date],
      revision: 'id, title, due_at, occurrence_date',
    },
    organize_ai_pending: {
      table: 'organize_ai_tag_suggestions',
      owner: 'user_id',
      filter: "status = 'pending'",
      params: [],
      revision: 'id',
    },
  };
  for (const [kind, table, owner, title] of [
    ['bookmark', 'bookmark', 'user_id', 'name'],
    ['note', 'note', 'create_by', 'title'],
    ['file', 'files', 'create_by', 'file_name'],
  ]) {
    for (const period of ['yesterday', 'today']) {
      definitions[`${kind}_created_${period}`] = {
        table,
        owner,
        title,
        order: 'create_time DESC, id ASC',
        filter: 'del_flag = 0 AND create_time >= ? AND create_time < ?',
        params:
          period === 'today'
            ? [calendar.todayStart, calendar.todayEnd]
            : [calendar.yesterdayStart, calendar.todayStart],
        revision: `id, ${title}${kind === 'note' ? ', update_time' : ''}`,
      };
    }
  }
  const entries = await Promise.all(
    DAILY_BRIEF_FACT_DEFINITIONS.map(async ([id, zh, en, route]) => {
      let row;
      if (id === 'organize_untagged') {
        row = await summarizeUntaggedResources(database, { userId });
      } else {
        const config = definitions[id];
        const where = `${config.owner} = ? AND ${config.filter}`;
        const params = [userId, ...config.params];
        // 静态白名单 SQL；只聚合元数据，不读取正文。校验和检测同数量下的对象替换/编辑，
        // 不用于权限或身份裁决，也不依赖会被 group_concat_max_len 截断的资源清单。
        const [rows] = await database.query(
          `SELECT COUNT(*) AS total,
                CONCAT(COALESCE(SUM(CRC32(JSON_ARRAY(${config.revision}))), 0), ':',
                       BIT_XOR(CRC32(JSON_ARRAY(${config.revision})))) AS revision
                ${config.title ? `, (SELECT ${config.title} FROM ${config.table} WHERE ${where} ORDER BY ${config.order} LIMIT 1) AS sample` : ''}
           FROM ${config.table} WHERE ${where}`,
          config.title ? [...params, ...params] : params,
        );
        row = rows[0] || {};
      }
      const sample = String(row.sample || '')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, 120);
      return {
        id,
        label: calendar.locale === 'en-US' ? en : zh,
        route,
        count: Math.max(0, Number(row.total || 0)),
        samples: sample ? [sample] : [],
        revision: String(row.revision || ''),
      };
    }),
  );
  return [
    ...entries,
    await compileBriefConnection(database, userId, calendar),
    ...(await compileWorkshopBriefFacts(database, userId, calendar)),
  ];
}
