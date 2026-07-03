/**
 * SEO 内容页（服务端直出真实 HTML）
 *
 * 背景：整站是 SPA，百度等不渲染 JS 的爬虫读不到正文。knowledge_base 表里
 * status='public' 的帮助文章是现成的内容库，这里用模板字符串直出完整 HTML：
 *   GET /help          帮助中心索引页（按分类列出全部公开文章，爬虫的发现入口）
 *   GET /help/:id      文章详情页（title/description/canonical/JSON-LD/正文）
 *   GET /sitemap.xml   动态 sitemap（首页/landing/help + 全部公开文章，lastmod 取 updated_at）
 *
 * nginx 侧配套（部署时改）：
 *   location = /sitemap.xml  → proxy_pass http://127.0.0.1:9001/sitemap.xml
 *   location = /help 与 ^~ /help/ → proxy_pass http://127.0.0.1:9001
 *
 * 安全：文章 content 是 root 在知识库管理后台写的富文本（可信），直出；
 * title/category/description 等短字段一律 escapeHtml；:id 走参数化查询。
 */

import pool from '../db/index.js';
import { marked } from 'marked';

const SITE = 'https://boluo66.top';
const BRAND = '轻笺';

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeXml = escapeHtml;

/** 提取纯文本（生成 meta description 用） */
const toPlainText = (html, limit = 150) =>
  String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);

const formatDate = (d) => {
  const t = d ? new Date(d) : new Date();
  return isNaN(t.getTime()) ? new Date().toISOString().slice(0, 10) : t.toISOString().slice(0, 10);
};

