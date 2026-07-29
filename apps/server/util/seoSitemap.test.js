import { describe, expect, it } from 'vitest';
import { getStaticSitemapUrls, renderSitemapXml } from './seoSitemap.js';

describe('SEO sitemap', () => {
  it('以根域名作为唯一官网地址，不再提交旧 /landing', () => {
    const xml = renderSitemapXml(getStaticSitemapUrls('https://boluo66.top', '/helpCenter'));

    expect(xml).toContain('<loc>https://boluo66.top/</loc>');
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
