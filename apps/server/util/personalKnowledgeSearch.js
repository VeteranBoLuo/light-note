import crypto from 'node:crypto';
import MiniSearch from 'minisearch';
import pool from '../db/index.js';
import { extractTokens, splitKnowledgeContent } from './knowledgeService.js';

const CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_CACHED_USERS = 20;
const MAX_DOCUMENTS_PER_USER = 12_000;
const cache = new Map();
const loading = new Map();
const generations = new Map();
const pendingPersistentInvalidations = new Map();
let chunkPersistenceWarningShown = false;

function isOptionalSchemaMissing(error) {
  return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code);
}

function cleanText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/\s+/gu, ' ')
    .trim();
}

function tokenize(value) {
  return extractTokens(value).filter((term) => term.length > 1 || /^[a-z0-9]+$/iu.test(term));
}

function normalizeJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function versionOf(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : String(value || 'unknown');
}

function excerptAround(text, query, radius = 360) {
  const content = cleanText(text);
  if (!content) return '';
  const terms = tokenize(query).sort((a, b) => b.length - a.length);
  const lower = content.toLowerCase();
  let index = -1;
  let matchedLength = 0;
  for (const term of terms) {
    const candidate = lower.indexOf(term.toLowerCase());
    if (candidate >= 0 && (index < 0 || candidate < index)) {
      index = candidate;
      matchedLength = term.length;
    }
  }
  if (index < 0) return content.slice(0, radius * 2) + (content.length > radius * 2 ? '…' : '');
  const start = Math.max(0, index - radius);
  const end = Math.min(content.length, index + matchedLength + radius);
  return `${start ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`;
}

function chunkResource({
  userId,
  resourceType,
  resourceId,
  version,
  title,
  content,
  contentType,
  target,
  coverage,
  tagNames = [],
}) {
  const chunks = splitKnowledgeContent(content, contentType);
  const fallback = cleanText(content);
  const usable = chunks.length ? chunks : fallback ? [{ heading: '', content: fallback }] : [];
  return usable.map((chunk, index) => {
    const normalized = cleanText(chunk.content).slice(0, 4000);
    const contentHash = crypto.createHash('sha256').update(normalized).digest('hex');
    return {
      id: `${resourceType}:${resourceId}:${version}:${index}`,
      userId,
      resourceType,
      resourceId: String(resourceId),
      resourceVersion: String(version || 'unknown'),
      chunkIndex: index,
      title: String(title || '').slice(0, 255),
      sectionTitle: String(chunk.heading || '').slice(0, 255),
      tags: [...new Set(tagNames.map((name) => cleanText(name)).filter(Boolean))].join(' ').slice(0, 1000),
      content: normalized,
      contentHash,
      locator: { type: chunk.heading ? 'section' : 'paragraph', value: chunk.heading || `chunk:${index + 1}` },
      target,
      coverage: coverage || null,
    };
  });
}

async function queryOptional(sql, params) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    if (isOptionalSchemaMissing(error)) return [];
    throw error;
  }
}

async function loadFileChunks(userId) {
  const baseSql = `SELECT f.id AS file_id, f.file_name, f.create_time AS update_time, ds.id AS source_id,
                          ds.extracted_chars, ds.chunk_count, ds.coverage_metadata,
                          dc.chunk_index, dc.content, dc.locator_type, dc.locator_value, dc.content_hash
                     FROM files f
                     JOIN ai_document_sources ds ON ds.file_id = f.id AND ds.user_id = f.create_by AND ds.status = 'ready'
                     JOIN ai_document_chunks dc ON dc.source_id = ds.id
                    WHERE f.create_by = ? AND f.del_flag = 0
                    ORDER BY f.id, dc.chunk_index`;
  try {
    const [rows] = await pool.query(baseSql, [userId]);
    return rows;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    const [rows] = await pool.query(baseSql.replace('ds.coverage_metadata,', 'NULL AS coverage_metadata,'), [userId]);
    return rows;
  }
}

