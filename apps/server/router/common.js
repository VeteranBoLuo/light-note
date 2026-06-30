import express from 'express';
const router = express.Router();

import * as commonHandle from '../router_handle/commonHandle.js';

router.post('/getApiLogs', commonHandle.getApiLogs);

router.get('/clearApiLogs', commonHandle.clearApiLogs);

router.post('/recordOperationLogs', commonHandle.recordOperationLogs);

router.post('/getOperationLogs', commonHandle.getOperationLogs);

router.get('/clearOperationLogs', commonHandle.clearOperationLogs);

router.post('/analyzeImgUrl', commonHandle.analyzeImgUrl);

router.post('/getImages', commonHandle.getImages);

router.post('/clearImages', commonHandle.clearImages);

router.post('/runSql', commonHandle.runSql);

router.post('/getHelpConfig', commonHandle.getHelpConfig);

router.get('/noticeSummary', commonHandle.getNoticeSummary);




// router.post('/updateFolder', commonHandle.updateFolder);
// router.post('/deleteFolder', commonHandle.deleteFolder);
router.post('/getAgentLogs', commonHandle.getAgentLogs);
router.post('/getAgentLogsSummary', commonHandle.getAgentLogsSummary);

export default router;
