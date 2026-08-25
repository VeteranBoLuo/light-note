import crypto from 'node:crypto';
import pool from '../../db/index.js';
import { normalizePersonalKnowledgeText } from '../personalKnowledgeSearch.js';
import {
  attachCloudDocumentSource,
  getDocumentSourceStatuses,
  recognizeCloudImageDocumentSource,
} from '../aiDocument/service.js';
import { aiSkillError } from './errors.js';
import { AI_SKILL_MAX_CHARS_PER_RESOURCE, AI_SKILL_MAX_TOTAL_EVIDENCE_CHARS } from './limits.js';

const DEFAULT_FILE_PREPARE_WAIT_MS = 12_000;
const DEFAULT_FILE_PREPARE_POLL_MS = 500;
const EVIDENCE_QUALITY_WARNING_CODES = new Set(['image_recognition_fallback', 'image_recognition_uncertain']);

const PUBLIC_FILE_PREPARATION_ERRORS = Object.freeze({
  UNSUPPORTED_FILE_TYPE: '该文件格式暂不支持 AI 解析。当前支持 TXT、Markdown、CSV、PDF、DOCX、PNG、JPG 和 WebP。',
  FILE_TOO_LARGE: '文件超过 20MB，暂时无法用于 AI 分析。',
  FILE_SIZE_INVALID: '文件大小无效，暂时无法用于 AI 分析。',
  FILE_TYPE_MISMATCH: '文件扩展名与实际类型不一致，无法安全解析。',
  FILE_NOT_AVAILABLE: '文件尚未完成上传或已不可用，暂时无法解析。',
  FILE_NOT_FOUND: '所选文件不存在或已删除。',
});

function abortReason(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('AI 请求已取消');
  error.name = 'AbortError';
  error.code = 'AI_REQUEST_ABORTED';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal);
}

function wait(durationMs, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    let timer;
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      reject(abortReason(signal));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, durationMs);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

/**
 * 把显式选择的云文件接入统一解析生命周期。文本/PDF 继续使用本地确定性解析；
 * 普通图片在当前用户 AI Execution 内升级到 Vision，并把可重建的转录结果作为后续证据。
 * 同一云对象会复用已达到当前识图策略版本的 ready source。
 */
export async function prepareExplicitResourceEvidence({
  userId,
  resourceRefs = [],
  sessionId = '',
  attachSource = attachCloudDocumentSource,
  getStatuses = getDocumentSourceStatuses,
  recognizeImageSource = recognizeCloudImageDocumentSource,
  signal,
  waitMs = DEFAULT_FILE_PREPARE_WAIT_MS,
  pollMs = DEFAULT_FILE_PREPARE_POLL_MS,
}) {
  const fileRefs = (Array.isArray(resourceRefs) ? resourceRefs : []).filter((ref) => ref.type === 'file');
  if (!fileRefs.length) return [];
  const sources = [];
  for (const ref of fileRefs) {
    throwIfAborted(signal);
    try {
      sources.push(await attachSource({ userId, fileId: ref.id, sessionId }));
    } catch (error) {
      const code = String(error?.code || 'FILE_PREPARATION_FAILED');
      const safeMessage = PUBLIC_FILE_PREPARATION_ERRORS[code];
      if (safeMessage) throw aiSkillError(code, safeMessage, Number(error?.status || 400));
      throw error;
    }
  }
  for (let index = 0; index < sources.length; index += 1) {
    throwIfAborted(signal);
    const source = sources[index];
    if (!/\.(?:png|jpe?g|webp)$/iu.test(String(source?.fileName || ''))) continue;
    sources[index] = await recognizeImageSource({ userId, sourceId: String(source.id), signal });
  }
  const sourceIds = sources.map((source) => String(source.id || '')).filter(Boolean);
  const deadline = Date.now() + Math.max(0, Number(waitMs) || 0);
  let statuses = sources;
  while (
    sourceIds.length &&
    statuses.some((source) => ['queued', 'parsing'].includes(String(source.status || ''))) &&
    Date.now() < deadline
  ) {
    await wait(Math.min(Math.max(100, Number(pollMs) || DEFAULT_FILE_PREPARE_POLL_MS), deadline - Date.now()), signal);
    statuses = await getStatuses({ userId, sourceIds });
  }
  return statuses;
}

function normalizeJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function plainText(value) {
  return normalizePersonalKnowledgeText(value);
}

