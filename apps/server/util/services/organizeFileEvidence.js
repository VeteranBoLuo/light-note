import crypto from 'node:crypto';
import { isAiQuotaErrorCode } from '@lightnote/shared/ai-quota-protocol';
import path from 'node:path';
import { attachCloudDocumentSource } from '../aiDocument/service.js';
import { AI_DOCUMENT_MAX_BYTES, validateDocumentDescriptor } from '../aiDocument/parser.js';
import { AI_OCR_MAX_PAGES, withRenderedPdfPages } from '../aiDocument/localOcr.js';
import { getObjectBufferFromObs, getObjectMetadataFromObs } from '../obsClient.js';
import { imageRecognitionProvider, getImageRecognitionPolicy } from '../imageRecognition/service.js';
import { suggestionError } from './organizeSuggestionRules.js';

const parse = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
const imagePattern = /\.(png|jpe?g|webp)$/iu;
export const FILE_UNDERSTANDING_VERSION = 1;
export function hasMeaningfulFileName(title) {
  const stem = path
    .parse(String(title || ''))
    .name.normalize('NFKC')
    .trim();
  return (
    stem.length >= 2 &&
    !/^(?:(?:untitled|file|image|document|screenshot|新建文档|未命名|无标题|图片|文件)[_\s-]*\d*)$/iu.test(stem) &&
    !/^(?:[\p{N}\p{P}\p{S}\s_]+|[a-f\d-]{20,}|(?:paste|img|dsc|screenshot|微信图片|屏幕截图)[_\s-]*\d[\w\s-]*)$/iu.test(
      stem,
    )
  );
}
function objectFingerprint(source) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([source.user_id, source.id, source.file_id, source.object_key, source.file_size]))
    .digest('hex');
}
function cacheIdentity(source) {
  const policy = getImageRecognitionPolicy();
  return `understanding:${FILE_UNDERSTANDING_VERSION}:${policy.version}:${policy.mode}:${policy.visionModel}:${objectFingerprint(source)}`;
}
function publicCoverage(source) {
  const coverage = parse(source?.coverage_metadata);
  return coverage && typeof coverage === 'object' ? coverage : null;
}
export function plannedVisualPages(source) {
  if (imagePattern.test(source.file_name)) return [1];
  if (!/\.pdf$/iu.test(source.file_name)) return [];
  const coverage = publicCoverage(source);
  const missing = coverage?.pdf?.missingPages;
  if (!Array.isArray(missing)) return [];
  return [...new Set(missing)].filter((p) => Number.isInteger(p) && p > 0 && p <= 300);
}
export function fileReadingState(source, snapshot, cache) {
  const coverage = publicCoverage(source);
  const required = plannedVisualPages(source);
  const visual = cache?.key === cacheIdentity(source) ? cache.pages || [] : [];
  const recovered = new Set(visual.map((page) => page.page));
  const missingPages = required.filter((p) => !recovered.has(p));
  const reasons = (coverage?.reasons || []).map((r) => r.code);
  const truncated = Boolean(coverage?.truncated);
  const image = imagePattern.test(source.file_name);
  const hasText = Boolean(snapshot.source.text?.trim());
  const hasVisual = visual.some((p) => !p.blank && [p.text, p.subject, p.scene, p.purpose].some(Boolean));
  const complete = image
    ? visual.length > 0
    : Boolean(coverage?.complete || (coverage?.pdf && !missingPages.length && !truncated));
  return {
    state: complete ? (hasVisual ? 'visual' : 'text') : hasText || hasVisual ? 'partial' : 'metadata',
    complete,
    totalPages: image ? 1 : Number(coverage?.total?.pages || 0),
    readPages: image
      ? visual.length
      : coverage?.pdf && !truncated
        ? Number(coverage.total.pages) - missingPages.length
        : Math.min(Number(coverage?.total?.pages || 0), Number(coverage?.processed?.pages || 0) + recovered.size),
    missingPages,
    truncated,
    failedRanges: (coverage?.failedRanges || []).filter((r) => r.unit !== 'pages' || truncated || missingPages.length),
    reasonCode:
      missingPages.length > AI_OCR_MAX_PAGES
        ? 'OCR_PAGE_LIMIT'
        : missingPages.length
          ? 'CONTENT_UNREADABLE'
          : truncated
            ? 'CONTENT_LIMIT'
            : complete
              ? null
              : source.error_code || reasons[0] || 'CONTENT_UNREADABLE',
    evidenceKinds: [...(hasText ? ['text'] : []), ...(hasVisual ? ['visual'] : [])],
  };
}

