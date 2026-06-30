import express from 'express';
const router = express.Router();

import * as kbHandle from '../router_handle/knowledgeBaseHandle.js';

router.post('/list', kbHandle.listKnowledgeBase);
router.post('/get', kbHandle.getKnowledgeBaseItem);
router.post('/search', kbHandle.searchKnowledgeBase);
router.post('/create', kbHandle.createKnowledgeBase);
router.post('/update', kbHandle.updateKnowledgeBase);
router.post('/delete', kbHandle.deleteKnowledgeBase);
router.post('/batchUpdateStatus', kbHandle.batchUpdateKnowledgeStatus);
router.post('/batchUpdateCategory', kbHandle.batchUpdateKnowledgeCategory);
router.post('/batchDelete', kbHandle.batchDeleteKnowledgeBase);
router.post('/categories', kbHandle.getKnowledgeCategories);

export default router;
