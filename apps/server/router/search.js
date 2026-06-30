import express from 'express';
import * as searchHandle from '../router_handle/searchHandle.js';

const router = express.Router();

router.post('/global', searchHandle.globalSearch);
router.post('/batchUpdateResourceTags', searchHandle.batchUpdateResourceTags);
router.post('/batchResourceTagWorkspace', searchHandle.getBatchResourceTagWorkspace);
router.post('/batchDeleteResources', searchHandle.batchDeleteResources);

export default router;