async function loadDocuments(userId) {
  const [notesResult, bookmarksResult, filesResult, todosResult, tagsResult] = await Promise.allSettled([
    queryOptional(
      `SELECT id, title, content, type, update_time
         FROM note WHERE create_by = ? AND del_flag = '0' ORDER BY update_time DESC LIMIT 3000`,
      [userId],
    ),
    queryOptional(
      `SELECT b.id, b.name, b.url, b.description, b.create_time, s.summary, s.content, s.update_time
         FROM bookmark b LEFT JOIN bookmark_snapshot s ON s.bookmark_id = b.id
        WHERE b.user_id = ? AND b.del_flag = 0 ORDER BY b.create_time DESC LIMIT 3000`,
      [userId],
    ),
    loadFileChunks(userId),
    queryOptional(
      `SELECT id, title, description, checklist, status, due_at, update_time
         FROM todo_items WHERE user_id = ? AND del_flag = 0 ORDER BY update_time DESC LIMIT 2000`,
      [userId],
    ),
    queryOptional(
      `SELECT r.resource_type, r.resource_id, t.name
         FROM resource_tag_relations r
         JOIN tag t ON t.id = r.tag_id AND t.user_id = r.user_id AND t.del_flag = 0
        WHERE r.user_id = ? AND r.resource_type IN ('note', 'bookmark', 'file')
        ORDER BY r.resource_type, r.resource_id, t.name`,
      [userId],
    ),
  ]);
  const tagsByResource = new Map();
  const tagRows = tagsResult.status === 'fulfilled' ? tagsResult.value : [];
  for (const row of tagRows) {
    const key = `${String(row.resource_type)}:${String(row.resource_id)}`;
    const names = tagsByResource.get(key) || [];
    names.push(String(row.name || ''));
    tagsByResource.set(key, names);
  }
  const documents = [];
  const notes = notesResult.status === 'fulfilled' ? notesResult.value : [];
  for (const note of notes) {
    documents.push(
      ...chunkResource({
        userId,
        resourceType: 'note',
        resourceId: note.id,
        version: versionOf(note.update_time),
        title: note.title || '无标题笔记',
        content: note.content,
        contentType: note.type,
        target: { type: 'note-detail', id: String(note.id), path: `/noteLibrary/${note.id}` },
        tagNames: tagsByResource.get(`note:${String(note.id)}`),
      }),
    );
  }
  const bookmarks = bookmarksResult.status === 'fulfilled' ? bookmarksResult.value : [];
  for (const bookmark of bookmarks) {
    const content = [bookmark.description, bookmark.summary, bookmark.content].filter(Boolean).join('\n');
    documents.push(
      ...chunkResource({
        userId,
        resourceType: 'bookmark',
        resourceId: bookmark.id,
        version: versionOf(bookmark.update_time || bookmark.create_time),
        title: bookmark.name || bookmark.url || '无标题书签',
        content,
        contentType: 'html',
        target:
          bookmark.content || bookmark.summary
            ? { type: 'bookmark-snapshot', id: String(bookmark.id) }
            : { type: 'bookmark-url', id: String(bookmark.id), url: bookmark.url || '' },
        tagNames: tagsByResource.get(`bookmark:${String(bookmark.id)}`),
      }),
    );
  }
  const fileRows = filesResult.status === 'fulfilled' ? filesResult.value : [];
  for (const row of fileRows) {
    const content = cleanText(row.content).slice(0, 4000);
    if (!content) continue;
    const version = versionOf(row.update_time);
    const contentHash = row.content_hash || crypto.createHash('sha256').update(content).digest('hex');
    documents.push({
      id: `file:${row.file_id}:${version}:${row.chunk_index}`,
      userId,
      resourceType: 'file',
      resourceId: String(row.file_id),
      resourceVersion: version,
      chunkIndex: Number(row.chunk_index || 0),
      title: String(row.file_name || '文件').slice(0, 255),
      sectionTitle: '',
      tags: (tagsByResource.get(`file:${String(row.file_id)}`) || []).join(' ').slice(0, 1000),
      content,
      contentHash,
      locator: { type: row.locator_type || 'paragraph', value: row.locator_value || `chunk:${row.chunk_index + 1}` },
      target: { type: 'cloud-file', id: String(row.file_id), sourceId: String(row.source_id) },
      coverage: normalizeJson(row.coverage_metadata, {
        processedChars: Number(row.extracted_chars || 0),
        processedChunks: Number(row.chunk_count || 0),
      }),
    });
  }
  const todos = todosResult.status === 'fulfilled' ? todosResult.value : [];
  for (const todo of todos) {
    const checklist = normalizeJson(todo.checklist, []);
    const checklistText = Array.isArray(checklist)
      ? checklist.map((item) => (typeof item === 'string' ? item : item?.text || item?.title || '')).join('\n')
      : '';
    documents.push(
      ...chunkResource({
        userId,
        resourceType: 'todo',
        resourceId: todo.id,
        version: versionOf(todo.update_time),
        title: todo.title || '待办',
        content: [todo.description, checklistText, todo.status, todo.due_at].filter(Boolean).join('\n'),
        contentType: 'markdown',
        target: { type: 'todo', id: String(todo.id), path: '/inbox' },
      }),
    );
  }
  return documents.slice(0, MAX_DOCUMENTS_PER_USER);
}

