import express from 'express';
import multer from 'multer';

const router = express.Router();

import * as bookmarkHandle from '../router_handle/bookmarkHandle.js';
import * as tagGraphHandle from '../router_handle/tagGraphHandle.js';

const upload = multer({ dest: '/' }); // 临时目录用于上传文件

router.post('/queryTagList', bookmarkHandle.queryTagList);

router.post('/updateTagSort', bookmarkHandle.updateTagSort);

router.post('/getTagDetail', bookmarkHandle.getTagDetail);

router.post('/getRelatedTag', bookmarkHandle.getRelatedTag);

router.post('/getTagGraph', tagGraphHandle.getTagGraph);

router.post('/getGlobalGraph', tagGraphHandle.getGlobalGraph);

router.post('/getBookmarkList', bookmarkHandle.getBookmarkList);

router.post('/addTag', bookmarkHandle.addTag);

router.post('/delTag', bookmarkHandle.delTag);

router.post('/updateTag', bookmarkHandle.updateTag);

router.post('/addBookmark', bookmarkHandle.addBookmark);

router.post('/getBookmarkDetail', bookmarkHandle.getBookmarkDetail);

router.post('/delBookmark', bookmarkHandle.delBookmark);

router.post('/updateBookmark', bookmarkHandle.updateBookmark);

router.post('/getCommonBookmarks', bookmarkHandle.getCommonBookmarks);

router.post('/updateBookmarkSort', bookmarkHandle.updateBookmarkSort);

router.post('/toggleBookmarkTop', bookmarkHandle.toggleBookmarkTop);

router.post('/importBookmarksHtml', upload.single('file'), bookmarkHandle.importBookmarksHtml);

router.post('/archive', bookmarkHandle.doArchiveBookmark);

router.post('/snapshot', bookmarkHandle.getSnapshot);

router.post('/summarize', bookmarkHandle.doSummarizeBookmark);

router.post('/health/check', bookmarkHandle.doCheckHealth);

router.post('/health/checkAll', bookmarkHandle.doCheckAllHealth);

router.post('/health/reset', bookmarkHandle.doResetHealth);

router.get('/health', bookmarkHandle.getHealth);

router.post('/health/ignore', bookmarkHandle.doIgnoreHealth);

// AI 自动整理(批量打标签)
router.post('/ai/organize/quote', bookmarkHandle.doOrganizeQuote);
router.post('/ai/organize/run', bookmarkHandle.doOrganizeRun);
router.post('/ai/organize/apply', bookmarkHandle.doOrganizeApply);

export default router;
