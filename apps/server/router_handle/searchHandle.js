import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { resolveFileCategory } from '../util/fileCategory.js';
import { normalizeTagIds, validateUserTags } from '../util/resourceTags.js';
import { ensureNotVisitor } from '../util/auth.js';

const SEARCH_TYPES = ['bookmark', 'note', 'file', 'tag'];
const BATCH_EDITABLE_TYPES = ['bookmark', 'note', 'file'];
const BATCH_DELETE_TYPES = ['bookmark', 'note', 'file', 'tag'];
const RESOURCE_OWNER_SQL = {
  bookmark: `SELECT id FROM bookmark WHERE user_id = ? AND del_flag = 0 AND id IN ({ids})`,
  note: `SELECT id FROM note WHERE create_by = ? AND del_flag = 0 AND id IN ({ids})`,
  file: `SELECT id FROM files WHERE create_by = ? AND del_flag = 0 AND id IN ({ids})`,
  tag: `SELECT id FROM tag WHERE user_id = ? AND del_flag = 0 AND id IN ({ids})`,
};
const TYPE_LABELS = {
  'zh-CN': {
    bookmark: '书签',
    note: '笔记',
    file: '文件',
    tag: '标签',
  },
  'en-US': {
    bookmark: 'Bookmarks',
    note: 'Notes',
    file: 'Files',
    tag: 'Tags',
  },
};

const SEARCH_TEXTS = {
  'zh-CN': {
    unnamedBookmark: '未命名书签',
    unnamedNote: '未命名文档',
    unnamedFile: '未命名文件',
    unnamedTag: '未命名标签',
    openNote: '打开笔记查看正文内容',
    fileInFolder: '位于 {folder}',
    cloudFile: '云空间文件',
    tagDescription: '查看该标签下关联的书签与内容',
    relatedBookmarks: '{count} 个关联内容',
  },
  'en-US': {
    unnamedBookmark: 'Untitled Bookmark',
    unnamedNote: 'Untitled Note',
    unnamedFile: 'Untitled File',
    unnamedTag: 'Untitled Tag',
    openNote: 'Open the note to view its content',
    fileInFolder: 'In {folder}',
    cloudFile: 'Cloud file',
    tagDescription: 'View bookmarks and content associated with this tag',
    relatedBookmarks: '{count} related items',
  },
};

const FILE_CATEGORY_LABELS = {
  'zh-CN': {
    image: '图片',
    video: '视频',
    audio: '音频',
    pdf: 'PDF',
    word: 'Word',
    excel: 'Excel',
    ppt: 'PPT',
    text: '文本',
    compress: '压缩包',
    other: '其他',
  },
  'en-US': {
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    pdf: 'PDF',
    word: 'Word',
    excel: 'Excel',
    ppt: 'PPT',
    text: 'Text',
    compress: 'Compress',
    other: 'Other',
  },
};

function toText(value) {
  return String(value ?? '').trim();
}