function buildBundle(documents, metadata = {}) {
  const index = new MiniSearch({
    fields: ['title', 'sectionTitle', 'tags', 'content'],
    storeFields: [
      'resourceType',
      'resourceId',
      'resourceVersion',
      'chunkIndex',
      'title',
      'sectionTitle',
      'tags',
      'content',
      'contentHash',
      'locator',
      'target',
      'coverage',
    ],
    tokenize,
    processTerm: (term) => String(term || '').toLowerCase() || null,
  });
  index.addAll(documents);
  return {
    index,
    documents,
    builtAt: Date.now(),
    localGeneration: Number(metadata.localGeneration || 0),
    persistentGeneration: metadata.persistentGeneration == null ? null : Number(metadata.persistentGeneration || 0),
  };
}

function currentGeneration(userId) {
  return generations.get(String(userId)) || 0;
}

async function readPersistentGeneration(userId, database = pool, { lock = false } = {}) {
  try {
    const [rows] = await database.query(
      `SELECT generation FROM ai_content_generations WHERE subject_user_id = ?${lock ? ' FOR UPDATE' : ''}`,
      [String(userId)],
    );
    return rows.length ? Number(rows[0].generation || 0) : 0;
  } catch (error) {
    if (isOptionalSchemaMissing(error)) return null;
    throw error;
  }
}

async function ensurePersistentGenerationRow(connection, userId) {
  try {
    await connection.query(
      `INSERT INTO ai_content_generations (subject_user_id, generation) VALUES (?, 0)
       ON DUPLICATE KEY UPDATE subject_user_id = VALUES(subject_user_id)`,
      [String(userId)],
    );
    return true;
  } catch (error) {
    if (isOptionalSchemaMissing(error)) return false;
    throw error;
  }
}

