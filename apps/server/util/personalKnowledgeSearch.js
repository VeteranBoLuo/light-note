import crypto from 'node:crypto';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import pool from '../db/index.js';
import { acquirePersonalSearchBuild } from './personalSearchBuildGate.js';
import { readPersonalSearchSource } from './personalSearchSourceReader.js';
import { buildBundle, tokenize, INDEX_CACHE_POLICY } from './personalSearchIndexCore.js';
import { buildIsolatedIndex } from './personalSearchIndexClient.js';
import { cleanText, chunkResource } from './personalKnowledgeText.js';
import { createPersonalSearchPreprocessor } from './personalSearchPreprocessor.js';

const CACHE_TTL_MS = INDEX_CACHE_POLICY.ttlMs;
const MAX_CACHED_USERS = INDEX_CACHE_POLICY.maxUsers;
// Weighted retention budget, not a V8 heap/RSS hard limit. Includes estimated
// postings and stored documents; transient builds and active requests are separate.
const MAX_CACHE_ESTIMATED_BYTES = INDEX_CACHE_POLICY.estimatedBytes;
const MAX_DOCUMENTS_PER_USER = 12_000;
const cache = new Map();
let cacheExpiryTimer = null;
const loading = new Map();
const generations = new Map();
const pendingPersistentInvalidations = new Map();

function evictBundle(key) {
  cache.get(key)?.index.dispose?.();
  cache.delete(key);
}

function scheduleCacheExpiry() {
  clearTimeout(cacheExpiryTimer);
  cacheExpiryTimer = null;
  if (!cache.size) return;
  const expiresAt = Math.min(...Array.from(cache.values(), (bundle) => bundle.builtAt + CACHE_TTL_MS));
  cacheExpiryTimer = setTimeout(
    () => {
      cacheExpiryTimer = null;
      const now = Date.now();
      // Only drop cache references; in-flight searches keep their own bundles.
      for (const [key, bundle] of cache) {
        if (now - bundle.builtAt >= CACHE_TTL_MS) evictBundle(key);
      }
      scheduleCacheExpiry();
    },
    Math.max(1, expiresAt - Date.now()),
  );
  cacheExpiryTimer.unref();
}

function retainBundle(key, bundle, maxBytes = MAX_CACHE_ESTIMATED_BYTES) {
  if (cache.get(key) !== bundle) evictBundle(key);
  // Large accounts still receive their complete bundle for this request. Do not
  // evict every other account to retain a bundle larger than the entire budget.
  if (bundle.estimatedMemoryBytes <= maxBytes) {
    cache.set(key, bundle);
    let bytes = Array.from(cache.values()).reduce((sum, item) => sum + item.estimatedMemoryBytes, 0);
    while (cache.size > MAX_CACHED_USERS || bytes > maxBytes) {
      const oldest = cache.keys().next().value;
      bytes -= cache.get(oldest).estimatedMemoryBytes;
      evictBundle(oldest);
    }
  }
  scheduleCacheExpiry();
}

function isOptionalSchemaMissing(error) {
  return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code);
}

/**
 * 统一把富文本/网页正文转换为可供私有资料检索与 Skill 证据使用的纯文本。
 * 显式资源读取与语义索引必须复用同一清洗口径，避免同一篇笔记在两个入口中
 * 出现不同的可读正文判断。
 */
