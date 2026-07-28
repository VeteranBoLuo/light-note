import { promises as fsP } from 'node:fs';
import pool from '../db/index.js';
import { generateUUID, L, resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import { createDownloadSignedUrl, deleteObjectFromObs, putObjectToObs } from '../util/obsClient.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import {
  extractUpdateLogImageKeys,
  normalizeLegacyUpdateLogs,
  normalizeUpdateLogInput,
  normalizeUpdateLogRecord,
  parseJsonArray,
  updateLogImageObjectKey,
  updateLogImagePublicUrl,
  validateUpdateLogImage,
} from '../util/updateLog.js';

const UPDATE_LOG_TABLE = 'update_logs';
const UPDATE_LOG_TABLE_CACHE_MS = 30_000;
let updateLogTableAvailableUntil = 0;

function ensureRoot(req, res) {
  if (!ensureNotVisitor(req, res)) return false;
  if (req.user?.role !== 'root') {
    res.send(resultData(null, 403, L(req, '没有操作权限', 'Permission denied')));
    return false;
  }
  return true;
}

function sendServerError(req, res, scene, error) {
  console.error('[update-log] %s failed code=%s', scene, stableAgentErrorCode(error));
  return res.send(
    resultData(
      null,
      500,
      L(req, '更新日志服务暂时不可用，请稍后重试', 'The changelog service is temporarily unavailable'),
    ),
  );
}

function sendSchemaRequired(req, res) {
  return res.send(
    resultData(
      { code: 'UPDATE_LOG_SCHEMA_REQUIRED' },
      503,
      L(req, '更新日志数据表尚未初始化', 'The changelog database schema is not initialized'),
    ),
  );
}

async function updateLogTableExists(db = pool) {
  const canUseCache = db === pool && process.env.NODE_ENV !== 'test';
  if (canUseCache && updateLogTableAvailableUntil > Date.now()) return true;

  const [rows] = await db.query(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [UPDATE_LOG_TABLE],
  );
  const exists = Number(rows[0]?.count || 0) > 0;
  // 只缓存“已存在”：迁移刚执行完成时无需等待缓存失效，下一次请求即可发现新表。
  if (canUseCache && exists) updateLogTableAvailableUntil = Date.now() + UPDATE_LOG_TABLE_CACHE_MS;
  return exists;
}

function mapRows(rows) {
  return (rows || []).map(normalizeUpdateLogRecord);
}

function inputErrorMessage(req, code) {
  const messages = {
    INVALID_TITLE: ['标题不能为空且不能超过 200 个字符', 'Title is required and must be at most 200 characters'],
    INVALID_PUBLISH_DATE: ['请选择有效的发布日期', 'Please select a valid publish date'],
    SUMMARY_TOO_LONG: ['摘要不能超过 500 个字符', 'Summary must be at most 500 characters'],
    CONTENT_TOO_LONG: ['Markdown 正文不能超过 200000 个字符', 'Markdown content is too long'],
    INVALID_HIGHLIGHTS: ['重点更新最多 30 条，每条不超过 500 个字符', 'Highlights are invalid'],
    INVALID_TAGS: ['标签最多 12 个，每个不超过 30 个字符', 'Tags are invalid'],
    EMPTY_PUBLISHED_CONTENT: ['发布前请填写正文或重点更新', 'Add content or highlights before publishing'],
  };
  const [zh, en] = messages[code] || ['更新日志数据不合法', 'Invalid changelog data'];
  return L(req, zh, en);
}

function imageErrorMessage(req, code) {
  const messages = {
    IMAGE_REQUIRED: ['请选择图片', 'Please select an image'],
    IMAGE_TYPE_UNSUPPORTED: [
      '仅支持 JPG、PNG、WebP、GIF 和 AVIF 图片',
      'Only JPG, PNG, WebP, GIF and AVIF images are supported',
    ],
    IMAGE_SIZE_INVALID: ['图片大小必须在 5MB 以内', 'Image size must be within 5MB'],
  };
  const [zh, en] = messages[code] || ['图片不合法', 'Invalid image'];
  return L(req, zh, en);
}

