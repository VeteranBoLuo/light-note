import express from 'express';
const router = express.Router();

import { helpIndexPage, helpArticlePage, sitemapXml } from '../router_handle/seoHandle.js';

// SEO 内容页：服务端直出真实 HTML，给不渲染 JS 的爬虫（百度等）读正文。
// nginx 侧将 /helpCenter、/helpCenter/*、/sitemap.xml 转发到后端（不带 /api 前缀）。
// 注意：路径故意不用 /help —— 那是项目里已有的 SPA 路由(AI 助手/帮助文档入口,
// router/modules/common.ts)，撞了会导致用户在 /help 硬刷新/直接打开时看到这里的页面。
router.get('/helpCenter', helpIndexPage);
router.get('/helpCenter/:id', helpArticlePage);
router.get('/sitemap.xml', sitemapXml);

export default router;
