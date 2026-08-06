import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { buildObjectUrl, createDownloadSignedUrl } from '../util/obsClient.js';
import { getFileExtension, resolveFileCategory } from '../util/fileCategory.js';
import { listTodoPage, queryTodoPendingCount } from '../util/services/todoService.js';
import { listInboxResources } from '../util/resourceInbox.js';

function dayLabel(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

function getRecentDays(totalDays = 30) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = totalDays - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(dayLabel(d));
  }
  return days;
}

function getWeekDaysElapsed() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  return dayOfWeek === 0 ? 7 : dayOfWeek;
}

function buildDayCountMap(rows) {
  const map = {};
  rows.forEach((item) => {
    map[item.day] = Number(item.count || 0);
  });
  return map;
}

function formatFileRecord(file) {
  const category = resolveFileCategory({
    fileName: file.file_name,
    fileType: file.file_type,
  });
  const fileUrl = file.obs_key
    ? createDownloadSignedUrl({ objectKey: file.obs_key, expires: 600 }).url || buildObjectUrl(file.obs_key)
    : file.directory + file.file_name;

  return {
    id: file.id,
    fileName: file.file_name,
    fileType: file.file_type,
    ext: getFileExtension(file.file_name),
    category,
    fileSize: file.file_size,
    fileSizeMB: Number(((file.file_size || 0) / 1024 / 1024).toFixed(2)),
    fileUrl,
    uploadTime: file.create_time,
    folderId: file.folder_id,
    folderName: file.folderName,
    obsKey: file.obs_key,
  };
}

async function queryCounts(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        (SELECT COUNT(*) FROM bookmark WHERE user_id = ? AND del_flag = 0) AS bookmarkTotal,
        (SELECT COUNT(*) FROM tag WHERE user_id = ? AND del_flag = 0) AS tagTotal,
        (SELECT COUNT(*) FROM note WHERE create_by = ? AND del_flag = 0) AS noteTotal,
        (SELECT COUNT(*) FROM files WHERE create_by = ? AND del_flag = 0) AS fileTotal,
        COALESCE((SELECT ROUND(SUM(file_size) / 1048576, 2) FROM files WHERE create_by = ? AND del_flag = 0), 0) AS usedSpace,
        COALESCE((SELECT ROUND(SUM(file_size) / 1048576, 2) FROM files WHERE create_by = ? AND del_flag = 1), 0) AS trashFileSize
    `,
    [userId, userId, userId, userId, userId, userId],
  );
  return rows[0] || {};
}

async function queryWeeklyStats(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        (SELECT COUNT(*) FROM bookmark WHERE user_id = ? AND del_flag = 0 AND create_time >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)) AS bookmark,
        (SELECT COUNT(*) FROM note WHERE create_by = ? AND del_flag = 0 AND COALESCE(update_time, create_time) >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)) AS note,
        (SELECT COUNT(*) FROM files WHERE create_by = ? AND del_flag = 0 AND create_time >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)) AS file,
        (SELECT COUNT(*) FROM tag WHERE user_id = ? AND del_flag = 0 AND create_time >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)) AS tag
    `,
    [userId, userId, userId, userId],
  );
  return rows[0] || { bookmark: 0, note: 0, file: 0, tag: 0 };
}