async function cleanupObsObjects(keys, scene) {
  if (!keys.length) return;
  const results = await Promise.allSettled(keys.map((key) => deleteObjectFromObs(key)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn(
        '[update-log] %s cleanup failed key=%s code=%s',
        scene,
        keys[index],
        stableAgentErrorCode(result.reason),
      );
    }
  });
}

export async function list(req, res) {
  try {
    if (await updateLogTableExists()) {
      const [rows] = await pool.query(
        `SELECT id, title, publish_date, summary, highlights, tags, content_markdown,
                image_keys, status, sort, created_time, updated_time
           FROM update_logs
          WHERE status = 'published'
          ORDER BY publish_date DESC, sort DESC, created_time DESC`,
      );
      return res.send(resultData({ items: mapRows(rows), source: 'update_logs' }));
    }

    const [legacyRows] = await pool.query(
      'SELECT json_content FROM config_json WHERE name = ? AND del_flag = 0 LIMIT 1',
      ['更新日志'],
    );
    const items = normalizeLegacyUpdateLogs(legacyRows[0]?.json_content || '[]');
    return res.send(resultData({ items, source: 'config_json' }));
  } catch (error) {
    return sendServerError(req, res, 'list', error);
  }
}

export async function manageList(req, res) {
  if (!ensureRoot(req, res)) return;
  try {
    if (!(await updateLogTableExists())) return sendSchemaRequired(req, res);
    const [rows] = await pool.query(
      `SELECT id, title, publish_date, summary, highlights, tags, content_markdown,
              image_keys, status, sort, created_time, updated_time
         FROM update_logs
        ORDER BY publish_date DESC, sort DESC, created_time DESC`,
    );
    return res.send(resultData({ items: mapRows(rows) }));
  } catch (error) {
    return sendServerError(req, res, 'manage-list', error);
  }
}

export async function createDraft(req, res) {
  if (!ensureRoot(req, res)) return;
  try {
    if (!(await updateLogTableExists())) return sendSchemaRequired(req, res);
    const id = generateUUID();
    const [rows] = await pool.query(
      `INSERT INTO update_logs
        (id, title, publish_date, summary, highlights, tags, content_markdown, image_keys,
         status, sort, created_by)
       VALUES (?, ?, CURDATE(), '', '[]', '[]', '', '[]', 'draft', 0, ?)`,
      [id, L(req, '未命名更新', 'Untitled update'), req.user.id],
    );
    if (!rows?.affectedRows) {
      return res.send(resultData(null, 500, L(req, '创建草稿失败', 'Failed to create draft')));
    }
    const [created] = await pool.query(
      `SELECT id, title, publish_date, summary, highlights, tags, content_markdown,
              image_keys, status, sort, created_time, updated_time
         FROM update_logs WHERE id = ? LIMIT 1`,
      [id],
    );
    return res.send(resultData({ item: normalizeUpdateLogRecord(created[0]) }));
  } catch (error) {
    return sendServerError(req, res, 'create-draft', error);
  }
}

