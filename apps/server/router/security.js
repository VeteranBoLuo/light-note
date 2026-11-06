import express from 'express';
import * as securityV2Handle from '../router_handle/securityV2Handle.js';

const router = express.Router();

router.post('/v2/overview', securityV2Handle.getSecurityOverviewV2);
router.post('/v2/review/clusters', securityV2Handle.getSecurityReviewClusters);
router.post('/v2/review/batch-disposition', securityV2Handle.batchSetSecurityReviewDisposition);
router.get('/v2/review/clusters/:eventId', securityV2Handle.getSecurityReviewClusterDetail);
router.post('/v2/events/:eventId/disposition', securityV2Handle.setSecurityEventDisposition);
router.post('/v2/clusters/:eventId/disposition', securityV2Handle.setSecurityClusterDisposition);
router.post('/v2/rules/quality', securityV2Handle.getSecurityRuleQuality);
router.post('/v2/rules/:ruleCode/override', securityV2Handle.saveSecurityRuleOverride);
router.post('/v2/rules/:ruleCode/replay', securityV2Handle.replaySecurityRule);
router.post('/v2/exceptions/list', securityV2Handle.listSecurityExceptions);
router.post('/v2/exceptions/save', securityV2Handle.saveSecurityException);
router.post('/v2/exceptions/disable', securityV2Handle.disableSecurityException);
router.post('/v2/ai-gifts/status', securityV2Handle.getAiGiftControls);
router.post('/v2/ai-gifts/control', securityV2Handle.setAiGiftControls);
router.post('/v2/restrictions/list', securityV2Handle.listSecurityRestrictions);
router.post('/v2/restrictions/apply', securityV2Handle.applySecurityRestriction);
router.post('/v2/restrictions/revoke', securityV2Handle.revokeSecurityRestriction);
router.post('/v2/source-denies/list', securityV2Handle.listSourceDenies);
router.post('/v2/source-denies/apply', securityV2Handle.applySourceDeny);
router.post('/v2/source-denies/revoke', securityV2Handle.revokeSourceDeny);

export default router;