function stripHtml(value) {
  return toText(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = toText(value);
  return text.length > 10 ? text.slice(0, 10) : text;
}

function normalizeLimit(value, fallback = 12, max = 5000) {
  const parsed = Number(value);
  if (parsed === 0) return null;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function groupItems(items, lang) {
  const labels = TYPE_LABELS[normalizeLang(lang)];
  return SEARCH_TYPES.map((type) => ({
    type,
    label: labels[type],
    items: items.filter((item) => item.type === type),
  })).filter((group) => group.items.length > 0);
}

function buildLike(keyword) {
  return `%${keyword}%`;
}

function normalizeLang(value) {
  return value === 'en-US' ? 'en-US' : 'zh-CN';
}

function formatFileSizeMb(value) {
  if (!value) return '';
  return `${(Number(value) / 1024 / 1024).toFixed(2)} MB`;
}

function formatFileSearchExtra(item, lang) {
  const category = resolveFileCategory({
    fileName: item.file_name,
    fileType: item.file_type,
  });
  const categoryLabel = FILE_CATEGORY_LABELS[normalizeLang(lang)][category] || FILE_CATEGORY_LABELS['zh-CN'].other;
  const size = formatFileSizeMb(item.file_size);
  return [categoryLabel, size].filter(Boolean).join(' · ');
}

function getSearchText(lang) {
  return SEARCH_TEXTS[normalizeLang(lang)];
}

function formatText(template, params = {}) {
  return Object.entries(params).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template);
}

async function queryGlobalTypeTotals(userId) {
  const [bookmarkRows, noteRows, fileRows, tagRows] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM bookmark WHERE user_id = ? AND del_flag = 0`, [userId]),
    pool.query(`SELECT COUNT(*) AS total FROM note WHERE create_by = ? AND del_flag = 0`, [userId]),
    pool.query(`SELECT COUNT(*) AS total FROM files WHERE create_by = ? AND del_flag = 0`, [userId]),
    pool.query(`SELECT COUNT(*) AS total FROM tag WHERE user_id = ? AND del_flag = 0`, [userId]),
  ]);
  return {
    bookmark: Number(bookmarkRows?.[0]?.[0]?.total || 0),
    note: Number(noteRows?.[0]?.[0]?.total || 0),
    file: Number(fileRows?.[0]?.[0]?.total || 0),
    tag: Number(tagRows?.[0]?.[0]?.total || 0),
  };
}

function normalizeBatchAction(value) {
  return value === 'remove' ? 'remove' : value === 'add' ? 'add' : '';
}

function normalizeBatchItems(items = []) {
  if (!Array.isArray(items)) return [];
  const merged = new Map();
  items.forEach((item) => {
    const type = toText(item?.type);
    const id = toText(item?.id);
    if (!BATCH_EDITABLE_TYPES.includes(type) || !id) return;
    merged.set(`${type}:${id}`, { type, id });
  });
  return Array.from(merged.values());
}

function normalizeBatchDeleteItems(items = []) {
  if (!Array.isArray(items)) return [];
  const merged = new Map();
  items.forEach((item) => {
    const type = toText(item?.type);
    const id = toText(item?.id);
    if (!BATCH_DELETE_TYPES.includes(type) || !id) return;
    merged.set(`${type}:${id}`, { type, id });
  });
  return Array.from(merged.values());
}

async function queryValidResourceIds(connection, { userId, type, ids = [] }) {
  if (!ids.length || !RESOURCE_OWNER_SQL[type]) return [];
  const placeholders = ids.map(() => '?').join(',');
  const sql = RESOURCE_OWNER_SQL[type].replace('{ids}', placeholders);
  const [rows] = await connection.query(sql, [userId, ...ids]);
  return rows.map((row) => toText(row.id)).filter(Boolean);
}

async function queryExistingRelationCount(connection, { userId, type, resourceIds = [], tagIds = [] }) {
  if (!resourceIds.length || !tagIds.length) return 0;
  const resourcePlaceholders = resourceIds.map(() => '?').join(',');
  const tagPlaceholders = tagIds.map(() => '?').join(',');
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS total
      FROM resource_tag_relations
      WHERE user_id = ?
        AND resource_type = ?
        AND resource_id IN (${resourcePlaceholders})
        AND tag_id IN (${tagPlaceholders})
    `,
    [userId, type, ...resourceIds, ...tagIds],
  );
  return Number(rows?.[0]?.total || 0);
}

async function insertRelations(connection, { userId, type, resourceIds = [], tagIds = [] }) {
  if (!resourceIds.length || !tagIds.length) return 0;
  const values = [];
  resourceIds.forEach((resourceId) => {
    tagIds.forEach((tagId) => {
      values.push([tagId, type, resourceId, userId, 'manual']);
    });
  });
  if (!values.length) return 0;
  const [result] = await connection.query(
    `INSERT IGNORE INTO resource_tag_relations (tag_id, resource_type, resource_id, user_id, source) VALUES ?`,
    [values],
  );
  return Number(result?.affectedRows || 0);
}

