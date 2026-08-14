import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { getFileExtension, resolveFileCategory } from '../util/fileCategory.js';
import { getDerivedRelatedTags } from '../util/services/tagRelationService.js';
import { computeTagSimilarity } from '../util/tagRelationScore.js';

const DEFAULT_LIMIT_RELATED_TAGS = 12;
const DEFAULT_LIMIT_PER_TYPE = 20;
const MAX_LIMIT = 50;
const ALLOWED_RESOURCE_TYPES = ['bookmark', 'note', 'file'];

const toNodeId = (type, rawId) => `${type}:${rawId}`;

function clampLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getNodeSize(type, weight = 0, isCenter = false) {
  if (isCenter) return 64;
  if (type === 'tag') return Math.max(30, Math.min(52, 30 + Number(weight || 0) * 2));
  if (type === 'note') return 32;
  return 30;
}

function normalizeResourceTypes(resourceTypes) {
  if (!Array.isArray(resourceTypes)) return ALLOWED_RESOURCE_TYPES;
  const safeTypes = resourceTypes.filter((type) => ALLOWED_RESOURCE_TYPES.includes(type));
  return safeTypes.length ? safeTypes : ALLOWED_RESOURCE_TYPES;
}

async function queryCenterTag(userId, tagId) {
  const [rows] = await pool.query(
    `SELECT id, name, icon_url
     FROM tag
     WHERE id = ? AND user_id = ? AND del_flag = 0
     LIMIT 1`,
    [tagId, userId],
  );
  return rows[0] || null;
}

/**
 * 单标签图谱的相邻标签:与标签详情、全局知识地图共用 tagRelationService 的共现推导与评分,
 * 不再混合已下线的手工 tag_relations,避免同一份数据在不同入口给出不同结论。
 */
async function queryRelatedTags(userId, tagId, limit) {
  return getDerivedRelatedTags(pool, { userId, tagId, limit });
}

async function queryBookmarks(userId, tagId, limit) {
  const [rows] = await pool.query(
    `SELECT
      b.id,
      b.name,
      b.url,
      b.description,
      b.icon_url,
      b.create_time
     FROM resource_tag_relations r
     INNER JOIN bookmark b ON r.resource_id = b.id AND r.resource_type = 'bookmark'
     WHERE r.tag_id = ? AND b.user_id = ? AND b.del_flag = 0
     ORDER BY b.sort, b.create_time DESC
     LIMIT ?`,
    [tagId, userId, limit],
  );
  return rows;
}

async function queryNotes(userId, tagId, limit) {
  const [rows] = await pool.query(
    `SELECT
      n.id,
      n.title,
      IF(n.type = 'drawing', '', n.content) AS content,
      COALESCE(n.update_time, n.create_time) AS update_time
     FROM resource_tag_relations r
     INNER JOIN note n ON r.resource_id = n.id AND r.resource_type = 'note'
     WHERE r.tag_id = ? AND n.create_by = ? AND n.del_flag = 0
     ORDER BY n.sort, COALESCE(n.update_time, n.create_time) DESC
     LIMIT ?`,
    [tagId, userId, limit],
  );
  return rows;
}

async function queryFiles(userId, tagId, limit) {
  const [rows] = await pool.query(
    `SELECT
      f.id,
      f.file_name,
      f.file_type,
      f.file_size,
      f.create_time
     FROM resource_tag_relations r
     INNER JOIN files f ON r.resource_id = f.id AND r.resource_type = 'file'
     WHERE r.tag_id = ? AND f.create_by = ? AND f.del_flag = 0
     ORDER BY f.create_time DESC
     LIMIT ?`,
    [tagId, userId, limit],
  );
  return rows;
}

function pushNode(nodeMap, node) {
  if (!nodeMap.has(node.id)) {
    nodeMap.set(node.id, node);
  }
}

function pushEdge(edgeMap, edge) {
  if (!edgeMap.has(edge.id)) {
    edgeMap.set(edge.id, edge);
  }
}

