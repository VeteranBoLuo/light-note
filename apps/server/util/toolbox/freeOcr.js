import crypto from 'node:crypto';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { getObjectBufferFromObs } from '../obsClient.js';
import { validateDocumentDescriptor, parseDocumentBuffer } from '../aiDocument/parser.js';
import { localOcrProvider } from '../aiDocument/localOcr.js';
import { toolboxError } from './errors.js';

export const FREE_OCR_POLICY = Object.freeze({
  maxFiles: 5,
  maxBytes: 20 * 1024 * 1024,
  maxPages: 20,
  dailyPages: 50,
  activeJobs: 1,
  timezone: 'Asia/Shanghai',
});
export { FREE_OCR_SCHEMA } from './freeOcrSchema.js';
export function ocrUsageDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}
export async function getFreeOcrUsage(database, userId) {
  const date = ocrUsageDate();
  const [rows] = await database.query(
    'SELECT used_pages, reserved_pages FROM toolbox_ocr_usage WHERE user_id = ? AND usage_date = ?',
    [userId, date],
  );
  return {
    ...FREE_OCR_POLICY,
    remainingPages: Math.max(
      0,
      FREE_OCR_POLICY.dailyPages - Number(rows[0]?.used_pages || 0) - Number(rows[0]?.reserved_pages || 0),
    ),
    resetsAt: new Date(Date.parse(`${date}T00:00:00+08:00`) + 86400_000).toISOString(),
  };
}
export async function prepareFreeOcrInputs(database, userId, snapshot) {
  const descriptors = [];
  for (const ref of snapshot.resourceRefs) {
    const [rows] = await database.query(
      'SELECT id, file_name, file_type, file_size, obs_key AS object_key FROM files WHERE id = ? AND create_by = ? AND del_flag = 0',
      [ref.id, userId],
    );
    if (!rows[0]) throw toolboxError('TOOLBOX_RESOURCE_UNAVAILABLE', '文件已不可用', 404);
    descriptors.push({ ...rows[0], kind: 'file', version: ref.version });
  }
  for (const id of snapshot.sourceIds) {
    const [rows] = await database.query(
      'SELECT id, file_name, file_type, file_size, object_key FROM ai_document_sources WHERE id = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > NOW())',
      [id, userId],
    );
    if (!rows[0]) throw toolboxError('TOOLBOX_DOCUMENT_SOURCE_UNAVAILABLE', '上传文件已不可用', 404);
    descriptors.push({ ...rows[0], kind: 'upload' });
  }
  if (!descriptors.length || descriptors.length > FREE_OCR_POLICY.maxFiles)
    throw toolboxError('TOOLBOX_OCR_FILE_LIMIT', '每次选择 1 至 5 个文件');
  if (descriptors.reduce((sum, item) => sum + Number(item.file_size), 0) > FREE_OCR_POLICY.maxBytes)
    throw toolboxError('TOOLBOX_UPLOAD_TOO_LARGE', '文件总大小不能超过 20 MB', 413);
  const result = [];
  for (const descriptor of descriptors) {
    const buffer = await getObjectBufferFromObs(descriptor.object_key);
    if (buffer.length !== Number(descriptor.file_size))
      throw toolboxError('TOOLBOX_RESOURCE_STALE', '文件已变化，请重新选择', 409);
    const meta = validateDocumentDescriptor({
      fileName: descriptor.file_name,
      fileType: descriptor.file_type,
      fileSize: buffer.length,
    });
    const pages = meta.extension === '.pdf' ? Number((await pdfParse(buffer, { max: 1 })).numpages) : 1;
    if (!Number.isInteger(pages) || pages < 1 || pages > 20)
      throw toolboxError('TOOLBOX_OCR_PAGE_LIMIT', '每次最多识别 20 页');
    result.push({ descriptor, pages, hash: crypto.createHash('sha256').update(buffer).digest('hex') });
  }
  if (result.reduce((sum, item) => sum + item.pages, 0) > 20)
    throw toolboxError('TOOLBOX_OCR_PAGE_LIMIT', '每次合计最多识别 20 页');
  return result;
}
/** Caller holds the owner's row lock and writes the job in the same transaction. */
export async function reserveFreeOcr(connection, userId, jobId, inputs) {
  const date = ocrUsageDate();
  const [active] = await connection.query(
    "SELECT id FROM toolbox_jobs WHERE user_id = ? AND tool_id = 'ocr_to_text' AND status IN ('queued','processing') LIMIT 1 FOR UPDATE",
    [userId],
  );
  if (active.length) throw toolboxError('TOOLBOX_OCR_BUSY', '已有识别任务，请完成后再试', 409);
  await connection.query('INSERT IGNORE INTO toolbox_ocr_usage (user_id, usage_date) VALUES (?, ?)', [userId, date]);
  const [usage] = await connection.query(
    'SELECT * FROM toolbox_ocr_usage WHERE user_id = ? AND usage_date = ? FOR UPDATE',
    [userId, date],
  );
  let total = 0;
  for (let index = 0; index < inputs.length; index++) {
    const item = inputs[index];
    const [cached] = await connection.query(
      `SELECT input.result_json FROM toolbox_ocr_inputs input JOIN toolbox_jobs job ON job.id COLLATE utf8mb4_unicode_ci = input.job_id
      WHERE input.user_id = ? AND input.content_hash = ? AND input.status = 'complete' AND job.expires_at > NOW() LIMIT 1`,
      [userId, item.hash],
    );
    const cache = cached[0]?.result_json;
    if (!cache) total += item.pages;
    await connection.query(
      `INSERT INTO toolbox_ocr_inputs (job_id,input_index,user_id,usage_date,source_json,content_hash,pages,status,result_json)
      VALUES (?,?,?,?,?,?,?, ?,?)`,
      [
        jobId,
        index,
        userId,
        date,
        JSON.stringify(item.descriptor),
        item.hash,
        cache ? 0 : item.pages,
        cache ? 'complete' : 'pending',
        cache ? (typeof cache === 'string' ? cache : JSON.stringify(cache)) : null,
      ],
    );
  }
  if (Number(usage[0].used_pages) + Number(usage[0].reserved_pages) + total > FREE_OCR_POLICY.dailyPages)
    throw toolboxError(
      'TOOLBOX_OCR_DAILY_LIMIT',
      '今日识别用量不足，请明天再试',
      429,
      await getFreeOcrUsage(connection, userId),
    );
  await connection.query(
    'UPDATE toolbox_ocr_usage SET reserved_pages = reserved_pages + ? WHERE user_id = ? AND usage_date = ?',
    [total, userId, date],
  );
}
export async function settleFreeOcr(connection, job) {
  const [rows] = await connection.query(
    'SELECT * FROM toolbox_ocr_inputs WHERE job_id = ? AND user_id = ? FOR UPDATE',
    [job.id, job.user_id],
  );
  for (const row of rows) {
    if (!Number(row.pages)) continue;
    await connection.query(
      'UPDATE toolbox_ocr_usage SET reserved_pages = GREATEST(0, reserved_pages - ?), used_pages = used_pages + ? WHERE user_id = ? AND usage_date = ?',
      [row.pages, row.attempted_pages, job.user_id, row.usage_date],
    );
    await connection.query('UPDATE toolbox_ocr_inputs SET pages = 0 WHERE job_id = ? AND input_index = ?', [
      job.id,
      row.input_index,
    ]);
  }
  await connection.query(
    "UPDATE toolbox_jobs SET billing_status = 'settled', actual_points = 0 WHERE id = ? AND user_id = ? AND billing_medium = 'free'",
    [job.id, job.user_id],
  );
  return { billingStatus: 'settled', actualPoints: 0, refundedPoints: 0, replay: false };
}
export async function executeFreeOcr(job, database) {
  const [rows] = await database.query(
    'SELECT * FROM toolbox_ocr_inputs WHERE job_id = ? AND user_id = ? ORDER BY input_index',
    [job.id, job.user_id],
  );
  const outputs = [];
  for (const row of rows) {
    const source = typeof row.source_json === 'string' ? JSON.parse(row.source_json) : row.source_json;
    const [available] = await database.query(
      source.kind === 'file'
        ? 'SELECT obs_key AS object_key FROM files WHERE id = ? AND create_by = ? AND del_flag = 0'
        : 'SELECT object_key FROM ai_document_sources WHERE id = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > NOW())',
      [source.id, job.user_id],
    );
    if (!available[0] || available[0].object_key !== source.object_key)
      throw toolboxError('TOOLBOX_RESOURCE_UNAVAILABLE', '文件已不可用，请重新选择', 404);
    let result = typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json;
    if (!result) {
      const buffer = await getObjectBufferFromObs(source.object_key);
      if (crypto.createHash('sha256').update(buffer).digest('hex') !== row.content_hash)
        throw toolboxError('TOOLBOX_RESOURCE_STALE', '文件已变化，请重新选择', 409);
      const markPage = async (page) => {
        const [changed] = await database.query(
          `UPDATE toolbox_ocr_inputs input JOIN toolbox_jobs job ON job.id COLLATE utf8mb4_unicode_ci = input.job_id
          SET input.attempted_pages = GREATEST(input.attempted_pages, ?)
          WHERE input.job_id = ? AND input.input_index = ? AND job.status = 'processing' AND job.locked_by = ?`,
          [page, job.id, row.input_index, job.locked_by],
        );
        if (!changed.affectedRows) throw toolboxError('TOOLBOX_JOB_LEASE_LOST', '识别任务已停止', 409);
      };
      const saveInputResult = async (status, value) => {
        const [changed] = await database.query(
          `UPDATE toolbox_ocr_inputs input JOIN toolbox_jobs job ON job.id COLLATE utf8mb4_unicode_ci = input.job_id
          SET input.status = ?, input.result_json = ?
          WHERE input.job_id = ? AND input.input_index = ? AND job.status = 'processing' AND job.locked_by = ?`,
          [status, JSON.stringify(value), job.id, row.input_index, job.locked_by],
        );
        if (!changed.affectedRows) throw toolboxError('TOOLBOX_JOB_LEASE_LOST', '识别任务已停止', 409);
      };
      try {
        result = await parseDocumentBuffer(
          buffer,
          { fileName: source.file_name, fileType: source.file_type, fileSize: buffer.length },
          {
            ocrProvider: {
              recognizePdf: (data, options) =>
                localOcrProvider.recognizePdf(data, { ...options, onPageStart: markPage }),
              recognizeImage: async (data, options) => {
                await markPage(1);
                return localOcrProvider.recognizeImage(data, options);
              },
            },
          },
        );
        await saveInputResult('complete', result);
      } catch (error) {
        if (error?.code === 'TOOLBOX_JOB_LEASE_LOST') throw error;
        result = { text: '', coverage: { complete: false, warnings: ['ocr_failed'] } };
        await saveInputResult('failed', result);
      }
    }
    outputs.push({ source, result });
  }
  const readable = outputs.filter(({ result }) => String(result.text || '').trim());
  if (!readable.length) throw toolboxError('TOOLBOX_OCR_EMPTY', '未识别到文字，请换用清晰文件');
  const partial = readable.length !== rows.length || outputs.some(({ result }) => result.coverage?.complete === false);
  return {
    type: 'ocr_text',
    title: '文字识别结果',
    contentType: 'markdown',
    content: readable
      .map(({ source, result }) => `# ${String(source.file_name).replace(/[\r\n#]/g, ' ')}\n\n${result.text}`)
      .join('\n\n---\n\n'),
    sources: outputs.map(({ source, result }) => ({
      id: source.id,
      type: source.kind === 'file' ? 'file' : 'document',
      title: source.file_name,
      coverage: result.coverage,
    })),
    coverage: { complete: !partial, warnings: partial ? ['ocr_partial'] : [] },
    meta: { sourceCount: rows.length },
    outcome: partial ? 'partial_succeeded' : 'succeeded',
  };
}
