import express from 'express';
import * as appHandle from '../router_handle/appHandle.js';

const router = express.Router();

/*
 * 公开路由：这个地址要发到群里、文档和二维码上，未登录也必须能下载，所以不加游客拦截。
 * 它只做一次 302 到 public 下的安装包，不读库、不碰用户数据。
 */
router.get('/android/latest.apk', appHandle.redirectAndroidLatestApk);

export default router;
