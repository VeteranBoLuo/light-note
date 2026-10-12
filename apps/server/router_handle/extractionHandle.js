import { resultData } from '../util/common.js';
import { ensureUserOrAdminPolicy } from '../util/auth.js';
import { parseToolboxError, toolboxError } from '../util/toolbox/errors.js';
import * as service from '../util/extraction/service.js';
import { buildExtractionExport, extractionNoteSummary } from '../util/extraction/export.js';
function owner(req, write = false) {
  if (write && (req.adminContext || !['user', 'test', 'root'].includes(req.user?.role)))
    throw toolboxError('EXTRACTION_WRITE_FORBIDDEN', '仅正式账号本人可修改提取表', 403);
  const id = (req.resourceUser || req.user)?.id;
  if (!id) throw toolboxError('EXTRACTION_AUTH_REQUIRED', '请先登录', 401);
  return id;
}
function endpoint(work, write = false) {
  return async (req, res) => {
    if (!write && !ensureUserOrAdminPolicy(req, res, ['read'])) return;
    try {
      const data = await work({ userId: owner(req, write), id: req.params.id, input: req.body || {} }, req, res);
      if (!res.headersSent) res.send(resultData(data));
    } catch (error) {
      const parsed = parseToolboxError(error);
      res.status(parsed.status).send(resultData(parsed.data, parsed.status, parsed.message));
    }
  };
}
export const list = endpoint((options) => service.listExtractions(options));
export const create = endpoint((options) => service.createExtraction(options), true);
export const read = endpoint((options) => service.readExtraction(options));
export const action = endpoint((options) => service.actOnExtraction(options), true);
function filter(query = {}) {
  return {
    sortField: typeof query.sortField === 'string' ? query.sortField : undefined,
    sortOrder: query.sortOrder === 'desc' ? 'desc' : 'asc',
    search: String(query.search || '').slice(0, 200),
    sourceId: typeof query.sourceId === 'string' ? query.sourceId : undefined,
    review: query.review === 'pending' ? 'pending' : undefined,
    anomalies: query.anomalies === true || query.anomalies === 'true',
    excluded: query.excluded === true || query.excluded === 'true',
  };
}
export const records = endpoint((options, req) =>
  service.readRecords({ ...options, filter: filter(req.query), page: req.query.page }),
);
export const review = endpoint(
  (options, req) => service.reviewExtractionRecord({ ...options, recordId: req.params.recordId }),
  true,
);
export const remove = endpoint(
  (options) => service.deleteExtraction({ ...options, version: options.input.version }),
  true,
);
export const exportData = endpoint(async (options, _req, res) => {
  if (!['all', 'filtered'].includes(options.input.scope))
    throw toolboxError('EXTRACTION_EXPORT_SCOPE', '请选择导出范围');
  const snapshot = await service.recordSnapshot({
    ...options,
    filter: options.input.scope === 'filtered' ? filter(options.input.filter) : {},
  });
  const result = await buildExtractionExport(snapshot, options.input.format);
  res
    .set('Content-Type', result.mime)
    .set(
      'Content-Disposition',
      `attachment; filename="extraction.${result.extension}"; filename*=UTF-8''${encodeURIComponent(snapshot.table.title)}.${result.extension}`,
    )
    .send(result.data);
});

export const source = endpoint((options, req) =>
  service.inspectExtractionSource({ ...options, sourceId: req.params.sourceId }),
);
export const noteSummary = endpoint(async (options) => {
  if (!['all', 'filtered'].includes(options.input.scope))
    throw toolboxError('EXTRACTION_EXPORT_SCOPE', '请选择导出范围');
  const snapshot = await service.recordSnapshot({
    ...options,
    filter: options.input.scope === 'filtered' ? filter(options.input.filter) : {},
  });
  return extractionNoteSummary(snapshot, options.input.locale);
});

export const nextPending = endpoint((options, req) =>
  service.nextPendingCell({
    ...options,
    filter: filter(req.query),
    recordId: req.query.recordId,
    fieldId: req.query.fieldId,
    direction: req.query.direction === '-1' ? -1 : 1,
  }),
);