async function removeRelations(connection, { userId, type, resourceIds = [], tagIds = [] }) {
  if (!resourceIds.length || !tagIds.length) return 0;
  const resourcePlaceholders = resourceIds.map(() => '?').join(',');
  const tagPlaceholders = tagIds.map(() => '?').join(',');
  const [result] = await connection.query(
    `
      DELETE FROM resource_tag_relations
      WHERE user_id = ?
        AND resource_type = ?
        AND resource_id IN (${resourcePlaceholders})
        AND tag_id IN (${tagPlaceholders})
    `,
    [userId, type, ...resourceIds, ...tagIds],
  );
  return Number(result?.affectedRows || 0);
}

async function queryBookmarks(userId, keyword, limit, lang) {
  const text = getSearchText(lang);
  const like = buildLike(keyword);
  const hasKeyword = keyword.length > 0;
  const sql = `
    SELECT
      b.*,
      (
        SELECT JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'name', t.name))
        FROM tag t
        INNER JOIN resource_tag_relations tb
          ON t.id = tb.tag_id AND tb.resource_type = 'bookmark'
        WHERE tb.resource_id = b.id AND t.del_flag = 0
      ) AS tag_list
    FROM bookmark b
    WHERE b.user_id = ?
      AND b.del_flag = 0
      AND (
        ? = 0
        OR b.name LIKE ?
        OR b.description LIKE ?
        OR b.url LIKE ?
        OR EXISTS (
          SELECT 1
          FROM resource_tag_relations tb2
          INNER JOIN tag t2 ON tb2.tag_id = t2.id
          WHERE tb2.resource_id = b.id
            AND tb2.resource_type = 'bookmark'
            AND t2.del_flag = 0
            AND t2.name LIKE ?
        )
      )
    ORDER BY b.sort, b.create_time DESC
    ${limit ? 'LIMIT ?' : ''}
  `;
  const params = [userId, hasKeyword ? 1 : 0, like, like, like, like];
  if (limit) params.push(limit);
  const [rows] = await pool.query(sql, params);
  return rows.map((item) => ({
    id: toText(item.id),
    type: 'bookmark',
    title: toText(item.name) || text.unnamedBookmark,
    description: toText(item.description) || toText(item.url),
    extra: Array.isArray(item.tag_list) ? item.tag_list.map((tag) => `#${tag.name}`).join(' ') : '',
    url: toText(item.url),
    route: '/home',
    iconUrl: item.icon_url || (item.url ? `https://ico.kucat.cn/get.php?url=${item.url}` : ''),
    raw: item,
  }));
}

async function queryNotes(userId, keyword, limit, lang) {
  const text = getSearchText(lang);
  const like = buildLike(keyword);
  const hasKeyword = keyword.length > 0;
  const sql = `
    SELECT
      n.*,
      (
        SELECT JSON_ARRAYAGG(JSON_OBJECT('id', nt.id, 'name', nt.name))
        FROM resource_tag_relations ntr
        INNER JOIN tag nt ON ntr.tag_id = nt.id
        WHERE ntr.resource_type = 'note'
          AND ntr.resource_id = n.id
          AND nt.del_flag = 0
      ) AS tags
    FROM note n
    WHERE n.create_by = ?
      AND n.del_flag = 0
      AND (? = 0 OR n.title LIKE ? OR n.content LIKE ?)
    ORDER BY n.sort, n.update_time DESC
    ${limit ? 'LIMIT ?' : ''}
  `;
  const params = [userId, hasKeyword ? 1 : 0, like, like];
  if (limit) params.push(limit);
  const [rows] = await pool.query(sql, params);
  return rows.map((item) => ({
    id: toText(item.id),
    type: 'note',
    title: toText(item.title) || text.unnamedNote,
    description: stripHtml(item.content).slice(0, 140) || text.openNote,
    extra: normalizeDate(item.update_time || item.create_time),
    route: `/noteLibrary/${item.id}`,
    raw: item,
  }));
}

