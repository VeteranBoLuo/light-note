import express from 'express';
const router = express.Router();

import { helpIndexPage, helpArticlePage, sitemapXml } from '../router_handle/seoHandle.js';

// SEO 内容页：服务端直出真实 HTML，给不渲染 JS 的爬虫（百度等）读正文。
// nginx 侧将 /help、/help/*、/sitemap.xml 转发到后端（不带 /api 前缀）。
router.get('/help', helpIndexPage);
router.get('/help/:id', helpArticlePage);
router.get('/sitemap.xml', sitemapXml);

export default router;
