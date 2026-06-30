import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { buildObjectUrl, createDownloadSignedUrl } from '../util/obsClient.js';
import { getFileExtension, resolveFileCategory } from '../util/fileCategory.js';

function dayLabel(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

function getRecentDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const days = [];
  for (let i = 0; i <= daysSinceMonday; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - daysSinceMonday + i);
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
        (SELECT COUNT(*) FROM files WHERE create_by = ? AND del_flag = 0 AND create_time >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)) AS file
    `,
    [userId, userId, userId],
  );
  return rows[0] || { bookmark: 0, note: 0, file: 0 };
}

async function queryTrend(userId) {
  const days = getRecentDays();
  const [bookmarkRows, noteRows, fileRows] = await Promise.all([
    pool.query(
      `
        SELECT DATE_FORMAT(create_time, '%m-%d') AS day, COUNT(*) AS count
        FROM bookmark
        WHERE user_id = ? AND del_flag = 0 AND create_time >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
        GROUP BY day
      `,
      [userId],
    ),
    pool.query(
      `
        SELECT DATE_FORMAT(COALESCE(update_time, create_time), '%m-%d') AS day, COUNT(*) AS count
        FROM note
        WHERE create_by = ? AND del_flag = 0 AND COALESCE(update_time, create_time) >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
        GROUP BY day
      `,
      [userId],
    ),
    pool.query(
      `
        SELECT DATE_FORMAT(create_time, '%m-%d') AS day, COUNT(*) AS count
        FROM files
        WHERE create_by = ? AND del_flag = 0 AND create_time >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
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
        AND b.name = REPLACE(ol.operation, '点击书签卡片', '')
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
        ) AS fileCount,
        (
          SELECT COUNT(*)
          FROM tag_relations tr
          INNER JOIN tag related ON tr.related_tag_id = related.id AND related.del_flag = 0
          WHERE tr.tag_id = t.id
        ) AS relatedTagCount,
        COALESCE(
          (
            SELECT GROUP_CONCAT(related.name ORDER BY related.sort, related.create_time DESC SEPARATOR '、')
            FROM tag_relations tr
            INNER JOIN tag related ON tr.related_tag_id = related.id AND related.del_flag = 0
            WHERE tr.tag_id = t.id
          ),
          '-'
        ) AS relatedTagNames
      FROM tag t
      WHERE t.user_id = ? AND t.del_flag = 0
      ORDER BY (bookmarkCount + noteCount + fileCount + relatedTagCount) DESC, t.sort, t.create_time DESC
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
    total:
      Number(item.bookmarkCount || 0) +
      Number(item.noteCount || 0) +
      Number(item.fileCount || 0) +
      Number(item.relatedTagCount || 0),
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

export const getWorkbenchSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) return res.send(resultData(null, 400, '缺少用户信息'));

    const [counts, weeklyStats, trend, fileTypeStats, commonBookmarks, hotTags, recentNotes, recentFiles] =
      await Promise.all([
        queryCounts(userId),
        queryWeeklyStats(userId),
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
    res.send(resultData(null, 500, '获取工作台聚合数据失败: ' + error.message));
  }
};
