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
router.post('/bookmark-health/scan', organizeHandle.startHealthScan);
// 兼容已经打开的旧前端；语义已升级为创建或复用一次全量后台任务。
router.post('/bookmark-health/check-batch', organizeHandle.startHealthScan);
router.post('/bookmark-health/:bookmarkId/recheck', organizeHandle.recheckHealth);
router.post('/bookmark-health/:bookmarkId/mark-normal', organizeHandle.markHealthNormal);
router.delete('/bookmark-health/:bookmarkId/mark-normal', organizeHandle.unmarkHealthNormal);

export default router;
