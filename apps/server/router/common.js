import express from 'express';
const router = express.Router();

import * as commonHandle from '../router_handle/commonHandle.js';
import { recordAiEvent } from '../router_handle/aiTelemetryHandle.js';

router.post('/getApiLogs', commonHandle.getApiLogs);

router.get('/clearApiLogs', commonHandle.clearApiLogs);

router.post('/recordOperationLogs', commonHandle.recordOperationLogs);

router.post('/recordAiEvent', recordAiEvent);

router.post('/recordConversion', commonHandle.recordConversion);

router.post('/getConversionFunnel', commonHandle.getConversionFunnel);

router.post('/getOperationLogs', commonHandle.getOperationLogs);

router.post('/getLogExclude', commonHandle.getLogExclude);

router.post('/addLogExclude', commonHandle.addLogExcludeFp);

router.post('/removeLogExclude', commonHandle.removeLogExcludeFp);

router.get('/clearOperationLogs', commonHandle.clearOperationLogs);

router.post('/getIpLogStats', commonHandle.getIpLogStats);

router.post('/clearLogsByIp', commonHandle.clearLogsByIp);

router.post('/analyzeImgUrl', commonHandle.analyzeImgUrl);

router.post('/getImages', commonHandle.getImages);

router.post('/clearImages', commonHandle.clearImages);

router.post('/runSql', commonHandle.runSql);

router.post('/getHelpConfig', commonHandle.getHelpConfig);

router.post('/resolveHelpSources', commonHandle.resolveHelpSources);

router.get('/noticeSummary', commonHandle.getNoticeSummary);

// router.post('/updateFolder', commonHandle.updateFolder);
// router.post('/deleteFolder', commonHandle.deleteFolder);
router.post('/getAgentLogs', commonHandle.getAgentLogs);
router.post('/getAgentLogsSummary', commonHandle.getAgentLogsSummary);
router.post('/getAiFeedback', commonHandle.getAiFeedback);
router.post('/getDeepSeekBalance', commonHandle.getDeepSeekBalance);
router.post('/getAdminOverview', commonHandle.getAdminOverview);

export default router;
