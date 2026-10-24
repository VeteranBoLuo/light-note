import { ensureRootRole } from '../util/rootRole.js';
import { combinedSearch } from '../util/publicResources/combinedSearch.js';
import { resultData } from '../util/agent/data.js';
import { capabilities, receipt, PublicResourceError } from '../util/publicResources/core.js';
import * as publications from '../util/publicResources/publications.js';
import * as read from '../util/publicResources/read.js';
import * as moderation from '../util/publicResources/moderation.js';
import { save, savedSource } from '../util/publicResources/saved.js';
import { workspace } from '../util/publicResources/workspace.js';
import { prepareBatch, authorBatch, moderationBatch } from '../util/publicResources/batch.js';

export function handle(service, root = false) {
  return async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.adminContext)
      return res
        .status(403)
        .send(
          resultData(
            { code: 'PUBLIC_RESOURCE_ADMIN_CONTEXT_FORBIDDEN' },
            403,
            '请退出管理员代管 / Exit administrator preview',
          ),
        );
    if (root && !(await ensureRootRole(req, res))) return;
    try {
      return res.send(
        resultData(
          await service({
            user: req.user,
            id: req.params.id,
            input: req.method === 'GET' ? req.query : req.body,
            lang: req.headers['x-lang'] === 'en-US' ? 'en-US' : 'zh-CN',
          }),
        ),
      );
    } catch (error) {
      const known = error instanceof PublicResourceError,
        status = known ? error.status : 503;
      return res
        .status(status)
        .send(
          resultData(
            { code: known ? error.code : 'PUBLIC_RESOURCE_UNAVAILABLE' },
            status,
            '操作暂未完成，请刷新状态后重试 / Refresh the current state and retry',
          ),
        );
    }
  };
}
export const publicResourceHandlers = {
  workspace: handle(workspace),
  prepareBatch: handle(prepareBatch),
  authorBatch: handle(authorBatch),
  moderationBatch: handle(moderationBatch, true),
  combinedSearch: handle(combinedSearch),
  capabilities: handle(capabilities),
  receipt: handle(receipt),
  candidates: handle(publications.candidates),
  preview: handle(publications.preview),
  submit: handle(publications.submit),
  own: handle(publications.own),
  resolveOwn: handle(publications.resolveOwn),
  ownDetail: handle(publications.ownDetail),
  withdraw: handle(publications.withdraw),
  search: handle(read.search),
  suggest: handle(read.suggestions),
  detail: handle(read.detail),
  save: handle(save),
  savedSource: handle(savedSource),
  report: handle(moderation.report),
  queue: handle(moderation.queue, true),
  moderationDetail: handle(moderation.moderationDetail, true),
  decide: handle(moderation.decide, true),
  handleReport: handle(moderation.handleReport, true),
  reportDetail: handle(moderation.reportDetail, true),
  history: handle(moderation.history, true),
};