async function persistChunks(
  userId,
  documents,
  expectedGeneration = currentGeneration(userId),
  expectedPersistentGeneration = null,
) {
  if (currentGeneration(userId) !== expectedGeneration) return { persisted: false, stale: true };
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (currentGeneration(userId) !== expectedGeneration) {
      await connection.rollback();
      return { persisted: false, stale: true };
    }
    if (expectedPersistentGeneration != null) {
      const generationAvailable = await ensurePersistentGenerationRow(connection, userId);
      const persistentGeneration = generationAvailable
        ? await readPersistentGeneration(userId, connection, { lock: true })
        : null;
      if (persistentGeneration == null || persistentGeneration !== expectedPersistentGeneration) {
        await connection.rollback();
        return { persisted: false, stale: true };
      }
    }
    await connection.query('UPDATE ai_content_chunks SET active = 0 WHERE subject_user_id = ?', [userId]);
    const batchSize = 150;
    for (let start = 0; start < documents.length; start += batchSize) {
      const batch = documents.slice(start, start + batchSize);
      if (!batch.length) continue;
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').join(',');
      const values = batch.flatMap((document) => [
        userId,
        document.resourceType,
        document.resourceId,
        document.resourceVersion,
        document.chunkIndex,
        document.title,
        document.sectionTitle || null,
        document.content,
        document.contentHash,
        Math.ceil(document.content.length / 3),
        JSON.stringify(document.locator || null),
      ]);
      await connection.query(
        `INSERT INTO ai_content_chunks
          (subject_user_id, resource_type, resource_id, resource_version, chunk_index, title, section_title,
           content, content_hash, token_estimate, locator_json, active)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE title = VALUES(title), section_title = VALUES(section_title), content = VALUES(content),
           content_hash = VALUES(content_hash), token_estimate = VALUES(token_estimate), locator_json = VALUES(locator_json),
           active = 1, update_time = CURRENT_TIMESTAMP`,
        values,
      );
    }
    // 资源删除、回收站移动或正文版本变化后，不保留旧的私密正文副本。
    // 先将本轮仍存在的分块重新激活，再在同一事务内物理清除其余旧分块。
    await connection.query('DELETE FROM ai_content_chunks WHERE subject_user_id = ? AND active = 0', [userId]);
    if (currentGeneration(userId) !== expectedGeneration) {
      await connection.rollback();
      return { persisted: false, stale: true };
    }
    await connection.commit();
    return { persisted: true, stale: false };
  } catch (error) {
    await connection.rollback();
    if (!isOptionalSchemaMissing(error)) throw error;
    if (!chunkPersistenceWarningShown) {
      chunkPersistenceWarningShown = true;
      console.warn('[personal-search] ai_content_chunks 尚未迁移，当前仅使用进程内索引。');
    }
    return { persisted: false, stale: false };
  } finally {
    connection.release();
  }
}

export async function purgePersonalKnowledgeChunks(userId, database = pool) {
  const key = String(userId || '').trim();
  if (!key) return { deleted: 0, skipped: true };
  try {
    const [result] = await database.query('DELETE FROM ai_content_chunks WHERE subject_user_id = ?', [key]);
    return { deleted: Number(result?.affectedRows || 0), skipped: false };
  } catch (error) {
    if (isOptionalSchemaMissing(error)) return { deleted: 0, skipped: true };
    throw error;
  }
}

async function advancePersistentGenerationAndPurge(userId, database = pool) {
  const ownsTransaction = typeof database?.getConnection === 'function';
  const connection = ownsTransaction ? await database.getConnection() : database;
  try {
    if (ownsTransaction) await connection.beginTransaction();
    try {
      await connection.query(
        `INSERT INTO ai_content_generations (subject_user_id, generation) VALUES (?, 1)
         ON DUPLICATE KEY UPDATE generation = generation + 1, update_time = CURRENT_TIMESTAMP`,
        [userId],
      );
    } catch (error) {
      if (!isOptionalSchemaMissing(error)) throw error;
      const purged = await purgePersonalKnowledgeChunks(userId, connection);
      if (ownsTransaction) await connection.commit();
      return { generationAdvanced: false, ...purged };
    }
    let deleted = 0;
    let skipped = false;
    try {
      const [result] = await connection.query('DELETE FROM ai_content_chunks WHERE subject_user_id = ?', [userId]);
      deleted = Number(result?.affectedRows || 0);
    } catch (error) {
      if (!isOptionalSchemaMissing(error)) throw error;
      skipped = true;
    }
    if (ownsTransaction) await connection.commit();
    return { generationAdvanced: true, deleted, skipped };
  } catch (error) {
    if (ownsTransaction) await connection.rollback();
    throw error;
  } finally {
    if (ownsTransaction) connection.release();
  }
}

