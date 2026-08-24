import express from 'express';
import {
  executeAiSkillRequest,
  executeAiSkillStreamRequest,
  getAiSkillsConfig,
} from '../router_handle/aiSkillHandle.js';
import { aiActionRateLimiter } from '../util/requestRateLimit.js';

const router = express.Router();

router.get('/config', getAiSkillsConfig);
router.post('/execute', aiActionRateLimiter, executeAiSkillRequest);
router.post('/stream', aiActionRateLimiter, executeAiSkillStreamRequest);

export default router;