export function normalizePersonalKnowledgeText(value) {
  return cleanText(value);
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

async function* loadFileChunkBatches(userId, remainingCapacity) {
  let after = null;
  let coverageSupported = true;
  while (remainingCapacity() > 0) {
    // Select lightweight chunk identities first, then read complete bodies in
    // byte-budgeted batches. Oversized individual chunks are read alone.
    const take = Math.min(128, remainingCapacity());
    const cursorSql = after ? 'AND (f.id > ? OR (f.id = ? AND dc.chunk_index > ?))' : '';
    const baseSql = `SELECT CAST(f.id AS CHAR) AS file_id, f.file_name, f.create_time AS update_time, ds.id AS source_id,
                          ds.extracted_chars, ds.chunk_count, ds.coverage_metadata,
                          dc.chunk_index, dc.content, dc.locator_type, dc.locator_value, dc.content_hash
                     FROM files f
                     JOIN ai_document_sources ds ON ds.file_id = f.id AND ds.user_id = f.create_by AND ds.status = 'ready'
                     JOIN ai_document_chunks dc ON dc.source_id = ds.id
                    WHERE f.create_by = ? AND f.del_flag = 0 ${cursorSql}
                    ORDER BY f.id, dc.chunk_index LIMIT ?`;
    const params = after ? [userId, after.file_id, after.file_id, after.chunk_index, take] : [userId, take];
    const metadataSql = `SELECT CAST(f.id AS CHAR) AS file_id, ds.id AS source_id,
      dc.chunk_index, OCTET_LENGTH(dc.content) AS body_bytes ${baseSql.slice(baseSql.indexOf('FROM files'))}`;
    let rows;
    try {
      [rows] = await pool.query(metadataSql, params);
    } catch (error) {
      if (error?.code === 'ER_NO_SUCH_TABLE' && !after) return;
      throw error;
    }
    if (!rows.length) return;
    // Keep scalar cursor values only; do not retain the previous batch's body.
    const last = rows[rows.length - 1];
    after = { file_id: last.file_id, chunk_index: last.chunk_index };
    for (let offset = 0; offset < rows.length && remainingCapacity() > 0;) {
      const batch = [];
      let bytes = 0;
      const capacity = remainingCapacity();
      while (offset < rows.length && batch.length < capacity) {
        const row = rows[offset];
        const size = Math.max(0, Number(row.body_bytes) || 0);
        if (batch.length && bytes + size > 1024 * 1024) break;
        batch.push(row);
        bytes += size;
        offset += 1;
      }
      const identities = batch.map(() => '(f.id = ? AND ds.id = ? AND dc.chunk_index = ?)').join(' OR ');
      const bodySql = baseSql
        .replace(cursorSql, '')
        .replace('ORDER BY f.id, dc.chunk_index LIMIT ?', `AND (${identities}) ORDER BY f.id, dc.chunk_index LIMIT ?`);
      const bodyParams = [
        userId,
        ...batch.flatMap((row) => [row.file_id, row.source_id, row.chunk_index]),
        batch.length,
      ];
      const legacySql = bodySql.replace('ds.coverage_metadata,', 'NULL AS coverage_metadata,');
      let bodies;
      try {
        [bodies] = await pool.query(coverageSupported ? bodySql : legacySql, bodyParams);
      } catch (error) {
        if (!coverageSupported || error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
        coverageSupported = false;
        [bodies] = await pool.query(legacySql, bodyParams);
      }
      if (bodies.length) yield bodies;
      await yieldToEventLoop();
    }
    if (rows.length < take) return;
    await yieldToEventLoop();
  }
}

async function hydrateDocumentTags(userId, documents) {
  try {
    for (const type of ['note', 'bookmark', 'file']) {
      const byResource = new Map();
      for (const document of documents) {
        if (document.resourceType !== type) continue;
        const entries = byResource.get(document.resourceId) || [];
        entries.push(document);
        byResource.set(document.resourceId, entries);
      }
      const ids = [...byResource.keys()];
      for (let offset = 0; offset < ids.length; offset += 64) {
        const batch = ids.slice(offset, offset + 64);
        const [rows] = await pool.query(
          `SELECT r.resource_id, t.name FROM resource_tag_relations r
           JOIN tag t ON t.id = r.tag_id AND t.user_id = r.user_id AND t.del_flag = 0
           WHERE r.user_id = ? AND r.resource_type = ? AND r.resource_id IN (${batch.map(() => '?').join(',')})
           ORDER BY r.resource_id, t.name`,
          [userId, type, ...batch],
        );
        const names = new Map();
        for (const row of rows) {
          const key = String(row.resource_id);
          const values = names.get(key) || [];
          values.push(String(row.name || ''));
          names.set(key, values);
        }
        for (const id of batch) {
          const values = names.get(id) || [];
          // Keep the original per-source normalization and 1000 character cap.
          const tags = (type === 'file' ? values : [...new Set(values.map(cleanText).filter(Boolean))])
            .join(' ')
            .slice(0, 1000);
          for (const document of byResource.get(id)) document.tags = tags;
        }
        await yieldToEventLoop();
      }
    }
  } catch {
    // The former single tag query also returned no tags when it failed.
    for (const document of documents) document.tags = '';
  }
}

async function loadDocuments(userId) {
  const preprocessor = createPersonalSearchPreprocessor();
  try {
    return await loadDocumentsWithPreprocessor(userId, preprocessor);
  } finally {
    await preprocessor.close();
  }
}

async function loadDocumentsWithPreprocessor(userId, preprocessor) {
  const documents = [];
  const hasCapacity = () => documents.length < MAX_DOCUMENTS_PER_USER;
  async function appendSource(type, append) {
    const start = documents.length;
    let processing = false;
    try {
      for await (const row of readPersonalSearchSource(pool, userId, type, hasCapacity)) {
        processing = true;
        await append(row);
        processing = false;
      }
    } catch (error) {
      if (processing) throw error;
      // Match the previous allSettled source isolation, including a late-page failure.
      documents.length = start;
    }
  }
  await appendSource('note', async (note) => {
    // 第一版手绘只参与标题检索，不把 scene JSON 当作自然语言索引或 AI 证据。
    const drawing = String(note.type || '') === 'drawing';
    documents.push(
      ...(await preprocessor.chunk({
        maxChunks: MAX_DOCUMENTS_PER_USER - documents.length,
        userId,
        resourceType: 'note',
        resourceId: note.id,
        version: versionOf(note.update_time),
        title: note.title || '无标题笔记',
        content: drawing ? note.title : note.content,
        contentType: drawing ? 'html' : note.type,
        target: { type: 'note-detail', id: String(note.id), path: `/noteLibrary/${note.id}` },
      })),
    );
  });
  await appendSource('bookmark', async (bookmark) => {
    const content = [bookmark.description, bookmark.summary, bookmark.content].filter(Boolean).join('\n');
    documents.push(
      ...(await preprocessor.chunk({
        maxChunks: MAX_DOCUMENTS_PER_USER - documents.length,
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
      })),
    );
  });
  const beforeFiles = documents.length;
  let processingFile = false;
  try {
    for await (const fileRows of loadFileChunkBatches(userId, () => MAX_DOCUMENTS_PER_USER - documents.length)) {
      for (const row of fileRows) {
        processingFile = true;
        const content = await preprocessor.fileText(row.content);
        processingFile = false;
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
          tags: '',
          content,
          contentHash,
          locator: {
            type: row.locator_type || 'paragraph',
            value: row.locator_value || `chunk:${row.chunk_index + 1}`,
          },
          target: { type: 'cloud-file', id: String(row.file_id), sourceId: String(row.source_id) },
          coverage: normalizeJson(row.coverage_metadata, {
            processedChars: Number(row.extracted_chars || 0),
            processedChunks: Number(row.chunk_count || 0),
          }),
        });
      }
    }
  } catch (error) {
    // Processing failures must remain visible, not masquerade as missing evidence.
    if (processingFile) throw error;
    // Preserve the previous allSettled behavior: a failed source contributes no
    // partial snapshot. The next generation/TTL rebuild can retry the source.
    documents.length = beforeFiles;
  }
  await appendSource('todo', async (todo) => {
    const checklist = normalizeJson(todo.checklist, []);
    const checklistText = Array.isArray(checklist)
      ? checklist.map((item) => (typeof item === 'string' ? item : item?.text || item?.title || '')).join('\n')
      : '';
    documents.push(
      ...(await preprocessor.chunk({
        maxChunks: MAX_DOCUMENTS_PER_USER - documents.length,
        userId,
        resourceType: 'todo',
        resourceId: todo.id,
        version: versionOf(todo.update_time),
        title: todo.title || '待办',
        content: [todo.description, checklistText, todo.status, todo.due_at].filter(Boolean).join('\n'),
        contentType: 'markdown',
        target: { type: 'todo', id: String(todo.id), path: '/inbox' },
      })),
    );
  });
  await hydrateDocumentTags(userId, documents);
  return documents;
}

