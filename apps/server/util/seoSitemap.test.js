import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_HELP_ARTICLE_CONDITION } from './helpKnowledge.js';
import { getStaticSitemapUrls, loadSitemapEntries, renderSitemapXml } from './seoSitemap.js';

describe('SEO sitemap', () => {
  it('以根域名作为唯一官网地址，不再提交旧 /landing', () => {
    const xml = renderSitemapXml(getStaticSitemapUrls('https://boluo66.top', '/helpCenter'));

    expect(xml).toContain('<loc>https://boluo66.top/</loc>');
    expect(xml).toContain('<loc>https://boluo66.top/browser-extension</loc>');
    expect(xml).toContain('<loc>https://boluo66.top/download/android</loc>');
    expect(xml).toContain('<loc>https://boluo66.top/about.html</loc>');
    expect(xml).toContain('<loc>https://boluo66.top/updateLogs</loc>');
    expect(xml).toContain('<loc>https://boluo66.top/helpCenter</loc>');
    expect(xml).not.toContain('https://boluo66.top/landing');
    expect(xml).not.toContain('https://boluo66.top/admin');
  });

  it('转义动态 URL 字段', () => {
    const xml = renderSitemapXml([
      {
        loc: 'https://boluo66.top/helpCenter/a&b',
        lastmod: '2026-07-29',
        changefreq: 'monthly',
        priority: '0.6',
      },
    ]);

    expect(xml).toContain('a&amp;b');
    expect(xml).toContain('<lastmod>2026-07-29</lastmod>');
  });
});

describe('站点地图条目', () => {
  it('只收录公开帮助文章，静态页在前，文章按维护顺序并带秒级版本', async () => {
    const db = {
      query: vi.fn(async () => [[{ id: 'a b', updated_at: new Date(2026, 9, 30, 0, 30, 5) }]]),
    };
    const entries = await loadSitemapEntries(db);

    expect(db.query.mock.calls[0][0]).toContain(PUBLIC_HELP_ARTICLE_CONDITION);
    expect(db.query.mock.calls[0][0]).toContain('ORDER BY sort ASC, created_at ASC');
    expect(entries[0]).toMatchObject({ loc: 'https://boluo66.top/', version: 'static' });
    expect(entries.at(-1)).toEqual({
      loc: 'https://boluo66.top/helpCenter/a%20b',
      priority: '0.6',
      changefreq: 'monthly',
      lastmod: '2026-10-30',
      version: '2026-10-30 00:30:05',
    });
  });
});