export async function save(req, res) {
  if (!ensureRoot(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, L(req, '缺少日志 ID', 'Missing changelog id')));

  const normalized = normalizeUpdateLogInput(req.body);
  if (normalized.error) {
    return res.send(resultData({ code: normalized.error }, 400, inputErrorMessage(req, normalized.error)));
  }

  let connection;
  let removedKeys = [];
  try {
    if (!(await updateLogTableExists())) return sendSchemaRequired(req, res);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT id, image_keys FROM update_logs WHERE id = ? LIMIT 1 FOR UPDATE', [
      id,
    ]);
    if (!rows.length) {
      await connection.rollback();
      return res.send(resultData(null, 404, L(req, '更新日志不存在', 'Changelog entry not found')));
    }

    const currentImageKeys = parseJsonArray(rows[0].image_keys).map(String);
    const referencedImageKeys = extractUpdateLogImageKeys(normalized.value.contentMarkdown, id);
    const unregisteredKeys = referencedImageKeys.filter((key) => !currentImageKeys.includes(key));
    if (unregisteredKeys.length) {
      await connection.rollback();
      return res.send(
        resultData(
          { code: 'UNREGISTERED_UPDATE_LOG_IMAGE' },
          400,
          L(req, '正文包含未登记或不属于该日志的图片', 'The content contains an unregistered image'),
        ),
      );
    }
    removedKeys = currentImageKeys.filter((key) => !referencedImageKeys.includes(key));

    await connection.query(
      `UPDATE update_logs
          SET title = ?, publish_date = ?, summary = ?, highlights = ?, tags = ?,
              content_markdown = ?, image_keys = ?, status = ?
        WHERE id = ?`,
      [
        normalized.value.title,
        normalized.value.publishDate,
        normalized.value.summary,
        JSON.stringify(normalized.value.highlights),
        JSON.stringify(normalized.value.tags),
        normalized.value.contentMarkdown,
        JSON.stringify(referencedImageKeys),
        normalized.value.status,
        id,
      ],
    );
    await connection.commit();
    await cleanupObsObjects(removedKeys, 'save');

    const [saved] = await pool.query(
      `SELECT id, title, publish_date, summary, highlights, tags, content_markdown,
              image_keys, status, sort, created_time, updated_time
         FROM update_logs WHERE id = ? LIMIT 1`,
      [id],
    );
    return res.send(resultData({ item: normalizeUpdateLogRecord(saved[0]) }));
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    return sendServerError(req, res, 'save', error);
  } finally {
    connection?.release();
  }
}

