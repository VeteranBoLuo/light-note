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

router.post('/importBookmarksHtml', upload.single('file'), bookmarkHandle.importBookmarksHtml);

export default router;
