import express from 'express';
import {
  getAdminAiExecutionDetailHandle,
  getAdminAiOperationsOverviewHandle,
  queryAdminAiExecutionsHandle,
} from '../router_handle/adminAiOperationsHandle.js';
import { aiUsageReadRateLimiter } from '../util/requestRateLimit.js';

const router = express.Router();

router.post('/overview', aiUsageReadRateLimiter, getAdminAiOperationsOverviewHandle);
router.post('/executions/query', aiUsageReadRateLimiter, queryAdminAiExecutionsHandle);
router.post('/executions/detail', aiUsageReadRateLimiter, getAdminAiExecutionDetailHandle);

export default router;