// 今日行动条目仅取有限数量,完整列表仍由 /inbox 页面承担;
// 任一子查询失败都降级为空数组,不拖垮工作台其余统计。
async function queryTodayActionItems(userId, limits = {}) {
  const {
    overdue: overdueLimit = 3,
    dueToday: dueTodayLimit = 5,
    inbox: inboxLimit = 5,
    // 今日页的摘要要显示真实数量，不能把「最多取 3 条」当成「只有 3 条逾期」
    includeTotal = false,
  } = limits;
  const [overdue, dueToday, inbox] = await Promise.all([
    listTodoPage(pool, userId, {
      status: 'pending',
      due: 'overdue',
      sort: 'due',
      limit: overdueLimit,
      includeTotal,
    }).catch(() => null),
    listTodoPage(pool, userId, {
      status: 'pending',
      due: 'today',
      sort: 'due',
      limit: dueTodayLimit,
      includeTotal,
    }).catch(() => null),
    listInboxResources(pool, { userId, limit: inboxLimit, view: 'summary', includeTotal: false }).catch(() => null),
  ]);
  return {
    overdueTodos: overdue?.items || [],
    dueTodayTodos: dueToday?.items || [],
    inboxItems: inbox?.items || [],
    // includeTotal=false 时 listTodoPage 用返回条数兜底，此处只在显式请求时才当作权威总数
    overdueTotal: includeTotal ? Number(overdue?.total || 0) : null,
    dueTodayTotal: includeTotal ? Number(dueToday?.total || 0) : null,
  };
}

async function queryTodaySummary(userId, actionLimits) {
  const [[rows], todoPendingTotal, actionItems] = await Promise.all([
    pool.query(
      `
        SELECT
          (SELECT COUNT(*) FROM notification
           WHERE user_id = ? AND is_read = 0 AND del_flag = 0) AS unreadNotificationTotal,
          (SELECT COUNT(*) FROM resource_inbox
           WHERE user_id = ? AND status = 'pending') AS inboxPendingTotal
      `,
      [userId, userId],
    ),
    queryTodoPendingCount(pool, userId),
    queryTodayActionItems(userId, actionLimits),
  ]);
  const row = rows[0] || {};
  const inboxPendingTotal = Number(row.inboxPendingTotal || 0);
  return {
    actionTotal: inboxPendingTotal + Number(todoPendingTotal || 0),
    todoPendingTotal: Number(todoPendingTotal || 0),
    unreadNotificationTotal: Number(row.unreadNotificationTotal || 0),
    inboxPendingTotal,
    ...actionItems,
  };
}

async function queryTrend(userId) {
  const days = getRecentDays(30);
  const [bookmarkRows, noteRows, fileRows] = await Promise.all([
    pool.query(
      `
        SELECT DATE_FORMAT(create_time, '%m-%d') AS day, COUNT(*) AS count
        FROM bookmark
        WHERE user_id = ? AND del_flag = 0
          AND create_time >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
          AND create_time < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        GROUP BY day
      `,
      [userId],
    ),
    pool.query(
      `
        SELECT DATE_FORMAT(COALESCE(update_time, create_time), '%m-%d') AS day, COUNT(*) AS count
        FROM note
        WHERE create_by = ? AND del_flag = 0
          AND COALESCE(update_time, create_time) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
          AND COALESCE(update_time, create_time) < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        GROUP BY day
      `,
      [userId],
    ),
    pool.query(
      `
        SELECT DATE_FORMAT(create_time, '%m-%d') AS day, COUNT(*) AS count
        FROM files
        WHERE create_by = ? AND del_flag = 0
          AND create_time >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
          AND create_time < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        GROUP BY day
      `,
      [userId],
    ),
  ]);

  const bookmarkMap = buildDayCountMap(bookmarkRows[0]);
  const noteMap = buildDayCountMap(noteRows[0]);
  const fileMap = buildDayCountMap(fileRows[0]);

  return days.map((day) => ({
    date: day,
    bookmark: bookmarkMap[day] || 0,
    note: noteMap[day] || 0,
    file: fileMap[day] || 0,
  }));
}

async function queryFileTypeStats(userId) {
  const [rows] = await pool.query(
    `
      SELECT file_name, file_type
      FROM files
      WHERE create_by = ? AND del_flag = 0
    `,
    [userId],
  );
  const map = {};
  rows.forEach((item) => {
    const category = resolveFileCategory({
      fileName: item.file_name,
      fileType: item.file_type,
    });
    map[category] = (map[category] || 0) + 1;
  });
  return Object.entries(map).map(([category, value]) => ({ category, value }));
}

