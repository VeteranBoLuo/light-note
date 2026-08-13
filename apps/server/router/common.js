import express from 'express';
const router = express.Router();

import * as commonHandle from '../router_handle/commonHandle.js';
import {
  dismissAdminAsyncJob,
  getAdminActionCenter,
  getAdminFilePreviewDiagnostic,
  getAdminTodoReminderDiagnostic,
  retryAdminAsyncJob,
} from '../router_handle/adminActionCenterHandle.js';
import { getAdminOperationAudits } from '../router_handle/adminAuditHandle.js';
import { updateAdminAiFeedbackTriage } from '../router_handle/adminAiFeedbackHandle.js';
import { getAdminGovernance, getAdminProductInsights } from '../router_handle/adminInsightsHandle.js';
import { recordAiEvent } from '../router_handle/aiTelemetryHandle.js';

router.post('/getApiLogs', commonHandle.getApiLogs);

router.post('/getApiLogDetail', commonHandle.getApiLogDetail);

router.post('/clearApiLogs', commonHandle.clearApiLogs);

router.post('/recordOperationLogs', commonHandle.recordOperationLogs);

router.post('/recordAiEvent', recordAiEvent);

router.post('/recordConversion', commonHandle.recordConversion);

router.post('/getConversionFunnel', commonHandle.getConversionFunnel);

router.post('/getOperationLogs', commonHandle.getOperationLogs);

router.post('/getLogExclude', commonHandle.getLogExclude);

router.post('/addLogExclude', commonHandle.addLogExcludeFp);

router.post('/removeLogExclude', commonHandle.removeLogExcludeFp);

router.post('/clearOperationLogs', commonHandle.clearOperationLogs);

router.post('/getIpLogStats', commonHandle.getIpLogStats);

router.post('/clearLogsByIp', commonHandle.clearLogsByIp);

router.post('/analyzeImgUrl', commonHandle.analyzeImgUrl);

router.post('/getImages', commonHandle.getImages);

router.post('/getHelpConfig', commonHandle.getHelpConfig);

router.post('/resolveHelpSources', commonHandle.resolveHelpSources);

router.get('/noticeSummary', commonHandle.getNoticeSummary);

// router.post('/updateFolder', commonHandle.updateFolder);
// router.post('/deleteFolder', commonHandle.deleteFolder);
router.post('/getAgentLogs', commonHandle.getAgentLogs);
router.post('/getAgentLogChain', commonHandle.getAgentLogChain);
router.post('/getAgentLogsSummary', commonHandle.getAgentLogsSummary);
router.post('/getAiFeedback', commonHandle.getAiFeedback);
router.post('/updateAdminAiFeedbackTriage', updateAdminAiFeedbackTriage);
router.post('/getDeepSeekBalance', commonHandle.getDeepSeekBalance);
router.post('/getAdminOverview', commonHandle.getAdminOverview);
router.post('/getAdminOverviewTrend', commonHandle.getAdminOverviewTrend);
router.post('/getAdminOverviewRecent', commonHandle.getAdminOverviewRecent);
router.post('/getAdminActionCenter', getAdminActionCenter);
router.post('/getAdminFilePreviewDiagnostic', getAdminFilePreviewDiagnostic);
router.post('/getAdminTodoReminderDiagnostic', getAdminTodoReminderDiagnostic);
router.post('/retryAdminAsyncJob', retryAdminAsyncJob);
router.post('/dismissAdminAsyncJob', dismissAdminAsyncJob);
router.post('/getAdminOperationAudits', getAdminOperationAudits);
router.post('/getAdminProductInsights', getAdminProductInsights);
router.post('/getAdminGovernance', getAdminGovernance);

export default router;