async function queryFiles(userId, keyword, limit, lang) {
  const text = getSearchText(lang);
  const like = buildLike(keyword);
  const hasKeyword = keyword.length > 0;
  const sql = `
    SELECT files.*, folders.name AS folder_name
    FROM files
    LEFT JOIN folders ON files.folder_id = folders.id
    WHERE files.create_by = ?
      AND files.del_flag = 0
      AND (? = 0 OR files.file_name LIKE ? OR files.file_type LIKE ? OR folders.name LIKE ?)
    ORDER BY files.create_time DESC
    ${limit ? 'LIMIT ?' : ''}
  `;
  const params = [userId, hasKeyword ? 1 : 0, like, like, like];
  if (limit) params.push(limit);
  const [rows] = await pool.query(sql, params);
  return rows.map((item) => ({
    id: toText(item.id),
    type: 'file',
    title: toText(item.file_name) || text.unnamedFile,
    description: item.folder_name ? formatText(text.fileInFolder, { folder: item.folder_name }) : text.cloudFile,
    category: resolveFileCategory({
      fileName: item.file_name,
      fileType: item.file_type,
    }),
    extra: formatFileSearchExtra(item, lang),
    route: '/cloudSpace',
    raw: item,
  }));
}

async function queryTags(userId, keyword, limit, lang) {
  const text = getSearchText(lang);
  const like = buildLike(keyword);
  const hasKeyword = keyword.length > 0;
  const sql = `
    SELECT t.*, COUNT(r.resource_id) AS resource_count
    FROM tag t
    LEFT JOIN resource_tag_relations r ON t.id = r.tag_id
    WHERE t.user_id = ?
      AND t.del_flag = 0
      AND (? = 0 OR t.name LIKE ?)
    GROUP BY t.id
    ORDER BY t.sort, t.create_time DESC
    ${limit ? 'LIMIT ?' : ''}
  `;
  const params = [userId, hasKeyword ? 1 : 0, like];
  if (limit) params.push(limit);
  const [rows] = await pool.query(sql, params);
  return rows.map((item) => ({
    id: toText(item.id),
    type: 'tag',
    title: `#${toText(item.name) || text.unnamedTag}`,
    description: text.tagDescription,
    extra: formatText(text.relatedBookmarks, { count: Number(item.resource_count || 0) }),
    route: `/tag/${item.id}`,
    iconUrl: item.icon_url,
    raw: item,
  }));
}

export const globalSearch = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) return res.send(resultData(null, 400, '缺少用户信息'));

    const keyword = toText(req.body?.keyword || req.body?.filters?.keyword);
    const limitPerType = normalizeLimit(req.body?.limitPerType ?? req.body?.pageSize, 12);
    const lang = normalizeLang(req.headers['x-lang']);

    const [bookmarks, notes, files, tags, typeTotals] = await Promise.all([
      queryBookmarks(userId, keyword, limitPerType, lang),
      queryNotes(userId, keyword, limitPerType, lang),
      queryFiles(userId, keyword, limitPerType, lang),
      queryTags(userId, keyword, limitPerType, lang),
      queryGlobalTypeTotals(userId),
    ]);

    const items = [...bookmarks, ...notes, ...files, ...tags];
    res.send(
      resultData({
        keyword,
        items,
        groups: groupItems(items, lang),
        total: items.length,
        typeTotals,
      }),
    );
  } catch (error) {
    console.error('统一搜索失败:', error);
    res.send(resultData(null, 500, '统一搜索失败: ' + error.message));
  }
};

