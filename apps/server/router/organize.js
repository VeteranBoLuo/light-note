import express from 'express';
import * as organizeHandle from '../router_handle/organizeHandle.js';

const router = express.Router();

router.get('/summary', organizeHandle.summary);
router.get('/issues/:issueType', organizeHandle.listIssues);
router.post('/untagged/ignore', organizeHandle.ignoreUntagged);
router.delete('/untagged/ignore', organizeHandle.unignoreUntagged);
router.get('/duplicate-bookmarks/:groupKey/preview', organizeHandle.duplicatePreview);
router.post('/duplicate-bookmarks/:groupKey/resolve', organizeHandle.resolveDuplicate);
router.post('/duplicate-bookmarks/:groupKey/ignore', organizeHandle.ignoreDuplicate);
router.delete('/duplicate-bookmarks/:groupKey/ignore', organizeHandle.unignoreDuplicate);
router.get('/bookmark-health', organizeHandle.bookmarkHealth);
router.post('/bookmark-health/check-batch', organizeHandle.checkHealthBatch);
router.post('/bookmark-health/:bookmarkId/recheck', organizeHandle.recheckHealth);
router.post('/bookmark-health/:bookmarkId/mark-normal', organizeHandle.markHealthNormal);
router.delete('/bookmark-health/:bookmarkId/mark-normal', organizeHandle.unmarkHealthNormal);

export default router;
