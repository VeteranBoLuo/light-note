import express from 'express';
import { executeAiSkillRequest, getAiSkillsConfig } from '../router_handle/aiSkillHandle.js';

const router = express.Router();

router.get('/config', getAiSkillsConfig);
router.post('/execute', executeAiSkillRequest);

export default router;