async function buildBundleAsync(documents, metadata = {}) {
  const isolated = await buildIsolatedIndex(documents);
  return {
    ...isolated,
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
    const release = await acquirePersonalSearchBuild();
    try {
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
      const bundle = await buildBundleAsync(documents, {
        localGeneration: generation,
        persistentGeneration: databaseGeneration,
      });
      if (stable && generation === currentGeneration(key)) {
        retainBundle(key, bundle);
      } else {
        bundle.index.dispose();
      }
      return bundle;
    } finally {
      release();
    }
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
    evictBundle(key);
    scheduleCacheExpiry();
    generations.set(key, currentGeneration(key) + 1);
    const shouldPersist = persist ?? process.env.NODE_ENV !== 'test';
    if (!shouldPersist) return Promise.resolve({ generationAdvanced: false, deleted: 0, skipped: true });
    if (database === pool && pendingPersistentInvalidations.has(key)) {
      return pendingPersistentInvalidations.get(key);
    }
    const invalidation = (async () => {
      try {
        let result;
        let persistedLocalGeneration;
        do {
          persistedLocalGeneration = currentGeneration(key);
          result = await advancePersistentGenerationAndPurge(key, database);
          // Another business write can commit while the first invalidation's
          // commit acknowledgement is in flight. Persist a new fence for it.
        } while (database === pool && persistedLocalGeneration !== currentGeneration(key));
        return result;
      } catch (error) {
        console.error(
          '[personal-search] persistent invalidation failed code=%s',
          String(error?.code || 'AI_KNOWLEDGE_INVALIDATION_FAILED'),
        );
        return { generationAdvanced: false, deleted: 0, skipped: true };
      } finally {
        // Clear synchronously with the last generation check; later writes must
        // start their own invalidation instead of joining an already settled one.
        if (database === pool) pendingPersistentInvalidations.delete(key);
      }
    })();
    if (database === pool) pendingPersistentInvalidations.set(key, invalidation);
    return invalidation;
  } else {
    for (const key of cache.keys()) evictBundle(key);
    scheduleCacheExpiry();
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

async function authoritativeResourceMetadata(userId, resourceType, resourceIds, database = pool, lockForShare = false) {
  if (!resourceIds.length) return new Map();
  const placeholders = resourceIds.map(() => '?').join(',');
  let sql;
  if (resourceType === 'note') {
    sql = `SELECT id, update_time, title AS resource_title FROM note
           WHERE create_by = ? AND del_flag = 0 AND id IN (${placeholders})`;
  } else if (resourceType === 'bookmark') {
    sql = `SELECT b.id, COALESCE(s.update_time, b.create_time) AS update_time,
                  COALESCE(NULLIF(b.name, ''), NULLIF(b.url, ''), '无标题书签') AS resource_title
             FROM bookmark b LEFT JOIN bookmark_snapshot s ON s.bookmark_id = b.id
            WHERE b.user_id = ? AND b.del_flag = 0 AND b.id IN (${placeholders})`;
  } else if (resourceType === 'file') {
    sql = `SELECT id, create_time AS update_time, file_name AS resource_title FROM files
           WHERE create_by = ? AND del_flag = 0 AND id IN (${placeholders})`;
  } else if (resourceType === 'todo') {
    sql = `SELECT id, update_time, title AS resource_title FROM todo_items
           WHERE user_id = ? AND del_flag = 0 AND id IN (${placeholders})`;
  } else {
    return new Map();
  }
  if (lockForShare) sql += ' LOCK IN SHARE MODE';
  try {
    const [rows] = await database.query(sql, [userId, ...resourceIds]);
    return new Map(
      rows.map((row) => [
        String(row.id),
        { version: versionOf(row.update_time), title: String(row.resource_title || '').slice(0, 255) },
      ]),
    );
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

async function authoritativeResourceVersions(userId, resourceType, resourceIds, database = pool, lockForShare = false) {
  const metadata = await authoritativeResourceMetadata(userId, resourceType, resourceIds, database, lockForShare);
  return new Map([...metadata.entries()].map(([id, value]) => [id, value.version]));
}

function groupPersonalKnowledgeResourceIds(resourceRefs) {
  const refs = Array.isArray(resourceRefs) ? resourceRefs : [];
  const idsByType = new Map();
  for (const ref of refs) {
    const type = String(ref?.type || '');
    const id = String(ref?.id || '');
    if (!id || !['note', 'bookmark', 'file', 'todo'].includes(type)) continue;
    const ids = idsByType.get(type) || new Set();
    ids.add(id);
    idsByType.set(type, ids);
  }
  return { refs, idsByType };
}

/**
 * 按当前 owner 重读明确选择的资源版本。客户端资源 ID 只是候选；缺失、越权、已删除或版本无法验证
 * 都不会出现在返回值中。Skill Context Resolver 复用这里，避免再维护一套资源归属 SQL。
 */
export async function resolvePersonalKnowledgeResourceVersions({
  userId,
  resourceRefs = [],
  database = pool,
  lockForShare = false,
}) {
  const { refs, idsByType } = groupPersonalKnowledgeResourceIds(resourceRefs);
  const versions = new Map(
    await Promise.all(
      [...idsByType.entries()].map(async ([type, ids]) => [
        type,
        await authoritativeResourceVersions(String(userId || ''), type, [...ids], database, lockForShare),
      ]),
    ),
  );
  return refs.flatMap((ref) => {
    const type = String(ref?.type || '');
    const id = String(ref?.id || '');
    const version = versions.get(type)?.get(id);
    return version ? [{ type, id, version }] : [];
  });
}

/** 工作区等需要同时保存权威标题快照的场景复用同一归属、版本与行锁查询。 */
export async function resolvePersonalKnowledgeResourceMetadata({
  userId,
  resourceRefs = [],
  database = pool,
  lockForShare = false,
}) {
  const { refs, idsByType } = groupPersonalKnowledgeResourceIds(resourceRefs);
  const metadata = new Map(
    await Promise.all(
      [...idsByType.entries()].map(async ([type, ids]) => [
        type,
        await authoritativeResourceMetadata(String(userId || ''), type, [...ids], database, lockForShare),
      ]),
    ),
  );
  return refs.flatMap((ref) => {
    const type = String(ref?.type || '');
    const id = String(ref?.id || '');
    const value = metadata.get(type)?.get(id);
    return value ? [{ type, id, version: value.version, title: value.title }] : [];
  });
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
    const results = await bundle.index.searchCandidates(normalizedQuery, normalizedScope, take);
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
      evictBundle(key);
      scheduleCacheExpiry();
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
      const sampleHits = verifiedSample
        .slice(0, take)
        .map((hit, index) => ({ ...hit, citationKey: String(index + 1) }));
      if (sampleHits.length) {
        return { query: normalizedQuery, hits: sampleHits, indexedChunks: bundle.documents.length, sampled: true };
      }
    }
    return { query: normalizedQuery, hits, indexedChunks: bundle.documents.length };
  }
  return { query: normalizedQuery, hits: [], indexedChunks: 0 };
}

export const __testing = {
  cache,
  retainBundle,
  loadBundle,
  loadDocuments,
  loadFileChunkBatches,
  buildBundle,
  buildBundleAsync,
  chunkResource,
  excerptAround,
  normalizeScope,
  advancePersistentGenerationAndPurge,
  authoritativeResourceVersions,
  purgePersonalKnowledgeChunks,
  readPersistentGeneration,
  tokenize,
  validateAuthoritativeHits,
};
