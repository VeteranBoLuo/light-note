import express from 'express';
import rateLimit from 'express-rate-limit';
const router = express.Router();

import * as userHandle from '../router_handle/userHandle.js';

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 8,
  message: { data: null, status: 429, msg: '登录尝试过于频繁，请5分钟后再试' },
});

// 注册限流:注册本该很少见,按 IP 每小时最多 10 次,防脚本批量刷号(每次注册还写 seed 数据)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { data: null, status: 429, msg: '注册过于频繁，请稍后再试' },
});

router.post('/login', loginLimiter, userHandle.login);

router.get('/getUserInfo', userHandle.getUserInfo);

router.get('/me', userHandle.me);

router.post('/getUserList', userHandle.getUserList);

router.post('/registerUser', registerLimiter, userHandle.registerUser);

router.post('/saveUserInfo', userHandle.saveUserInfo);

router.get('/deleteUserById', userHandle.deleteUserById);

router.post('/github', userHandle.github);

router.post('/logout', userHandle.logout);

router.post('/configPassword', userHandle.configPassword);

router.post('/getMySessions', userHandle.getMySessions);

router.post('/revokeSession', userHandle.revokeSession);

router.post('/sendEmail', userHandle.sendEmail);

router.post('/verifyCode', userHandle.verifyCode);

router.post('/appeal', userHandle.submitAppeal);

router.post('/exportData', userHandle.exportData);
router.post('/importData', userHandle.importData);

export default router;