async function queryCommonBookmarks(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        b.id,
        b.url,
        REPLACE(ol.operation, '点击书签卡片', '') AS name,
        COUNT(*) AS count
      FROM operation_logs ol
      LEFT JOIN bookmark b
        ON b.user_id = ol.create_by
        AND CONVERT(b.name USING utf8mb4) COLLATE utf8mb4_general_ci =
            CONVERT(REPLACE(ol.operation, '点击书签卡片', '') USING utf8mb4) COLLATE utf8mb4_general_ci
        AND b.del_flag = 0
      WHERE ol.create_by = ? AND ol.operation LIKE '点击书签卡片%'
      GROUP BY ol.operation, b.id, b.url
      ORDER BY count DESC
      LIMIT 10
    `,
    [userId],
  );
  return rows.map((item, index) => ({ ...item, index: index + 1 }));
}

async function queryHotTags(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        t.id,
        t.name,
        (
          SELECT COUNT(*)
          FROM resource_tag_relations tb
          INNER JOIN bookmark b ON tb.resource_id = b.id AND b.del_flag = 0
          WHERE tb.tag_id = t.id AND tb.resource_type = 'bookmark'
        ) AS bookmarkCount,
        (
          SELECT COUNT(*)
          FROM resource_tag_relations tn
          INNER JOIN note n ON tn.resource_id = n.id AND n.del_flag = 0
          WHERE tn.tag_id = t.id AND tn.resource_type = 'note'
        ) AS noteCount,
        (
          SELECT COUNT(*)
          FROM resource_tag_relations tf
          INNER JOIN files f ON tf.resource_id = f.id AND f.del_flag = 0
          WHERE tf.tag_id = t.id AND tf.resource_type = 'file'
        ) AS fileCount
      FROM tag t
      WHERE t.user_id = ? AND t.del_flag = 0
      ORDER BY (bookmarkCount + noteCount + fileCount) DESC, t.sort, t.create_time DESC
      LIMIT 10
    `,
    [userId],
  );
  return rows.map((item, index) => ({
    ...item,
    resourceTotal:
      Number(item.bookmarkCount || 0) +
      Number(item.noteCount || 0) +
      Number(item.fileCount || 0),
    index: index + 1,
  }));
}