export const batchUpdateResourceTags = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.send(resultData(null, 401, '请先登录'));
    }

    const action = normalizeBatchAction(req.body?.action);
    const tagIds = normalizeTagIds(req.body?.tagIds || []);
    const items = normalizeBatchItems(req.body?.items || []);

    if (!action) {
      return res.send(resultData(null, 400, '缺少有效操作类型'));
    }
    if (!items.length) {
      return res.send(resultData(null, 400, '未选择可编辑资源'));
    }
    if (!tagIds.length) {
      return res.send(resultData(null, 400, '请至少选择一个标签'));
    }

    await connection.beginTransaction();
    const validTagIds = await validateUserTags(connection, { tagIds, userId });
    const grouped = {
      bookmark: [],
      note: [],
      file: [],
    };
    items.forEach((item) => grouped[item.type].push(item.id));

    const typeStats = [];
    let affectedRelationCount = 0;
    let existingRelationCount = 0;
    let validItemCount = 0;

    for (const type of BATCH_EDITABLE_TYPES) {
      const requestedIds = grouped[type];
      if (!requestedIds.length) continue;
      const validIds = await queryValidResourceIds(connection, { userId, type, ids: requestedIds });
      validItemCount += validIds.length;
      const totalPairs = validIds.length * validTagIds.length;
      let affected = 0;
      let existed = 0;

      if (totalPairs > 0) {
        existed = await queryExistingRelationCount(connection, {
          userId,
          type,
          resourceIds: validIds,
          tagIds: validTagIds,
        });
        if (action === 'add') {
          affected = await insertRelations(connection, { userId, type, resourceIds: validIds, tagIds: validTagIds });
        } else {
          affected = await removeRelations(connection, { userId, type, resourceIds: validIds, tagIds: validTagIds });
        }
      }

      affectedRelationCount += affected;
      existingRelationCount += existed;
      typeStats.push({
        type,
        requestedCount: requestedIds.length,
        validCount: validIds.length,
        affectedRelationCount: affected,
      });
    }

    await connection.commit();

    const totalPairs = validItemCount * validTagIds.length;
    const skippedRelationCount =
      action === 'add'
        ? Math.max(totalPairs - affectedRelationCount, 0)
        : Math.max(totalPairs - existingRelationCount, 0);

    res.send(
      resultData({
        action,
        requestedItemCount: items.length,
        validItemCount,
        invalidItemCount: Math.max(items.length - validItemCount, 0),
        requestedTagCount: tagIds.length,
        validTagCount: validTagIds.length,
        affectedRelationCount,
        skippedRelationCount,
        typeStats,
      }),
    );
  } catch (error) {
    await connection.rollback();
    res.send(resultData(null, 500, '批量更新资源标签失败: ' + error.message));
  } finally {
    connection.release();
  }
};

export const getBatchResourceTagWorkspace = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.send(resultData(null, 401, '请先登录'));
    }

    const items = normalizeBatchItems(req.body?.items || []);
    if (!items.length) {
      return res.send(resultData(null, 400, '未选择可编辑资源'));
    }

    const grouped = {
      bookmark: [],
      note: [],
      file: [],
    };
    items.forEach((item) => grouped[item.type].push(item.id));

    const resourceTagsMap = {};
    const tagDedup = new Map();

    for (const type of BATCH_EDITABLE_TYPES) {
      const requestedIds = grouped[type];
      if (!requestedIds.length) continue;
      const validIds = await queryValidResourceIds(connection, { userId, type, ids: requestedIds });
      if (!validIds.length) continue;
      const placeholders = validIds.map(() => '?').join(',');
      const [rows] = await connection.query(
        `
          SELECT
            r.resource_id AS resourceId,
            t.id AS tagId,
            t.name AS tagName
          FROM resource_tag_relations r
          INNER JOIN tag t ON t.id = r.tag_id
          WHERE r.user_id = ?
            AND r.resource_type = ?
            AND r.resource_id IN (${placeholders})
            AND t.user_id = ?
            AND t.del_flag = 0
          ORDER BY t.sort, t.create_time DESC
        `,
        [userId, type, ...validIds, userId],
      );

      rows.forEach((row) => {
        const key = `${type}:${toText(row.resourceId)}`;
        if (!resourceTagsMap[key]) resourceTagsMap[key] = [];
        const tagItem = { id: toText(row.tagId), name: toText(row.tagName) };
        resourceTagsMap[key].push(tagItem);
        if (tagItem.id && !tagDedup.has(tagItem.id)) {
          tagDedup.set(tagItem.id, tagItem);
        }
      });
    }

    const [allTags] = await connection.query(
      `
        SELECT id, name
        FROM tag
        WHERE user_id = ? AND del_flag = 0
        ORDER BY sort, create_time DESC
      `,
      [userId],
    );

    res.send(
      resultData({
        items,
        resourceTagsMap,
        selectedResourceTags: Array.from(tagDedup.values()),
        allTags: allTags.map((tag) => ({ id: toText(tag.id), name: toText(tag.name) })),
      }),
    );
  } catch (error) {
    res.send(resultData(null, 500, '获取批量标签工作台数据失败: ' + error.message));
  } finally {
    connection.release();
  }
};