async function loadBundle(userId) {
  const key = String(userId);
  const localGeneration = currentGeneration(key);
  const persistentGeneration = await readPersistentGeneration(key);
  const existing = cache.get(key);
  if (
    existing &&
    Date.now() - existing.builtAt < CACHE_TTL_MS &&
    existing.localGeneration === localGeneration &&
    (persistentGeneration == null || existing.persistentGeneration === persistentGeneration)
  ) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  if (loading.has(key)) return loading.get(key);
  const promise = (async () => {
    let documents = [];
    let generation = currentGeneration(key);
    let databaseGeneration = persistentGeneration;
    let stable = false;
    // 构建前后同时核对本进程与数据库代际；跨实例写入发生时重新读取权威资源。
    for (let attempt = 0; attempt < 3; attempt += 1) {
      generation = currentGeneration(key);
      databaseGeneration = await readPersistentGeneration(key);
      documents = await loadDocuments(key);
      const afterDatabaseGeneration = await readPersistentGeneration(key);
      stable =
        generation === currentGeneration(key) &&
        (databaseGeneration == null || databaseGeneration === afterDatabaseGeneration);
      if (stable) break;
    }
    const bundle = buildBundle(documents, {
      localGeneration: generation,
      persistentGeneration: databaseGeneration,
    });
    if (stable && generation === currentGeneration(key)) {
      cache.set(key, bundle);
      while (cache.size > MAX_CACHED_USERS) cache.delete(cache.keys().next().value);
      void persistChunks(key, documents, generation, databaseGeneration).catch((error) =>
        console.error(
          '[personal-search] chunk persistence failed code=%s',
          String(error?.code || 'AI_CHUNK_PERSIST_FAILED'),
        ),
      );
    }
    return bundle;
  })();
  loading.set(key, promise);
  try {
    return await promise;
  } finally {
    loading.delete(key);
  }
}

export function invalidatePersonalKnowledgeCache(userId, { database = pool, persist } = {}) {
  if (userId) {
    const key = String(userId);
    cache.delete(key);
    generations.set(key, currentGeneration(key) + 1);
    const shouldPersist = persist ?? process.env.NODE_ENV !== 'test';
    if (!shouldPersist) return Promise.resolve({ generationAdvanced: false, deleted: 0, skipped: true });
    if (database === pool && pendingPersistentInvalidations.has(key)) {
      return pendingPersistentInvalidations.get(key);
    }
    const invalidation = advancePersistentGenerationAndPurge(key, database)
      .catch((error) => {
        console.error(
          '[personal-search] persistent invalidation failed code=%s',
          String(error?.code || 'AI_KNOWLEDGE_INVALIDATION_FAILED'),
        );
        return { generationAdvanced: false, deleted: 0, skipped: true };
      })
      .finally(() => {
        if (database === pool) pendingPersistentInvalidations.delete(key);
      });
    if (database === pool) pendingPersistentInvalidations.set(key, invalidation);
    return invalidation;
  } else {
    cache.clear();
    for (const key of loading.keys()) generations.set(key, currentGeneration(key) + 1);
    return Promise.resolve({ generationAdvanced: false, deleted: 0, skipped: true });
  }
}

function normalizeScope(scope = {}) {
  const types = Array.isArray(scope.types)
    ? new Set(scope.types.map(String).filter((type) => ['note', 'bookmark', 'file', 'todo'].includes(type)))
    : null;
  const resourceIds = Array.isArray(scope.resourceIds)
    ? new Set(scope.resourceIds.map((item) => `${String(item.type)}:${String(item.id)}`))
    : null;
  return { types: types?.size ? types : null, resourceIds };
}

