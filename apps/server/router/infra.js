import express from 'express';
import rateLimit from 'express-rate-limit';
import { executeInfraAction, getInfraDashboard, getInfraLogs } from '../router_handle/infraHandle.js';

const router = express.Router();
const actionLimiter = rateLimit({
  windowMs: 60_000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).send({
      data: { code: 'INFRA_ACTION_RATE_LIMITED', retryAfter: 60 },
      status: 429,
      msg: '服务器操作过于频繁，请稍后再试',
    }),
});

router.get('/dashboard', getInfraDashboard);
router.get('/logs/:serviceId', getInfraLogs);
router.post('/actions', actionLimiter, executeInfraAction);

export default router;