export const batchDeleteResources = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.send(resultData(null, 401, '请先登录'));
    }

    const items = normalizeBatchDeleteItems(req.body?.items || []);
    if (!items.length) {
      return res.send(resultData(null, 400, '未选择可删除资源'));
    }

    const grouped = {
      bookmark: [],
      note: [],
      file: [],
      tag: [],
    };
    items.forEach((item) => grouped[item.type].push(item.id));

    await connection.beginTransaction();

    const typeStats = [];
    let affectedItemCount = 0;
    let validItemCount = 0;

    for (const type of BATCH_DELETE_TYPES) {
      const requestedIds = grouped[type];
      if (!requestedIds.length) continue;

      const validIds = await queryValidResourceIds(connection, { userId, type, ids: requestedIds });
      validItemCount += validIds.length;
      if (!validIds.length) {
        typeStats.push({
          type,
          requestedCount: requestedIds.length,
          validCount: 0,
          affectedItemCount: 0,
        });
        continue;
      }

      const placeholders = validIds.map(() => '?').join(',');
      let result = { affectedRows: 0 };
      if (type === 'bookmark') {
        [result] = await connection.query(
          `UPDATE bookmark SET del_flag = 1, deleted_at = NOW(), icon_url = NULL
           WHERE id IN (${placeholders}) AND user_id = ? AND del_flag = 0`,
          [...validIds, userId],
        );
      } else if (type === 'note') {
        [result] = await connection.query(
          `UPDATE note SET del_flag = 1, deleted_at = NOW()
           WHERE id IN (${placeholders}) AND create_by = ? AND del_flag = 0`,
          [...validIds, userId],
        );
      } else if (type === 'file') {
        [result] = await connection.query(
          `UPDATE files SET del_flag = 1, deleted_at = NOW()
           WHERE id IN (${placeholders}) AND create_by = ? AND del_flag = 0`,
          [...validIds, userId],
        );
      } else if (type === 'tag') {
        await connection.query(`DELETE FROM resource_tag_relations WHERE tag_id IN (${placeholders})`, validIds);
        await connection.query(
          `DELETE FROM tag_relations WHERE tag_id IN (${placeholders}) OR related_tag_id IN (${placeholders})`,
          [...validIds, ...validIds],
        );
        [result] = await connection.query(
          `DELETE FROM tag
           WHERE id IN (${placeholders}) AND user_id = ? AND del_flag = 0`,
          [...validIds, userId],
        );
      }

      const affected = Number(result?.affectedRows || 0);
      affectedItemCount += affected;
      typeStats.push({
        type,
        requestedCount: requestedIds.length,
        validCount: validIds.length,
        affectedItemCount: affected,
      });
    }

    await connection.commit();
    res.send(
      resultData({
        requestedItemCount: items.length,
        validItemCount,
        invalidItemCount: Math.max(items.length - validItemCount, 0),
        affectedItemCount,
        typeStats,
      }),
    );
  } catch (error) {
    await connection.rollback();
    res.send(resultData(null, 500, '批量删除资源失败: ' + error.message));
  } finally {
    connection.release();
  }
};