export const getTagGraph = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.send(resultData(null, 401, '请先登录'));

    const {
      tagId,
      includeResources = true,
      resourceTypes,
      limitRelatedTags,
      limitPerResourceType,
    } = req.body || {};

    if (!tagId) return res.send(resultData(null, 400, '缺少标签ID'));

    const relatedTagLimit = clampLimit(limitRelatedTags, DEFAULT_LIMIT_RELATED_TAGS);
    const resourceLimit = clampLimit(limitPerResourceType, DEFAULT_LIMIT_PER_TYPE);
    const safeTypes = normalizeResourceTypes(resourceTypes);

    const centerTag = await queryCenterTag(userId, tagId);
    if (!centerTag) return res.send(resultData(null, 404, '标签不存在'));

    const nodes = new Map();
    const edges = new Map();
    const centerNodeId = toNodeId('tag', centerTag.id);

    pushNode(nodes, {
      id: centerNodeId,
      rawId: centerTag.id,
      type: 'tag',
      label: centerTag.name,
      size: getNodeSize('tag', 0, true),
      weight: 0,
      iconUrl: centerTag.icon_url,
      meta: { relatedCount: 0, isCenter: true },
    });

    const relatedTags = await queryRelatedTags(userId, tagId, relatedTagLimit);
    relatedTags.forEach((tag) => {
      // tagRelationService 返回驼峰字段:targetResourceCount 即该标签的资源总数。
      const relatedCount = Number(tag.targetResourceCount || 0);
      const sharedCount = Number(tag.sharedCount || 0);
      const relatedNodeId = toNodeId('tag', tag.id);
      pushNode(nodes, {
        id: relatedNodeId,
        rawId: tag.id,
        type: 'tag',
        label: tag.name,
        size: getNodeSize('tag', relatedCount),
        weight: Math.max(sharedCount, relatedCount),
        iconUrl: tag.iconUrl,
        meta: { relatedCount, sharedCount, similarity: tag.similarity },
      });
      pushEdge(edges, {
        id: `edge:tag-tag:${centerTag.id}:${tag.id}`,
        source: centerNodeId,
        target: relatedNodeId,
        type: 'tag-tag',
        // 与全局知识地图同一公式:粗细反映归一化相似度,而非共现绝对数
        weight: Math.max(1, Math.min(6, Math.round(1 + Number(tag.similarity || 0) * 5))),
        sharedCount,
        similarity: tag.similarity,
      });
    });

    let bookmarks = [];
    let notes = [];
    let files = [];

    if (includeResources) {
      [bookmarks, notes, files] = await Promise.all([
        safeTypes.includes('bookmark') ? queryBookmarks(userId, tagId, resourceLimit) : Promise.resolve([]),
        safeTypes.includes('note') ? queryNotes(userId, tagId, resourceLimit) : Promise.resolve([]),
        safeTypes.includes('file') ? queryFiles(userId, tagId, resourceLimit) : Promise.resolve([]),
      ]);
    }

    bookmarks.forEach((bookmark) => {
      const nodeId = toNodeId('bookmark', bookmark.id);
      pushNode(nodes, {
        id: nodeId,
        rawId: bookmark.id,
        type: 'bookmark',
        label: bookmark.name || '未命名书签',
        size: getNodeSize('bookmark'),
        weight: 1,
        iconUrl: bookmark.icon_url,
        meta: {
          url: bookmark.url,
          description: bookmark.description || bookmark.url,
          updateTime: bookmark.create_time,
        },
      });
      pushEdge(edges, {
        id: `edge:tag-bookmark:${centerTag.id}:${bookmark.id}`,
        source: centerNodeId,
        target: nodeId,
        type: 'tag-bookmark',
        weight: 2,
      });
    });

    notes.forEach((note) => {
      const nodeId = toNodeId('note', note.id);
      pushNode(nodes, {
        id: nodeId,
        rawId: note.id,
        type: 'note',
        label: note.title || '未命名文档',
        size: getNodeSize('note'),
        weight: 1,
        meta: {
          description: stripHtml(note.content).slice(0, 120),
          updateTime: note.update_time,
        },
      });
      pushEdge(edges, {
        id: `edge:tag-note:${centerTag.id}:${note.id}`,
        source: centerNodeId,
        target: nodeId,
        type: 'tag-note',
        weight: 2.4,
      });
    });

    files.forEach((file) => {
      const nodeId = toNodeId('file', file.id);
      pushNode(nodes, {
        id: nodeId,
        rawId: file.id,
        type: 'file',
        label: file.file_name || '未命名文件',
        size: getNodeSize('file'),
        weight: 1,
        meta: {
          fileType: file.file_type,
          fileSize: file.file_size,
          ext: getFileExtension(file.file_name),
          category: resolveFileCategory({ fileName: file.file_name, fileType: file.file_type }),
          updateTime: file.create_time,
        },
      });
      pushEdge(edges, {
        id: `edge:tag-file:${centerTag.id}:${file.id}`,
        source: centerNodeId,
        target: nodeId,
        type: 'tag-file',
        weight: 2,
      });
    });

    res.send(
      resultData({
        centerTag: {
          id: centerTag.id,
          name: centerTag.name,
          iconUrl: centerTag.icon_url,
        },
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values()),
        stats: {
          relatedTagCount: relatedTags.length,
          bookmarkCount: bookmarks.length,
          noteCount: notes.length,
          fileCount: files.length,
        },
      }),
    );
  } catch (error) {
    res.send(resultData(null, 500, '获取标签图谱失败: ' + error.message));
  }
};

