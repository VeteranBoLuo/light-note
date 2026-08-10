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
    { loc: `${origin}/about.html`, priority: '0.7', changefreq: 'yearly' },
    { loc: `${origin}/updateLogs`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${origin}${helpPath}`, priority: '0.8', changefreq: 'weekly' },
  ];
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
