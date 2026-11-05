import express from 'express';

const router = express.Router();

import * as bookmarkHandle from '../router_handle/bookmarkHandle.js';
import * as tagGraphHandle from '../router_handle/tagGraphHandle.js';
import * as tagSpaceHandle from '../router_handle/tagSpaceHandle.js';
import { aiActionRateLimiter, expensiveFreeActionRateLimiter } from '../util/requestRateLimit.js';
import { createBookmarkHtmlUpload } from '../util/bookmarkHtmlUpload.js';

const bookmarkHtmlUpload = createBookmarkHtmlUpload();

router.post('/queryTagList', bookmarkHandle.queryTagList);

router.post('/queryTagSpaces', tagSpaceHandle.queryTagSpaces);

router.post('/getTagSpace', tagSpaceHandle.getTagSpace);

router.post('/queryTagSpaceResources', tagSpaceHandle.queryTagSpaceResourceList);

router.post('/updateTagSort', bookmarkHandle.updateTagSort);


router.post('/getTagEditorData', tagSpaceHandle.getTagEditorData);

router.post('/getRelatedTag', bookmarkHandle.getRelatedTag);

router.post('/getTagGraph', tagGraphHandle.getTagGraph);


router.post('/getBookmarkList', bookmarkHandle.getBookmarkList);

router.post('/addTag', bookmarkHandle.addTag);

router.post('/delTag', bookmarkHandle.delTag);

router.post('/updateTag', bookmarkHandle.updateTag);

router.post('/addBookmark', bookmarkHandle.addBookmark);

router.post('/resolveUrl', bookmarkHandle.resolveBookmarkUrl);

router.post('/getBookmarkDetail', bookmarkHandle.getBookmarkDetail);

router.post('/delBookmark', bookmarkHandle.delBookmark);

router.post('/updateBookmark', bookmarkHandle.updateBookmark);


router.post('/updateBookmarkSort', bookmarkHandle.updateBookmarkSort);

router.post('/toggleBookmarkTop', bookmarkHandle.toggleBookmarkTop);

router.post('/importBookmarksHtml', bookmarkHtmlUpload, bookmarkHandle.importBookmarksHtml);

router.post('/importBookmarksExcel', bookmarkHandle.importBookmarksExcel);

router.post('/archive', expensiveFreeActionRateLimiter, bookmarkHandle.doArchiveBookmark);


router.post('/snapshot', bookmarkHandle.getSnapshot);

router.post('/summarize', aiActionRateLimiter, bookmarkHandle.doSummarizeBookmark);



router.post('/health/checkAll', bookmarkHandle.doCheckAllHealth);

router.post('/health/reset', bookmarkHandle.doResetHealth);

router.get('/health', bookmarkHandle.getHealth);

router.post('/health/ignore', bookmarkHandle.doIgnoreHealth);

// 书签图标批次进度与重试
router.post('/getIconBatchStatus', bookmarkHandle.getIconBatchStatusHandler);
router.post('/retryIconBatchFailures', bookmarkHandle.retryIconBatchFailuresHandler);

export default router;