/** One non-blocking queue pass. Never wait for the document Worker from its own organize queue. */
export async function prepareOrganizeFile(db, userId, snapshot, previous = {}, dependencies = {}) {
  const [files] = await db.query(
    'SELECT id,file_name,file_type,file_size,obs_key FROM files WHERE id=? AND create_by=? AND del_flag=0',
    [snapshot.id, userId],
  );
  const file = files[0];
  if (!file) throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '资料已变化', 409);
  try {
    validateDocumentDescriptor({ fileName: file.file_name, fileType: file.file_type, fileSize: file.file_size });
  } catch (error) {
    return {
      reading: { state: 'metadata', complete: false, reasonCode: error.code, evidenceKinds: [] },
      source: null,
      visualPages: [],
    };
  }
  let [sources] = await db.query('SELECT * FROM ai_document_sources WHERE user_id=? AND file_id=? LIMIT 1', [
    userId,
    snapshot.id,
  ]);
  let source = sources[0];
  const sameObject = source?.object_key === file.obs_key && Number(source?.file_size) === Number(file.file_size);
  const outdatedPdf =
    sameObject &&
    source.status === 'ready' &&
    /\.pdf$/iu.test(file.file_name) &&
    publicCoverage(source)?.pdf?.policyVersion !== 2;
  if (!sameObject || (!previous.sourceId && source?.status === 'failed') || outdatedPdf) {
    const attached = await (dependencies.attach || attachCloudDocumentSource)({
      userId,
      fileId: snapshot.id,
      refresh: outdatedPdf,
    });
    [sources] = await db.query('SELECT * FROM ai_document_sources WHERE user_id=? AND id=? LIMIT 1', [
      userId,
      attached.id,
    ]);
    source = sources[0];
  }
  if (!source) throw suggestionError('FILE_NOT_AVAILABLE', '文件内容暂不可用', 503);
  const image = imagePattern.test(file.file_name);
  const reading = { sourceId: String(source.id), startedAt: previous.startedAt || Date.now() };
  if (!image && ['queued', 'parsing'].includes(source.status)) {
    if (Date.now() - reading.startedAt > 30 * 60_000)
      return {
        source,
        visualPages: [],
        reading: { ...reading, state: 'metadata', complete: false, reasonCode: 'DOCUMENT_PREPARATION_TIMEOUT' },
      };
    return { waiting: true, reading: { ...reading, state: 'waiting', complete: false } };
  }
  const cache = parse(source.visual_evidence_json);
  const pages = plannedVisualPages(source);
  const cached = cache?.key === cacheIdentity(source) ? cache : { key: cacheIdentity(source), pages: [] };
  const visualPages =
    pages.length > AI_OCR_MAX_PAGES ? [] : pages.filter((p) => !cached.pages.some((entry) => entry.page === p));
  return { source, cache: cached, visualPages, reading: { ...reading, ...fileReadingState(source, snapshot, cached) } };
}

export function applyVisualEvidence(snapshot, prepared) {
  const pages = prepared.cache?.pages || [];
  const visual = pages
    .filter((p) => !p.blank)
    .map((p) => ({
      id: `visual:${p.page}`,
      locator: `第 ${p.page} 页`,
      kind: 'visual',
      content: [
        ['可见文字', p.text],
        ['主体', p.subject],
        ['场景', p.scene],
        ['资料用途', p.purpose],
      ]
        .filter(([, value]) => value)
        .map(([label, value]) => `${label}：${value}`)
        .join('\n'),
    }));
  snapshot.source.visualEvidence = visual;
  snapshot.reading = prepared.source
    ? { ...prepared.reading, ...fileReadingState(prepared.source, snapshot, prepared.cache) }
    : prepared.reading;
  if (!snapshot.reading.complete && prepared.reading?.visualErrorCode)
    snapshot.reading.reasonCode = prepared.reading.visualErrorCode;
  snapshot.evidenceLevel = snapshot.reading.state;
  return snapshot;
}

