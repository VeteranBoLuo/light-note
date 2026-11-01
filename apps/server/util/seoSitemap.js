import { createHash } from 'node:crypto';
import { formatDateTime } from './dateTime.js';
import { normalizeKnowledgeHelpSection, PUBLIC_HELP_ARTICLE_CONDITION } from './helpKnowledge.js';

export const SEO_SITE_ORIGIN = 'https://boluo66.top';
export const HELP_CENTER_PATH = '/helpCenter'; // 单一来源，避免路径散落在各处手改漏改

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function getStaticSitemapUrls(site, helpPath) {
  const origin = String(site || '').replace(/\/$/, '');
  return [
    { loc: `${origin}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${origin}/browser-extension`, priority: '0.9', changefreq: 'monthly' },
    { loc: `${origin}/download/android`, priority: '0.9', changefreq: 'monthly' },
    { loc: `${origin}/about.html`, priority: '0.7', changefreq: 'yearly' },
    { loc: `${origin}/updateLogs`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${origin}${helpPath}`, priority: '0.8', changefreq: 'weekly' },
  ];
}

export function helpArticleUrl(id) {
  return `${SEO_SITE_ORIGIN}${HELP_CENTER_PATH}/${encodeURIComponent(id)}`;
}

/**
 * 站点地图与搜索引擎主动提交共用的地址清单：静态页在前，公开帮助文章按帮助中心维护顺序。
 * 文章版本精确到秒；帮助目录按有序条目的可见内容生成稳定版本，其余静态页只提交一次。
 */
export async function loadSitemapEntries(db) {
  const [rows] = await db.query(
    `SELECT id, title, help_section, updated_at, created_at FROM knowledge_base
      WHERE ${PUBLIC_HELP_ARTICLE_CONDITION}
      ORDER BY sort ASC, created_at ASC`,
  );
  const articleEntries = rows.map((row) => {
    const modified = [row.updated_at, row.created_at]
      .filter(Boolean)
      .map((value) => new Date(value))
      .find((value) => Number.isFinite(value.getTime()));
    // 缺少真实时间时不伪造“今天更新”，否则每次检查都会制造新版本并重复推送。
    const updatedAt = modified ? formatDateTime(modified) : null;
    return {
      loc: helpArticleUrl(row.id),
      priority: '0.6',
      changefreq: 'monthly',
      // 本地时区日期，避免凌晨用 UTC 把 lastmod 算成昨天。
      ...(updatedAt ? { lastmod: updatedAt.slice(0, 10) } : {}),
      version: updatedAt || 'undated',
    };
  });
  const helpIndexVersion = createHash('sha256')
    .update(
      JSON.stringify(
        rows.map((row, index) => [
          String(row.id ?? ''),
          String(row.title ?? ''),
          normalizeKnowledgeHelpSection(row.help_section),
          articleEntries[index].lastmod || null,
        ]),
      ),
    )
    .digest('hex');
  const staticEntries = getStaticSitemapUrls(SEO_SITE_ORIGIN, HELP_CENTER_PATH).map((entry) => ({
    ...entry,
    version: entry.loc === `${SEO_SITE_ORIGIN}${HELP_CENTER_PATH}` ? `help-index:${helpIndexVersion}` : 'static',
  }));
  return [...staticEntries, ...articleEntries];
}

export function renderSitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>${url.lastmod ? `\n    <lastmod>${escapeXml(url.lastmod)}</lastmod>` : ''}
    <changefreq>${escapeXml(url.changefreq)}</changefreq>
    <priority>${escapeXml(url.priority)}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;
}