const MAX_GLOBAL_TAGS = 300;
const MAX_GLOBAL_EDGES = 800;

async function queryKnowledgeMapStats(userId) {
  const [tagResult, resourceResult, taggedResult, emptyResult, isolatedResult] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM tag WHERE user_id = ? AND del_flag = 0`, [userId]),
    pool.query(
      `SELECT
        (SELECT COUNT(*) FROM bookmark WHERE user_id = ? AND del_flag = 0) +
        (SELECT COUNT(*) FROM note WHERE create_by = ? AND del_flag = 0) +
        (SELECT COUNT(*) FROM files WHERE create_by = ? AND del_flag = 0) AS total`,
      [userId, userId, userId],
    ),
    pool.query(
      `SELECT COUNT(*) AS total
       FROM (
         SELECT DISTINCT b.id AS resource_id
         FROM resource_tag_relations r
         INNER JOIN bookmark b ON r.resource_id = b.id AND r.resource_type = 'bookmark'
         WHERE r.user_id = ? AND b.user_id = ? AND b.del_flag = 0
         UNION ALL
         SELECT DISTINCT n.id AS resource_id
         FROM resource_tag_relations r
         INNER JOIN note n ON r.resource_id = n.id AND r.resource_type = 'note'
         WHERE r.user_id = ? AND n.create_by = ? AND n.del_flag = 0
         UNION ALL
         SELECT DISTINCT f.id AS resource_id
         FROM resource_tag_relations r
         INNER JOIN files f ON r.resource_id = f.id AND r.resource_type = 'file'
         WHERE r.user_id = ? AND f.create_by = ? AND f.del_flag = 0
       ) tagged_resources`,
      [userId, userId, userId, userId, userId, userId],
    ),
    pool.query(
      `SELECT COUNT(*) AS total
       FROM tag t
       WHERE t.user_id = ? AND t.del_flag = 0
         AND NOT EXISTS (
           SELECT 1 FROM resource_tag_relations r
           WHERE r.user_id = ? AND r.tag_id = t.id
         )`,
      [userId, userId],
    ),
    pool.query(
      `SELECT COUNT(*) AS total
       FROM tag t
       WHERE t.user_id = ? AND t.del_flag = 0
         AND EXISTS (
           SELECT 1 FROM resource_tag_relations r
           WHERE r.user_id = ? AND r.tag_id = t.id
         )
         AND NOT EXISTS (
           SELECT 1
           FROM resource_tag_relations a
           INNER JOIN resource_tag_relations b
             ON a.user_id = b.user_id
            AND a.resource_type = b.resource_type
            AND a.resource_id = b.resource_id
            AND a.tag_id <> b.tag_id
           WHERE a.user_id = ? AND a.tag_id = t.id
         )`,
      [userId, userId, userId],
    ),
  ]);

  const totalTagCount = Number(tagResult[0][0]?.total || 0);
  const totalResourceCount = Number(resourceResult[0][0]?.total || 0);
  const taggedResourceCount = Number(taggedResult[0][0]?.total || 0);
  return {
    totalTagCount,
    totalResourceCount,
    taggedResourceCount,
    untaggedResourceCount: Math.max(0, totalResourceCount - taggedResourceCount),
    emptyTagCount: Number(emptyResult[0][0]?.total || 0),
    isolatedTagCount: Number(isolatedResult[0][0]?.total || 0),
  };
}

// 全局知识地图:默认只返回标签节点与标签共现关系;具体资源在用户聚焦某个标签后按需查询。
export const getGlobalGraph = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.send(resultData(null, 401, '请先登录'));
    const minCo = Math.max(1, Math.min(Number(req.body?.minCoOccurrence) || 1, 10));

    // 三段查询互不依赖(统计 / 标签节点 / 共现边),并行执行缩短时延
    const [overviewStats, [tagRows], [coRows]] = await Promise.all([
      queryKnowledgeMapStats(userId),
      pool.query(
        `SELECT t.id, t.name, t.icon_url,
           (SELECT COUNT(*) FROM resource_tag_relations r WHERE r.tag_id = t.id AND r.user_id = ?) AS resource_count
         FROM tag t
         WHERE t.user_id = ? AND t.del_flag = 0
         ORDER BY resource_count DESC, t.sort, t.create_time DESC
         LIMIT ?`,
        [userId, userId, MAX_GLOBAL_TAGS],
      ),
      pool.query(
        `SELECT a.tag_id AS t1, b.tag_id AS t2, COUNT(*) AS co
         FROM resource_tag_relations a
         INNER JOIN resource_tag_relations b
           ON a.resource_type = b.resource_type AND a.resource_id = b.resource_id AND a.tag_id < b.tag_id
         WHERE a.user_id = ? AND b.user_id = ?
         GROUP BY a.tag_id, b.tag_id
         HAVING co >= ?
         ORDER BY co DESC
         LIMIT ?`,
        [userId, userId, minCo, MAX_GLOBAL_EDGES],
      ),
    ]);

    const nodes = new Map();
    // 记录每个标签的资源体量,供边权归一化使用(与标签详情、单标签图谱同一口径)
    const resourceCountByTag = new Map();
    tagRows.forEach((t) => {
      const count = Number(t.resource_count || 0);
      resourceCountByTag.set(String(t.id), count);
      pushNode(nodes, {
        id: toNodeId('tag', t.id),
        rawId: t.id,
        type: 'tag',
        label: t.name,
        size: getNodeSize('tag', count),
        weight: count,
        iconUrl: t.icon_url,
        meta: { resourceCount: count },
      });
    });

    // 标签共现边:两个标签被打在同一批资源上,共现越多关系越强(查询已并入上方 Promise.all)。
    const edges = new Map();
    coRows.forEach((r) => {
      const source = toNodeId('tag', r.t1);
      const target = toNodeId('tag', r.t2);
      if (!nodes.has(source) || !nodes.has(target)) return; // 两端都要在节点集内(被 LIMIT 截掉的不连)
      const sharedCount = Number(r.co || 1);
      // 边粗细按归一化相似度而非共现绝对数,避免「工作」「收藏」这类大标签的边一律最粗,
      // 也保证与标签详情「共同 N 条 / 相似度」的结论一致。
      const similarity = computeTagSimilarity({
        sharedCount,
        sourceResourceCount: resourceCountByTag.get(String(r.t1)) || 0,
        targetResourceCount: resourceCountByTag.get(String(r.t2)) || 0,
      });
      pushEdge(edges, {
        id: `edge:tag-tag:${r.t1}:${r.t2}`,
        source,
        target,
        type: 'tag-tag',
        weight: Math.max(1, Math.min(6, Math.round(1 + similarity * 5))),
        sharedCount,
        similarity,
      });
    });

    res.send(
      resultData({
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values()),
        stats: {
          tagCount: overviewStats.totalTagCount,
          shownTagCount: nodes.size,
          resourceCount: overviewStats.taggedResourceCount,
          totalResourceCount: overviewStats.totalResourceCount,
          taggedResourceCount: overviewStats.taggedResourceCount,
          untaggedResourceCount: overviewStats.untaggedResourceCount,
          emptyTagCount: overviewStats.emptyTagCount,
          isolatedTagCount: overviewStats.isolatedTagCount,
          edgeCount: edges.size,
          truncated: overviewStats.totalTagCount > nodes.size,
        },
      }),
    );
  } catch (error) {
    res.send(resultData(null, 500, '获取全局图谱失败: ' + error.message));
  }
};