export async function remove(req, res) {
  if (!ensureRoot(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id) return res.send(resultData(null, 400, L(req, '缺少日志 ID', 'Missing changelog id')));

  let connection;
  let imageKeys = [];
  try {
    if (!(await updateLogTableExists())) return sendSchemaRequired(req, res);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT image_keys FROM update_logs WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
    if (!rows.length) {
      await connection.rollback();
      return res.send(resultData(null, 404, L(req, '更新日志不存在', 'Changelog entry not found')));
    }
    imageKeys = parseJsonArray(rows[0].image_keys).map(String);
    await connection.query('DELETE FROM update_logs WHERE id = ?', [id]);
    await connection.commit();
    await cleanupObsObjects(imageKeys, 'delete');
    return res.send(resultData({ id }));
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    return sendServerError(req, res, 'delete', error);
  } finally {
    connection?.release();
  }
}

export async function uploadImage(req, res) {
  if (!ensureRoot(req, res)) return;
  const id = String(req.body?.id || '').trim();
  const file = req.file;
  if (!id) {
    if (file?.path) await fsP.unlink(file.path).catch(() => {});
    return res.send(resultData(null, 400, L(req, '请先创建更新日志草稿', 'Create a draft first')));
  }

  const validation = validateUpdateLogImage(file);
  if (validation.error) {
    if (file?.path) await fsP.unlink(file.path).catch(() => {});
    return res.send(resultData({ code: validation.error }, 400, imageErrorMessage(req, validation.error)));
  }

  const fileName = `${generateUUID()}${validation.value.extension}`;
  const objectKey = updateLogImageObjectKey(id, fileName);
  let uploaded = false;
  let connection;
  try {
    if (!(await updateLogTableExists())) return sendSchemaRequired(req, res);
    const [owned] = await pool.query('SELECT id FROM update_logs WHERE id = ? LIMIT 1', [id]);
    if (!owned.length) {
      return res.send(resultData(null, 404, L(req, '更新日志不存在', 'Changelog entry not found')));
    }

    await putObjectToObs(objectKey, file.path, validation.value.contentType);
    uploaded = true;

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT image_keys FROM update_logs WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
    if (!rows.length) {
      await connection.rollback();
      await deleteObjectFromObs(objectKey).catch(() => {});
      uploaded = false;
      return res.send(resultData(null, 404, L(req, '更新日志不存在', 'Changelog entry not found')));
    }
    const imageKeys = parseJsonArray(rows[0].image_keys).map(String);
    if (!imageKeys.includes(objectKey)) imageKeys.push(objectKey);
    await connection.query('UPDATE update_logs SET image_keys = ? WHERE id = ?', [JSON.stringify(imageKeys), id]);
    await connection.commit();

    return res.send(
      resultData({
        objectKey,
        url: updateLogImagePublicUrl(id, objectKey),
        fileName: file.originalname,
        fileSize: validation.value.size,
      }),
    );
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    if (uploaded) await deleteObjectFromObs(objectKey).catch(() => {});
    return sendServerError(req, res, 'upload-image', error);
  } finally {
    connection?.release();
    if (file?.path) await fsP.unlink(file.path).catch(() => {});
  }
}

export async function cleanupImages(req, res) {
  if (!ensureRoot(req, res)) return;
  const id = String(req.body?.id || '').trim();
  const requestedKeys = Array.isArray(req.body?.objectKeys) ? req.body.objectKeys.map(String) : [];
  if (!id || !requestedKeys.length) return res.send(resultData({ removed: 0 }));

  let connection;
  let removableKeys = [];
  try {
    if (!(await updateLogTableExists())) return sendSchemaRequired(req, res);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT content_markdown, image_keys FROM update_logs WHERE id = ? LIMIT 1 FOR UPDATE',
      [id],
    );
    if (!rows.length) {
      await connection.rollback();
      return res.send(resultData({ removed: 0 }));
    }
    const currentKeys = parseJsonArray(rows[0].image_keys).map(String);
    const persistedKeys = extractUpdateLogImageKeys(rows[0].content_markdown || '', id);
    removableKeys = requestedKeys.filter(
      (key) => key.startsWith(`update-logs/${id}/`) && currentKeys.includes(key) && !persistedKeys.includes(key),
    );
    const nextKeys = currentKeys.filter((key) => !removableKeys.includes(key));
    await connection.query('UPDATE update_logs SET image_keys = ? WHERE id = ?', [JSON.stringify(nextKeys), id]);
    await connection.commit();
    await cleanupObsObjects(removableKeys, 'discard');
    return res.send(resultData({ removed: removableKeys.length }));
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    return sendServerError(req, res, 'cleanup-images', error);
  } finally {
    connection?.release();
  }
}

export async function image(req, res) {
  const logId = String(req.params?.logId || '');
  const fileName = String(req.params?.fileName || '');
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(logId) || !/^[a-zA-Z0-9-]+\.(jpg|png|webp|gif|avif)$/i.test(fileName)) {
    return res.status(404).end();
  }
  const objectKey = updateLogImageObjectKey(logId, fileName);
  try {
    if (!(await updateLogTableExists())) return res.status(404).end();
    const [rows] = await pool.query('SELECT status, image_keys FROM update_logs WHERE id = ? LIMIT 1', [logId]);
    if (!rows.length) return res.status(404).end();
    const imageKeys = parseJsonArray(rows[0].image_keys).map(String);
    const canReadDraft = req.user?.role === 'root';
    if (!imageKeys.includes(objectKey) || (rows[0].status !== 'published' && !canReadDraft)) {
      return res.status(404).end();
    }
    const { url } = createDownloadSignedUrl({ objectKey, expires: 900 });
    if (!url) return res.status(404).end();
    res.set('Cache-Control', rows[0].status === 'published' ? 'public, max-age=300' : 'private, no-store');
    return res.redirect(302, url);
  } catch (error) {
    console.error('[update-log] image failed code=%s', stableAgentErrorCode(error));
    return res.status(404).end();
  }
}
