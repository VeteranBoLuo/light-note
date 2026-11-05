import express from 'express';
import * as organizeHandle from '../router_handle/organizeHandle.js';
import { localProcessingRateLimiter } from '../util/requestRateLimit.js';

import * as suggestions from '../router_handle/organizeSuggestionHandle.js';

const router = express.Router();

router.get('/summary', organizeHandle.summary);
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
router.post('/bookmark-health/:bookmarkId/recheck', organizeHandle.recheckHealth);
router.post('/bookmark-health/:bookmarkId/mark-normal', organizeHandle.markHealthNormal);
router.delete('/bookmark-health/:bookmarkId/mark-normal', organizeHandle.unmarkHealthNormal);

router.post('/suggestions/previews', localProcessingRateLimiter, suggestions.preview);
router.get('/suggestions/runs', suggestions.list);
router.get('/suggestions/workspace', suggestions.workspace);
router.get('/suggestions/runs/:id', suggestions.get);
router.post('/suggestions/runs/:id/retry-preview', localProcessingRateLimiter, suggestions.retryFiles);
router.post('/suggestions/runs/:id/start', localProcessingRateLimiter, suggestions.start);
router.post('/suggestions/runs/:id/cancel', suggestions.cancel);
router.post('/suggestions/runs/:id/pause', suggestions.pause);
router.post('/suggestions/runs/:id/resume', localProcessingRateLimiter, suggestions.resume);
router.post('/suggestions/runs/:id/items/:suggestionId/actions', localProcessingRateLimiter, suggestions.act);

router.get('/suggestions/runs/:id/items/:suggestionId/archive-preview', suggestions.archiveDraft);

router.post('/suggestions/runs/:id/apply-batch', localProcessingRateLimiter, suggestions.applyBatch);

export default router;