function evidenceWarningCode(warning) {
  return String(warning || '').split(':', 1)[0];
}

function isEvidenceQualityWarning(warning) {
  return EVIDENCE_QUALITY_WARNING_CODES.has(evidenceWarningCode(warning));
}

function splitEvidenceWarnings(warnings) {
  const qualityWarnings = warnings.filter(isEvidenceQualityWarning);
  const structuralWarnings = warnings.filter((warning) => !isEvidenceQualityWarning(warning));
  return { qualityWarnings, structuralWarnings };
}

function noteText(row) {
  if (String(row.type || '') === 'drawing') return '';
  if (['markdown', 'md'].includes(String(row.type || '').toLowerCase())) {
    return String(row.content || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
      .trim();
  }
  return plainText(row.content);
}

function checklistText(value) {
  const parsed = normalizeJson(value, []);
  if (!Array.isArray(parsed)) return '';
  return parsed
    .map((item) => {
      if (typeof item === 'string') return item;
      const label = item?.text || item?.title || '';
      return label ? `${item?.completed || item?.done ? '[x]' : '[ ]'} ${label}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function evidenceRef(ref, version, content) {
  return `ev_${crypto
    .createHash('sha256')
    .update(`${ref.type}:${ref.id}:${version || 'current'}:${content}`)
    .digest('hex')
    .slice(0, 24)}`;
}

function targetFor(type, id, row = {}) {
  if (type === 'note') return { type: 'note-detail', id, path: `/noteLibrary/${id}` };
  if (type === 'bookmark') {
    return row.snapshot_content || row.snapshot_summary
      ? { type: 'bookmark-snapshot', id }
      : { type: 'bookmark-url', id, url: String(row.url || '') };
  }
  if (type === 'file') return { type: 'cloud-file', id, sourceId: row.source_id ? String(row.source_id) : null };
  return { type: 'todo', id, path: '/inbox' };
}

function fitContent(content, remaining, maxPerResource) {
  const normalized = String(content || '').trim();
  const limit = Math.max(0, Math.min(maxPerResource, remaining));
  if (!normalized || !limit) return { text: '', truncated: normalized.length > 0 };
  if (normalized.length <= limit) return { text: normalized, truncated: false };
  return { text: `${normalized.slice(0, Math.max(0, limit - 1))}…`, truncated: true };
}

function placeholders(ids) {
  return ids.map(() => '?').join(',');
}

async function loadRowsByType({ database, userId, refs }) {
  const idsByType = new Map();
  for (const ref of refs) {
    const ids = idsByType.get(ref.type) || [];
    ids.push(ref.id);
    idsByType.set(ref.type, ids);
  }
  const result = new Map();
  await Promise.all(
    [...idsByType.entries()].map(async ([type, ids]) => {
      let sql;
      if (type === 'note') {
        sql = `SELECT id, title, content, type, create_time, update_time
                 FROM note
                WHERE create_by = ? AND del_flag = 0 AND id IN (${placeholders(ids)})`;
      } else if (type === 'bookmark') {
        sql = `SELECT b.id, b.name, b.url, b.description, b.create_time,
                      s.title AS snapshot_title, s.content AS snapshot_content,
                      s.summary AS snapshot_summary, s.char_count, s.update_time AS snapshot_update_time
                 FROM bookmark b
                 LEFT JOIN bookmark_snapshot s ON s.bookmark_id = b.id AND s.user_id = b.user_id
                WHERE b.user_id = ? AND b.del_flag = 0 AND b.id IN (${placeholders(ids)})`;
      } else if (type === 'file') {
        sql = `SELECT f.id, f.file_name, f.file_type, f.file_size, f.create_time,
                      ds.id AS source_id, ds.status AS source_status, ds.error_code, ds.error_message,
                      ds.extracted_chars, ds.chunk_count, ds.coverage_metadata, ds.expires_at
                 FROM files f
                 LEFT JOIN ai_document_sources ds ON ds.user_id = f.create_by AND ds.file_id = f.id
                WHERE f.create_by = ? AND f.del_flag = 0 AND f.id IN (${placeholders(ids)})`;
      } else if (type === 'todo') {
        sql = `SELECT id, title, description, checklist, priority, status, due_at, completed_at,
                      create_time, update_time
                 FROM todo_items
                WHERE user_id = ? AND del_flag = 0 AND id IN (${placeholders(ids)})`;
      } else {
        return;
      }
      const [rows] = await database.query(sql, [userId, ...ids]);
      for (const row of rows) result.set(`${type}:${String(row.id)}`, row);
    }),
  );
  return result;
}

async function loadFileChunks({ database, rows }) {
  const sourceIds = [
    ...new Set(
      [...rows.values()]
        .map((row) => row.source_id)
        .filter(Boolean)
        .map(String),
    ),
  ];
  if (!sourceIds.length) return new Map();
  const [chunks] = await database.query(
    `SELECT source_id, chunk_index, content, locator_type, locator_value
       FROM ai_document_chunks
      WHERE source_id IN (${placeholders(sourceIds)})
      ORDER BY source_id ASC, chunk_index ASC`,
    sourceIds,
  );
  const bySource = new Map();
  for (const chunk of chunks) {
    const key = String(chunk.source_id);
    const values = bySource.get(key) || [];
    values.push(chunk);
    bySource.set(key, values);
  }
  return bySource;
}

function rawResource(ref, row, fileChunks) {
  if (ref.type === 'note') {
    const content = noteText(row);
    return {
      title: row.title || '无标题笔记',
      content,
      status: content ? 'ready' : String(row.type || '') === 'drawing' ? 'no_text' : 'empty',
      warnings: content ? [] : [String(row.type || '') === 'drawing' ? 'note_drawing_no_text' : 'note_empty'],
      locator: { type: 'document', value: '正文' },
    };
  }
  if (ref.type === 'bookmark') {
    const body = [row.description, row.snapshot_summary, row.snapshot_content].filter(Boolean).join('\n\n');
    const metadata = [`网址：${row.url || '未提供'}`, row.name ? `名称：${row.name}` : ''].filter(Boolean).join('\n');
    const hasPageContent = Boolean(plainText(row.snapshot_content));
    return {
      title: row.name || row.snapshot_title || row.url || '无标题书签',
      content: [metadata, plainText(body)].filter(Boolean).join('\n\n'),
      status: hasPageContent ? 'ready' : 'metadata_only',
      warnings: hasPageContent ? [] : ['bookmark_page_content_unavailable'],
      locator: { type: hasPageContent ? 'snapshot' : 'metadata', value: hasPageContent ? '网页快照' : '书签信息' },
    };
  }
  if (ref.type === 'todo') {
    const content = [
      row.description,
      checklistText(row.checklist),
      `状态：${row.status || 'pending'}`,
      row.due_at ? `截止：${row.due_at}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return {
      title: row.title || '待办',
      content,
      status: content ? 'ready' : 'empty',
      warnings: content ? [] : ['todo_empty'],
      locator: { type: 'todo', value: '待办详情' },
    };
  }
  const status = String(row.source_status || 'not_parsed');
  const coverageMetadata = normalizeJson(row.coverage_metadata, null);
  const recognition = coverageMetadata?.recognition;
  const chunks = fileChunks.get(String(row.source_id || '')) || [];
  const content = chunks
    .map((chunk) => {
      const locator = chunk.locator_value || `片段 ${Number(chunk.chunk_index || 0) + 1}`;
      return `【${locator}】\n${plainText(chunk.content)}`;
    })
    .filter(Boolean)
    .join('\n\n');
  const statusWarning = {
    not_parsed: 'file_not_parsed',
    awaiting_upload: 'file_upload_incomplete',
    queued: 'file_parsing_queued',
    parsing: 'file_parsing_in_progress',
    failed: 'file_parsing_failed',
    ready: content ? null : 'file_no_readable_text',
  }[status];
  const recognitionWarnings = [];
  if (recognition?.engine === 'local_ocr' && recognition?.fallbackReason) {
    recognitionWarnings.push('image_recognition_fallback');
  }
  if (
    ['uncertain', 'degraded'].includes(String(recognition?.quality?.status || '')) ||
    recognition?.uncertainSegments?.length
  ) {
    recognitionWarnings.push('image_recognition_uncertain');
  }
  return {
    title: row.file_name || '文件',
    content,
    status: status === 'ready' && content ? 'ready' : status,
    warnings: [...(statusWarning ? [statusWarning] : []), ...recognitionWarnings],
    locator: { type: 'file', value: chunks[0]?.locator_value || '解析正文' },
    coverageMetadata,
  };
}

/**
 * 按 Context Resolver 已完成 owner/version 校验的显式资源引用读取权威正文。
 * 这里不做语义召回，也不从对话历史补资源；返回顺序严格等于 resourceRefs 顺序。
 */
export async function loadExplicitResourceEvidence({
  userId,
  resourceRefs = [],
  database = pool,
  maxCharsPerResource = AI_SKILL_MAX_CHARS_PER_RESOURCE,
  maxTotalChars = AI_SKILL_MAX_TOTAL_EVIDENCE_CHARS,
}) {
  const refs = Array.isArray(resourceRefs) ? resourceRefs : [];
  if (!refs.length) return { evidence: '', sources: [], coverage: { complete: true, warnings: [], resources: [] } };
  const rows = await loadRowsByType({ database, userId: String(userId), refs });
  const fileChunks = await loadFileChunks({ database, rows });
  const warnings = [];
  const resources = [];
  const sources = [];
  const blocks = [];
  let usedChars = 0;
  for (const ref of refs) {
    const row = rows.get(`${ref.type}:${ref.id}`);
    if (!row) {
      warnings.push(`resource_unavailable:${ref.type}:${ref.id}`);
      continue;
    }
    const raw = rawResource(ref, row, fileChunks);
    const fitted = fitContent(raw.content, maxTotalChars - usedChars, maxCharsPerResource);
    usedChars += fitted.text.length;
    const resourceWarnings = [...raw.warnings, ...(fitted.truncated ? ['resource_content_truncated'] : [])];
    const resourceWarningGroups = splitEvidenceWarnings(resourceWarnings);
    warnings.push(...resourceWarnings.map((warning) => `${warning}:${ref.type}:${ref.id}`));
    resources.push({
      type: ref.type,
      id: ref.id,
      title: String(raw.title || '').slice(0, 255),
      status: raw.status,
      includedChars: fitted.text.length,
      warnings: resourceWarnings,
      coverageComplete: resourceWarningGroups.structuralWarnings.length === 0,
      quality: resourceWarningGroups.qualityWarnings.length ? 'degraded' : 'full',
    });
    if (!fitted.text) continue;
    const source = {
      id: `${ref.type}:${ref.id}`,
      citationKey: String(sources.length + 1),
      evidenceRef: evidenceRef(ref, ref.version, fitted.text),
      resourceType: ref.type,
      resourceId: ref.id,
      resourceVersion: ref.version,
      title: String(raw.title || '').slice(0, 255),
      excerpt: fitted.text.slice(0, 500),
      locator: raw.locator,
      target: targetFor(ref.type, ref.id, row),
      coverage: {
        complete: resourceWarningGroups.structuralWarnings.length === 0,
        status: raw.status,
        includedChars: fitted.text.length,
        warnings: resourceWarnings,
        structuralWarnings: resourceWarningGroups.structuralWarnings,
        qualityWarnings: resourceWarningGroups.qualityWarnings,
        quality: resourceWarningGroups.qualityWarnings.length ? 'degraded' : 'full',
        ...(raw.coverageMetadata ? { parser: raw.coverageMetadata } : {}),
      },
    };
    sources.push(source);
    blocks.push(
      `[${source.citationKey}] evidenceRef=${source.evidenceRef}\n类型：${ref.type}\n标题：${source.title}\n状态：${raw.status}\n内容：\n${fitted.text}`,
    );
  }
  const uniqueWarnings = [...new Set(warnings)];
  const warningGroups = splitEvidenceWarnings(uniqueWarnings);
  return {
    evidence: blocks.join('\n\n'),
    sources,
    coverage: {
      complete: warningGroups.structuralWarnings.length === 0 && sources.length === refs.length,
      warnings: uniqueWarnings,
      structuralWarnings: warningGroups.structuralWarnings,
      qualityWarnings: warningGroups.qualityWarnings,
      quality: warningGroups.qualityWarnings.length ? 'degraded' : 'full',
      resources,
      requestedResources: refs.length,
      representedResources: sources.length,
      readableResources: blocks.length,
    },
  };
}

export const aiSkillResourceEvidenceInternals = Object.freeze({
  noteText,
  checklistText,
  fitContent,
  rawResource,
  evidenceWarningCode,
  isEvidenceQualityWarning,
  splitEvidenceWarnings,
  PUBLIC_FILE_PREPARATION_ERRORS,
});
