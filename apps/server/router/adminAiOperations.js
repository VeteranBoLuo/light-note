import express from 'express';
import {
  getAdminAiExecutionDetailHandle,
  getAdminAiOperationsOverviewHandle,
  queryAdminAiExecutionsHandle,
} from '../router_handle/adminAiOperationsHandle.js';

const router = express.Router();

router.post('/overview', getAdminAiOperationsOverviewHandle);
router.post('/executions/query', queryAdminAiExecutionsHandle);
router.post('/executions/detail', getAdminAiExecutionDetailHandle);

export default router;