async function queryRecentNotes(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        n.id,
        n.title,
        COALESCE(n.update_time, n.create_time) AS updateTime,
        COUNT(ntr.tag_id) AS tagCount
      FROM note n
      LEFT JOIN resource_tag_relations ntr ON n.id = ntr.resource_id AND ntr.resource_type = 'note'
      WHERE n.create_by = ? AND n.del_flag = 0
      GROUP BY n.id
      ORDER BY n.sort, COALESCE(n.update_time, n.create_time) DESC
      LIMIT 10
    `,
    [userId],
  );
  return rows;
}

async function queryRecentFiles(userId) {
  const [rows] = await pool.query(
    `
      SELECT files.*, folders.name AS folderName
      FROM files
      LEFT JOIN folders ON files.folder_id = folders.id
      WHERE files.create_by = ? AND files.del_flag = 0
      ORDER BY files.create_time DESC
      LIMIT 10
    `,
    [userId],
  );
  return rows.map(formatFileRecord);
}

/**
 * 今日页「继续处理」：最近编辑的笔记与最近上传的文件，按活跃时间合并后取前几条。
 *
 * 不复用桌面工作台的近期列表——那两个查询各取 10 条并 JOIN 标签、生成文件签名地址，
 * 而今日页只需要标题和一个可跳转的 ID。高频书签依赖 operation_logs 的 LIKE 聚合，
 * 成本高且语义上属于「常用」而不是「上次做到哪」，第一版不纳入。
 */
async function queryTodayContinueItems(userId, limit = 2) {
  const [noteRows, fileRows] = await Promise.all([
    pool
      .query(
        `SELECT id, title, COALESCE(update_time, create_time) AS activeAt
         FROM note
         WHERE create_by = ? AND del_flag = 0
         ORDER BY COALESCE(update_time, create_time) DESC
         LIMIT ?`,
        [userId, limit],
      )
      .catch(() => [[]]),
    pool
      .query(
        `SELECT id, file_name AS fileName, create_time AS activeAt
         FROM files
         WHERE create_by = ? AND del_flag = 0
         ORDER BY create_time DESC
         LIMIT ?`,
        [userId, limit],
      )
      .catch(() => [[]]),
  ]);

  const notes = (noteRows[0] || []).map((item) => ({
    type: 'note',
    id: String(item.id || ''),
    title: String(item.title || ''),
    activeAt: item.activeAt,
    route: `/noteLibrary/${item.id}`,
  }));
  const files = (fileRows[0] || []).map((item) => ({
    type: 'file',
    id: String(item.id || ''),
    title: String(item.fileName || ''),
    activeAt: item.activeAt,
    route: `/cloudSpace?fileId=${encodeURIComponent(String(item.id || ''))}`,
  }));

  return [...notes, ...files]
    .filter((item) => item.id && item.title)
    .sort((a, b) => new Date(b.activeAt || 0).getTime() - new Date(a.activeAt || 0).getTime())
    .slice(0, limit);
}

/**
 * 移动端「今日」轻量聚合。
 *
 * 移动端今日只回答「我今天先做什么、有哪些资料还没整理」，不展示资源总量、
 * 增长趋势、文件类型分布、常用标签和最近更新，所以不能复用完整工作台接口——
 * 那个接口会额外跑趋势、饼图、排行和最近列表共 8 组查询。
 */
export const getWorkbenchToday = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) return res.send(resultData(null, 400, '缺少用户信息'));

    const [today, continueItems] = await Promise.all([
      queryTodaySummary(userId, { overdue: 3, dueToday: 4, inbox: 3, includeTotal: true }),
      queryTodayContinueItems(userId, 2),
    ]);

    res.send(
      resultData({
        generatedAt: new Date().toISOString(),
        counts: {
          overdue: Number(today.overdueTotal || 0),
          dueToday: Number(today.dueTodayTotal || 0),
          todoPending: today.todoPendingTotal,
          inbox: today.inboxPendingTotal,
          unreadNotification: today.unreadNotificationTotal,
          action: today.actionTotal,
        },
        overdueTodos: today.overdueTodos,
        dueTodayTodos: today.dueTodayTodos,
        inboxItems: today.inboxItems,
        continueItems,
      }),
    );
  } catch (error) {
    console.error('获取今日聚合数据失败:', error);
    res.send(resultData(null, 500, '获取今日数据失败'));
  }
};

export const getWorkbenchSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) return res.send(resultData(null, 400, '缺少用户信息'));

    const [counts, weeklyStats, today, trend, fileTypeStats, commonBookmarks, hotTags, recentNotes, recentFiles] =
      await Promise.all([
        queryCounts(userId),
        queryWeeklyStats(userId),
        queryTodaySummary(userId),
        queryTrend(userId),
        queryFileTypeStats(userId),
        queryCommonBookmarks(userId),
        queryHotTags(userId),
        queryRecentNotes(userId),
        queryRecentFiles(userId),
      ]);

    res.send(
      resultData({
        counts: {
          bookmarkTotal: Number(counts.bookmarkTotal || 0),
          tagTotal: Number(counts.tagTotal || 0),
          noteTotal: Number(counts.noteTotal || 0),
          fileTotal: Number(counts.fileTotal || 0),
          usedSpace: Number(counts.usedSpace || 0),
          trashFileSize: Number(counts.trashFileSize || 0),
        },
        weeklyStats,
        today,
        generatedAt: new Date().toISOString(),
        weekDays: getWeekDaysElapsed(),
        trend,
        fileTypeStats,
        commonBookmarks,
        hotTags,
        recentNotes,
        recentFiles,
      }),
    );
  } catch (error) {
    console.error('获取工作台聚合数据失败:', error);
    res.send(resultData(null, 500, '获取工作台聚合数据失败'));
  }
};