function isInScope(result, scope) {
  if (scope.types && !scope.types.has(String(result.resourceType))) return false;
  if (scope.resourceIds && !scope.resourceIds.has(`${result.resourceType}:${result.resourceId}`)) return false;
  return true;
}

async function authoritativeResourceVersions(userId, resourceType, resourceIds, database = pool) {
  if (!resourceIds.length) return new Map();
  const placeholders = resourceIds.map(() => '?').join(',');
  let sql;
  if (resourceType === 'note') {
    sql = `SELECT id, update_time FROM note
           WHERE create_by = ? AND del_flag = 0 AND id IN (${placeholders})`;
  } else if (resourceType === 'bookmark') {
    sql = `SELECT b.id, COALESCE(s.update_time, b.create_time) AS update_time
             FROM bookmark b LEFT JOIN bookmark_snapshot s ON s.bookmark_id = b.id
            WHERE b.user_id = ? AND b.del_flag = 0 AND b.id IN (${placeholders})`;
  } else if (resourceType === 'file') {
    sql = `SELECT id, create_time AS update_time FROM files
           WHERE create_by = ? AND del_flag = 0 AND id IN (${placeholders})`;
  } else if (resourceType === 'todo') {
    sql = `SELECT id, update_time FROM todo_items
           WHERE user_id = ? AND del_flag = 0 AND id IN (${placeholders})`;
  } else {
    return new Map();
  }
  try {
    const [rows] = await database.query(sql, [userId, ...resourceIds]);
    return new Map(rows.map((row) => [String(row.id), versionOf(row.update_time)]));
  } catch (error) {
    console.error(
      '[personal-search] authoritative validation failed type=%s code=%s',
      resourceType,
      String(error?.code || 'AI_KNOWLEDGE_VALIDATION_FAILED'),
    );
    // 权威归属/版本无法验证时失败关闭，不把缓存正文作为证据返回。
    return new Map();
  }
}

async function validateAuthoritativeHits(userId, hits, database = pool) {
  const idsByType = new Map();
  for (const hit of hits) {
    const ids = idsByType.get(hit.type) || new Set();
    ids.add(String(hit.id));
    idsByType.set(hit.type, ids);
  }
  const versionsByType = new Map(
    await Promise.all(
      [...idsByType.entries()].map(async ([type, ids]) => [
        type,
        await authoritativeResourceVersions(userId, type, [...ids], database),
      ]),
    ),
  );
  return hits.filter(
    (hit) => versionsByType.get(hit.type)?.get(String(hit.id)) === String(hit.resourceVersion || 'unknown'),
  );
}