/** Called only inside the user's root execution and outbound barrier. Cache never replaces transcription. */
export async function understandOrganizeFile(db, userId, snapshot, prepared, beforeCall, dependencies = {}) {
  if (!prepared.source || !prepared.visualPages.length) return applyVisualEvidence(snapshot, prepared);
  const source = prepared.source;
  const lease = crypto.randomUUID();
  const [claimed] = await db.query(
    `UPDATE ai_document_sources SET visual_lease_token=?,visual_lease_expires_at=DATE_ADD(NOW(),INTERVAL 10 MINUTE)
    WHERE id=? AND user_id=? AND object_key=? AND (visual_lease_token IS NULL OR visual_lease_expires_at<NOW())`,
    [lease, source.id, userId, source.object_key],
  );
  if (!claimed.affectedRows) throw suggestionError('CONTENT_READING_BUSY', '图片内容正在读取', 503);
  try {
    const metadata = await (dependencies.metadata || getObjectMetadataFromObs)(source.object_key);
    if (
      metadata.contentLength <= 0 ||
      metadata.contentLength > AI_DOCUMENT_MAX_BYTES ||
      metadata.contentLength !== Number(source.file_size)
    )
      throw suggestionError('FILE_SIZE_MISMATCH', '文件内容已变化', 409);
    const buffer = await (dependencies.download || getObjectBufferFromObs)(source.object_key);
    const failures = [];
    const recognize = async (image, page) => {
      await beforeCall();
      let evidence;
      try {
        evidence = await (dependencies.recognize || imageRecognitionProvider.understandImage)(image, {
          extension: imagePattern.test(source.file_name) ? path.extname(source.file_name) : '.png',
          beforeRequest: beforeCall,
        });
      } catch (error) {
        if (
          isAiQuotaErrorCode(error.code) ||
          String(error.code || '').startsWith('AI_EXECUTION_') ||
          [
            'AI_ACCESS_RESTRICTED',
            'AI_ACCOUNT_UNAVAILABLE',
            'ORGANIZE_LEASE_LOST',
            'ORGANIZE_RESOURCE_CHANGED',
            'ORGANIZE_RUN_ENDED',
            'ORGANIZE_AI_DISABLED',
          ].includes(error.code) ||
          error.name === 'AbortError'
        )
          throw error;
        failures.push({ page, code: String(error.code || 'VISION_UNAVAILABLE').slice(0, 64) });
        return;
      }
      prepared.cache.pages = [...prepared.cache.pages.filter((p) => p.page !== page), { ...evidence, page }];
      const [saved] = await db.query(
        `UPDATE ai_document_sources ds SET visual_evidence_json=?,visual_lease_expires_at=DATE_ADD(NOW(),INTERVAL 10 MINUTE)
        WHERE ds.id=? AND ds.user_id=? AND ds.object_key=? AND ds.visual_lease_token=? AND EXISTS
        (SELECT 1 FROM files f WHERE f.id=ds.file_id AND f.create_by=ds.user_id AND f.del_flag=0 AND f.obs_key=ds.object_key AND f.file_size=ds.file_size)`,
        [JSON.stringify(prepared.cache), source.id, userId, source.object_key, lease],
      );
      if (!saved.affectedRows) throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '文件内容已变化', 409);
    };
    if (imagePattern.test(source.file_name)) await recognize(buffer, 1);
    else
      failures.push(
        ...((await (dependencies.render || withRenderedPdfPages)(buffer, prepared.visualPages, recognize)) || []),
      );
    if (failures.length) prepared.reading.visualErrorCode = failures[0].code;
  } finally {
    await db.query(
      'UPDATE ai_document_sources SET visual_lease_token=NULL,visual_lease_expires_at=NULL WHERE id=? AND visual_lease_token=?',
      [source.id, lease],
    );
  }
  return applyVisualEvidence(snapshot, prepared);
}