/** 公共页面骨架：极简内联样式，兼容移动端，不依赖前端资源 */
const pageShell = ({ title, description, canonical, jsonLd, body }) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${canonical}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${canonical}" />
<meta property="og:site_name" content="${BRAND}" />
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
<style>
  :root{color-scheme:light}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:#1f2329;background:#fff;line-height:1.75}
  .wrap{max-width:820px;margin:0 auto;padding:24px 20px 64px}
  header.site{padding:14px 0;border-bottom:1px solid #eef0f2;margin-bottom:28px;display:flex;align-items:center;justify-content:space-between}
  header.site a{color:#1f2329;text-decoration:none;font-weight:700;font-size:18px}
  header.site nav a{font-weight:400;font-size:14px;color:#615ced;margin-left:16px}
  h1{font-size:26px;line-height:1.35;margin:0 0 8px}
  .meta{color:#8a919f;font-size:13px;margin-bottom:24px}
  .content img{max-width:100%;height:auto}
  .content pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow-x:auto}
  .content table{border-collapse:collapse;max-width:100%;display:block;overflow-x:auto}
  .content td,.content th{border:1px solid #e5e7eb;padding:6px 10px}
  .content a{color:#615ced}
  .cat{margin:32px 0 12px;font-size:15px;font-weight:700;color:#1f2329;border-left:3px solid #615ced;padding-left:10px}
  ul.art{list-style:none;padding:0;margin:0}
  ul.art li{padding:9px 0;border-bottom:1px dashed #eef0f2}
  ul.art a{color:#1f2329;text-decoration:none}
  ul.art a:hover{color:#615ced}
  ul.art .t{color:#b4bac4;font-size:12px;margin-left:10px}
  footer.site{margin-top:48px;padding-top:16px;border-top:1px solid #eef0f2;font-size:13px;color:#8a919f}
  footer.site a{color:#615ced;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
<header class="site">
  <a href="/landing">${BRAND}</a>
  <nav><a href="/help">帮助中心</a><a href="/landing">产品介绍</a></nav>
</header>
${body}
<footer class="site">${BRAND} —— 轻量级知识管理工具：书签 · 笔记 · 云空间 · <a href="/landing">了解更多</a></footer>
</div>
</body>
</html>`;

/** GET /help —— 帮助中心索引页 */
export const helpIndexPage = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, category, updated_at FROM knowledge_base
       WHERE status = 'public' ORDER BY category, sort, updated_at DESC`,
    );

    // 按分类分组
    const groups = new Map();
    for (const r of rows) {
      const cat = r.category || '其他';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(r);
    }

    const body = `
<h1>${BRAND}帮助中心</h1>
<p class="meta">共 ${rows.length} 篇使用指南与常见问题，覆盖书签管理、云笔记、云空间与标签体系。</p>
${[...groups.entries()]
  .map(
    ([cat, arts]) => `<div class="cat">${escapeHtml(cat)}</div>
<ul class="art">
${arts
  .map(
    (a) =>
      `<li><a href="/help/${encodeURIComponent(a.id)}">${escapeHtml(a.title)}</a><span class="t">${formatDate(a.updated_at)}</span></li>`,
  )
  .join('\n')}
</ul>`,
  )
  .join('\n')}`;

    res
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=600')
      .send(
        pageShell({
          title: `帮助中心 - ${BRAND}`,
          description: `${BRAND}帮助中心：${rows.length} 篇使用指南与常见问题，覆盖书签管理、云笔记、云空间、标签分类与数据同步。`,
          canonical: `${SITE}/help`,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: `${BRAND}帮助中心`,
            url: `${SITE}/help`,
            isPartOf: { '@type': 'WebSite', name: BRAND, url: SITE },
          },
          body,
        }),
      );
  } catch (e) {
    console.error('帮助中心索引页渲染失败:', e.message);
    res.status(500).set('Content-Type', 'text/html; charset=utf-8').send('<h1>服务暂时不可用</h1>');
  }
};

/** GET /help/:id —— 文章详情页 */
export const helpArticlePage = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, title, content, category, type, created_at, updated_at
       FROM knowledge_base WHERE id = ? AND status = 'public' LIMIT 1`,
      [id],
    );
    const art = rows[0];
    if (!art) {
      return res
        .status(404)
        .set('Content-Type', 'text/html; charset=utf-8')
        .send(
          pageShell({
            title: `文章不存在 - ${BRAND}帮助中心`,
            description: '该帮助文章不存在或未公开。',
            canonical: `${SITE}/help`,
            jsonLd: null,
            body: `<h1>文章不存在</h1><p>该文章不存在或未公开，<a href="/help">返回帮助中心</a>。</p>`,
          }),
        );
    }

    const contentHtml = art.type === 'markdown' ? marked.parse(String(art.content || '')) : String(art.content || '');
    const description = toPlainText(contentHtml, 150) || `${BRAND}帮助中心文章：${art.title}`;
    const canonical = `${SITE}/help/${encodeURIComponent(art.id)}`;

    const body = `
<article>
<h1>${escapeHtml(art.title)}</h1>
<p class="meta">${escapeHtml(art.category || '帮助中心')} · 更新于 ${formatDate(art.updated_at)}</p>
<div class="content">
${contentHtml}
</div>
</article>
<p style="margin-top:32px"><a href="/help" style="color:#615ced;text-decoration:none">← 返回帮助中心</a></p>`;

    res
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=600')
      .send(
        pageShell({
          title: `${art.title} - ${BRAND}帮助中心`,
          description,
          canonical,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: art.title,
            description,
            datePublished: formatDate(art.created_at),
            dateModified: formatDate(art.updated_at),
            author: { '@type': 'Organization', name: BRAND },
            publisher: { '@type': 'Organization', name: BRAND },
            mainEntityOfPage: canonical,
          },
          body,
        }),
      );
  } catch (e) {
    console.error('帮助文章页渲染失败:', e.message);
    res.status(500).set('Content-Type', 'text/html; charset=utf-8').send('<h1>服务暂时不可用</h1>');
  }
};

/** GET /sitemap.xml —— 动态 sitemap（静态页 + 全部公开文章） */
export const sitemapXml = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, updated_at FROM knowledge_base WHERE status = 'public' ORDER BY updated_at DESC`,
    );
    const staticUrls = [
      { loc: `${SITE}/`, priority: '1.0', changefreq: 'weekly' },
      { loc: `${SITE}/landing`, priority: '0.9', changefreq: 'weekly' },
      { loc: `${SITE}/help`, priority: '0.8', changefreq: 'weekly' },
    ];
    const articleUrls = rows.map((r) => ({
      loc: `${SITE}/help/${encodeURIComponent(r.id)}`,
      priority: '0.6',
      changefreq: 'monthly',
      lastmod: formatDate(r.updated_at),
    }));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...articleUrls]
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(xml);
  } catch (e) {
    console.error('sitemap 生成失败:', e.message);
    res.status(500).set('Content-Type', 'text/plain').send('sitemap generation failed');
  }
};
