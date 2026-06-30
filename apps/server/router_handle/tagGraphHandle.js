import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { getFileExtension, resolveFileCategory } from '../util/fileCategory.js';

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

async function queryRelatedTags(userId, tagId, limit) {
  const [rows] = await pool.query(
    `SELECT
      t.id,
      t.name,
      t.icon_url,
      (
        SELECT COUNT(*)
        FROM resource_tag_relations r
        WHERE r.tag_id = t.id AND r.user_id = ?
      ) AS related_count
     FROM tag_relations tr
     INNER JOIN tag t ON tr.related_tag_id = t.id
     WHERE tr.tag_id = ? AND t.user_id = ? AND t.del_flag = 0
     ORDER BY related_count DESC, t.sort, t.create_time DESC
     LIMIT ?`,
    [userId, tagId, userId, limit],
  );
  return rows;
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
      n.content,
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
      const relatedCount = Number(tag.related_count || 0);
      const relatedNodeId = toNodeId('tag', tag.id);
      pushNode(nodes, {
        id: relatedNodeId,
        rawId: tag.id,
        type: 'tag',
        label: tag.name,
        size: getNodeSize('tag', relatedCount),
        weight: relatedCount,
        iconUrl: tag.icon_url,
        meta: { relatedCount },
      });
      pushEdge(edges, {
        id: `edge:tag-tag:${centerTag.id}:${tag.id}`,
        source: centerNodeId,
        target: relatedNodeId,
        type: 'tag-tag',
        weight: 3,
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
