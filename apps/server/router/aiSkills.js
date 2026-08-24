import express from 'express';
import {
  executeAiSkillRequest,
  executeAiSkillStreamRequest,
  getAiSkillsConfig,
} from '../router_handle/aiSkillHandle.js';

const router = express.Router();

router.get('/config', getAiSkillsConfig);
router.post('/execute', executeAiSkillRequest);
router.post('/stream', executeAiSkillStreamRequest);

export default router;
