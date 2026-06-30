import express from 'express';
import * as securityHandle from '../router_handle/securityHandle.js';

const router = express.Router();

router.post('/overview', securityHandle.getSecurityOverview);
router.post('/events', securityHandle.getSecurityEvents);
router.post('/events/batchHandle', securityHandle.batchHandleSecurityEvents);
router.get('/events/:eventId', securityHandle.getSecurityEventDetail);
router.post('/events/:eventId/handle', securityHandle.handleSecurityEvent);
router.post('/ipReputation', securityHandle.getIpReputationList);
router.post('/ipAccounts', securityHandle.getIpAccounts);
router.post('/ipBan', securityHandle.banIp);
router.post('/ipUnban', securityHandle.unbanIp);
router.post('/accountBans', securityHandle.getAccountBanList);
router.post('/accountReputation', securityHandle.getAccountReputationList);
router.post('/accountBan', securityHandle.banAccount);
router.post('/accountUnban', securityHandle.unbanAccount);
router.post('/rules', securityHandle.getSecurityRules);
router.post('/whitelist', securityHandle.getSecurityWhitelist);
router.post('/whitelist/save', securityHandle.saveSecurityWhitelist);
router.post('/whitelist/remove', securityHandle.removeSecurityWhitelist);

export default router;
