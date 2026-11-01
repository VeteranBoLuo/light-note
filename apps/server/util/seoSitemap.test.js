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
  it('帮助目录版本在可见内容相同时稳定，其他静态页继续保持原版本', async () => {
    const rows = [{ id: 'a', title: '快速上手', help_section: '', updated_at: null, created_at: null }];
    const db = { query: vi.fn(async () => [rows]) };
    const first = await loadSitemapEntries(db);
    rows[0] = { ...rows[0], help_section: ' 其他帮助 ', updated_at: 'invalid' };
    const second = await loadSitemapEntries(db);
    const index = (entries) => entries.find(({ loc }) => loc === 'https://boluo66.top/helpCenter');
    expect(index(first).version).toMatch(/^help-index:[a-f0-9]{64}$/);
    expect(index(second).version).toBe(index(first).version);
    expect(first.slice(0, 5).every(({ version }) => version === 'static')).toBe(true);
    expect(renderSitemapXml(first)).toContain('<loc>https://boluo66.top/helpCenter</loc>');
    expect(renderSitemapXml(first)).not.toContain('help-index:');
    expect(renderSitemapXml(first)).not.toContain('<lastmod>');
  });

  it.each(['新增', '标题', '栏目', '日期', '顺序', '撤回'])('帮助目录的%s变化产生新版本', async (change) => {
    const rows = [
      { id: 'a', title: '快速上手', help_section: '快速上手', updated_at: new Date(2026, 9, 1) },
      { id: 'b', title: '整理书签', help_section: '收集与整理', updated_at: new Date(2026, 9, 2) },
    ];
    const db = { query: vi.fn(async () => [rows]) };
    const previous = await loadSitemapEntries(db);
    if (change === '新增')
      rows.push({ id: 'c', title: '新指南', help_section: '快速上手', updated_at: new Date(2026, 9, 3) });
    if (change === '标题') rows[0].title = '三分钟入门';
    if (change === '栏目') rows[0].help_section = '账号与设置';
    if (change === '日期') rows[0].updated_at = new Date(2026, 9, 4);
    if (change === '顺序') rows.reverse();
    if (change === '撤回') rows.pop();
    const current = await loadSitemapEntries(db);
    const index = (entries) => entries.find(({ loc }) => loc === 'https://boluo66.top/helpCenter');
    expect(index(current).version).not.toBe(index(previous).version);
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(current.slice(0, 5)).toEqual(previous.slice(0, 5));
  });

  it('更新时间缺失或无效时回退创建时间，不把未知日期伪装为今天更新', async () => {
    const db = {
      query: vi.fn(async () => [
        [
          { id: 'created', updated_at: null, created_at: new Date(2026, 8, 1, 10, 0, 0) },
          { id: 'invalid', updated_at: 'invalid', created_at: new Date(2026, 8, 2, 10, 0, 0) },
          { id: 'unknown', updated_at: 'invalid', created_at: null },
        ],
      ]),
    };
    const entries = (await loadSitemapEntries(db)).slice(-3);
    expect(entries[0]).toMatchObject({ lastmod: '2026-09-01', version: '2026-09-01 10:00:00' });
    expect(entries[1]).toMatchObject({ lastmod: '2026-09-02', version: '2026-09-02 10:00:00' });
    expect(entries[2].version).toBe('undated');
    expect(entries[2]).not.toHaveProperty('lastmod');
    expect(renderSitemapXml([entries[2]])).not.toContain('<lastmod>');
  });

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
