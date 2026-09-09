import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import * as service from '../util/services/organizeSuggestionService.js';

function handler(write, work) {
  return async (req, res) => {
    if (write && !ensureNotVisitor(req, res)) return;
    const user = req.resourceUser || req.user;
    if (!user?.id) return res.status(401).send(resultData(null, 401, '请先登录'));
    try {
      return res.send(resultData(await work(req, String(user.id))));
    } catch (error) {
      const missing = ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code);
      const status = missing ? 503 : [400, 401, 403, 404, 409, 429, 503].includes(error.status) ? error.status : 500;
      return res
        .status(status)
        .send(
          resultData(
            { code: missing ? 'ORGANIZE_SCHEMA_NOT_READY' : error.code || 'ORGANIZE_FAILED' },
            status,
            missing ? '整理服务尚未就绪，请稍后重试' : status === 500 ? '整理暂时不可用，请重试' : error.message,
          ),
        );
    }
  };
}
export const preview = handler(true, (req, userId) =>
  service.previewSuggestionRun(pool, { userId, input: req.body, requestId: req.body?.requestId }),
);
export const start = handler(true, (req, userId) =>
  service.createSuggestionRun(pool, {
    userId,
    id: req.params.id,
    requestId: req.body?.requestId,
    replaceRunId: req.body?.replaceRunId,
  }),
);
export const list = handler(false, (_req, userId) => service.listSuggestionRuns(pool, { userId }));
export const get = handler(false, (req, userId) =>
  service.getSuggestionRun(pool, {
    userId,
    id: req.params.id,
    after: String(req.query.after || ''),
    resourceType: String(req.query.resourceType || ''),
    kind: String(req.query.kind || ''),
  }),
);
export const cancel = handler(true, (req, userId) => service.cancelSuggestionRun(pool, { userId, id: req.params.id }));
export const pause = handler(true, (req, userId) => service.pauseSuggestionRun(pool, { userId, id: req.params.id }));
export const resume = handler(true, (req, userId) => service.resumeSuggestionRun(pool, { userId, id: req.params.id }));
export const act = handler(true, (req, userId) =>
  service.actOnSuggestion(pool, {
    userId,
    runId: req.params.id,
    suggestionId: req.params.suggestionId,
    action: req.body?.action,
    value: req.body?.value,
    requestId: req.body?.requestId,
  }),
);

export const retryFiles = handler(true, (req, userId) =>
  service.previewFileRetry(pool, { userId, id: req.params.id, requestId: req.body?.requestId }),
);

export const archiveDraft = handler(false, (req, userId) =>
  service.getArchiveDraft(pool, { userId, runId: req.params.id, suggestionId: req.params.suggestionId }),
);