export async function searchPersonalKnowledge({ userId, query, limit = 8, scope = {}, fallbackSample = false }) {
  const normalizedQuery = String(query || '')
    .trim()
    .slice(0, 500);
  if (!userId || !normalizedQuery) return { query: normalizedQuery, hits: [], indexedChunks: 0 };
  const take = Math.max(1, Math.min(20, Number(limit) || 8));
  const key = String(userId);
  const normalizedScope = normalizeScope(scope);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const bundle = await loadBundle(key);
    const results = bundle.index.search(normalizedQuery, {
      boost: { title: 5, tags: 3.5, sectionTitle: 2.5, content: 1 },
      combineWith: 'OR',
      prefix: (term) => /^[a-z0-9]{3,}$/iu.test(term),
      fuzzy: (term) => (/^[a-z0-9]{4,}$/iu.test(term) ? 0.2 : false),
      maxFuzzy: 1,
    });
    const seenPerResource = new Map();
    const candidates = [];
    for (const result of results) {
      if (!isInScope(result, normalizedScope)) continue;
      const resourceKey = `${result.resourceType}:${result.resourceId}`;
      const count = seenPerResource.get(resourceKey) || 0;
      if (count >= 2) continue;
      seenPerResource.set(resourceKey, count + 1);
      const evidenceRef = `ev_${crypto
        .createHash('sha256')
        .update(`${resourceKey}:${result.resourceVersion}:${result.chunkIndex}:${result.contentHash}`)
        .digest('hex')
        .slice(0, 24)}`;
      candidates.push({
        sourceId: resourceKey,
        evidenceRef,
        type: result.resourceType,
        id: String(result.resourceId),
        title: result.title || '',
        sectionTitle: result.sectionTitle || '',
        excerpt: excerptAround(result.content, normalizedQuery),
        locator: result.locator || null,
        target: result.target || null,
        resourceVersion: result.resourceVersion,
        coverage: result.coverage || null,
        score: Number(result.score || 0),
      });
      if (candidates.length >= Math.min(60, take * 3)) break;
    }
    const verified = await validateAuthoritativeHits(key, candidates);
    const afterPersistentGeneration = await readPersistentGeneration(key);
    const stale =
      bundle.localGeneration !== currentGeneration(key) ||
      (bundle.persistentGeneration != null && bundle.persistentGeneration !== afterPersistentGeneration);
    if (stale && attempt === 0) {
      cache.delete(key);
      continue;
    }
    const hits = verified.slice(0, take).map((hit, index) => ({ ...hit, citationKey: String(index + 1) }));
    // 兜底(仅研究等归纳场景传 fallbackSample=true 时启用):关键词零命中、且未限定具体材料时,
    // 取一批最近内容样本,让"我的笔记都关于哪些方面"这类聚合问题也有材料可概括,而不是直接"没找到证据"。
    // 聊天问答不传此参数,保持"无匹配即老实说没有"的严格行为。
    if (!hits.length && fallbackSample && !normalizedScope.resourceIds?.length) {
      const sampleSeen = new Map();
      const sampleCandidates = [];
      for (const doc of bundle.documents) {
        if (!isInScope(doc, normalizedScope)) continue;
        const resourceKey = `${doc.resourceType}:${doc.resourceId}`;
        if (sampleSeen.has(resourceKey)) continue;
        sampleSeen.set(resourceKey, true);
        const evidenceRef = `ev_${crypto
          .createHash('sha256')
          .update(`${resourceKey}:${doc.resourceVersion}:${doc.chunkIndex}:${doc.contentHash}`)
          .digest('hex')
          .slice(0, 24)}`;
        sampleCandidates.push({
          sourceId: resourceKey,
          evidenceRef,
          type: doc.resourceType,
          id: String(doc.resourceId),
          title: doc.title || '',
          sectionTitle: doc.sectionTitle || '',
          excerpt: String(doc.content || '').slice(0, 360),
          locator: doc.locator || null,
          target: doc.target || null,
          resourceVersion: doc.resourceVersion,
          coverage: doc.coverage || null,
          score: 0,
        });
        if (sampleCandidates.length >= take) break;
      }
      const verifiedSample = await validateAuthoritativeHits(key, sampleCandidates);
      const sampleHits = verifiedSample.slice(0, take).map((hit, index) => ({ ...hit, citationKey: String(index + 1) }));
      if (sampleHits.length) {
        return { query: normalizedQuery, hits: sampleHits, indexedChunks: bundle.documents.length, sampled: true };
      }
    }
    return { query: normalizedQuery, hits, indexedChunks: bundle.documents.length };
  }
  return { query: normalizedQuery, hits: [], indexedChunks: 0 };
}

export const __testing = {
  buildBundle,
  chunkResource,
  excerptAround,
  normalizeScope,
  advancePersistentGenerationAndPurge,
  authoritativeResourceVersions,
  persistChunks,
  purgePersonalKnowledgeChunks,
  readPersistentGeneration,
  tokenize,
  validateAuthoritativeHits,
};
