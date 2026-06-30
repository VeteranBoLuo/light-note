import express from 'express';
import rateLimit from 'express-rate-limit';
const router = express.Router();

import * as userHandle from '../router_handle/userHandle.js';

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 8,
  message: { data: null, status: 429, msg: '登录尝试过于频繁，请5分钟后再试' },
});

router.post('/login', loginLimiter, userHandle.login);

router.get('/getUserInfo', userHandle.getUserInfo);

router.get('/me', userHandle.me);

router.post('/getUserList', userHandle.getUserList);

router.post('/registerUser', userHandle.registerUser);

router.post('/saveUserInfo', userHandle.saveUserInfo);

router.get('/deleteUserById', userHandle.deleteUserById);

router.post('/github', userHandle.github);

router.post('/logout', userHandle.logout);

router.post('/configPassword', userHandle.configPassword);

router.post('/sendEmail', userHandle.sendEmail);

router.post('/verifyCode', userHandle.verifyCode);

export default router;
