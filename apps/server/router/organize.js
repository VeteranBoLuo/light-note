import express from 'express';
import * as organizeHandle from '../router_handle/organizeHandle.js';
import { localProcessingRateLimiter } from '../util/requestRateLimit.js';

import * as suggestions from '../router_handle/organizeSuggestionHandle.js';

const router = express.Router();

router.get('/summary', organizeHandle.summary);
router.get('/knowledge-structure/summary', localProcessingRateLimiter, organizeHandle.knowledgeStructureSummary);
router.get(
  '/issues/:issueType',
  (req, res, next) =>
    req.params.issueType === 'knowledge_structure' ? localProcessingRateLimiter(req, res, next) : next(),
  organizeHandle.listIssues,
);
router.post('/untagged/ignore', organizeHandle.ignoreUntagged);
router.delete('/untagged/ignore', organizeHandle.unignoreUntagged);
router.get('/duplicate-bookmarks/:groupKey/preview', organizeHandle.duplicatePreview);
router.post('/duplicate-bookmarks/:groupKey/resolve', organizeHandle.resolveDuplicate);
router.post('/duplicate-bookmarks/:groupKey/ignore', organizeHandle.ignoreDuplicate);
router.delete('/duplicate-bookmarks/:groupKey/ignore', organizeHandle.unignoreDuplicate);
router.get('/bookmark-health', organizeHandle.bookmarkHealth);
router.post('/bookmark-health/scan', organizeHandle.startHealthScan);
// 兼容已经打开的旧前端；语义已升级为创建或复用一次全量后台任务。
router.post('/bookmark-health/check-batch', organizeHandle.startHealthScan);
router.post('/bookmark-health/:bookmarkId/recheck', organizeHandle.recheckHealth);
router.post('/bookmark-health/:bookmarkId/mark-normal', organizeHandle.markHealthNormal);
router.delete('/bookmark-health/:bookmarkId/mark-normal', organizeHandle.unmarkHealthNormal);
router.post('/ai-suggestions/estimate', localProcessingRateLimiter, organizeHandle.estimateAiSuggestions);
router.post('/ai-suggestions/batches', localProcessingRateLimiter, organizeHandle.createAiSuggestionBatch);
router.get('/ai-suggestions/batches', organizeHandle.listAiSuggestionBatches);
router.get('/ai-suggestions/batches/:batchId', organizeHandle.getAiSuggestionBatch);
router.put(
  '/ai-suggestions/batches/:batchId/suggestions/:suggestionId',
  localProcessingRateLimiter,
  organizeHandle.editAiSuggestion,
);
router.post(
  '/ai-suggestions/batches/:batchId/suggestions/:suggestionId/accept',
  localProcessingRateLimiter,
  organizeHandle.acceptAiSuggestion,
);
router.post(
  '/ai-suggestions/batches/:batchId/suggestions/:suggestionId/ignore',
  localProcessingRateLimiter,
  organizeHandle.ignoreAiSuggestion,
);

router.post('/suggestions/previews', localProcessingRateLimiter, suggestions.preview);
router.get('/suggestions/runs', suggestions.list);
router.get('/suggestions/runs/:id', suggestions.get);
router.post('/suggestions/runs/:id/start', localProcessingRateLimiter, suggestions.start);
router.post('/suggestions/runs/:id/cancel', suggestions.cancel);
router.post('/suggestions/runs/:id/pause', suggestions.pause);
router.post('/suggestions/runs/:id/resume', localProcessingRateLimiter, suggestions.resume);
router.post('/suggestions/runs/:id/items/:suggestionId/actions', localProcessingRateLimiter, suggestions.act);

export default router;
