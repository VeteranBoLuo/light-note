import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_HELP_ARTICLE_CONDITION } from '../util/helpKnowledge.js';

const query = vi.fn();
vi.mock('../db/index.js', () => ({ default: { query } }));

const { groupHelpArticlesBySection, helpArticlePage, helpIndexPage, stripLeadingTitleHeading } = await import(
  './seoHandle.js'
);

function response() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.set = (name, value) => {
    res.headers[name] = value;
    return res;
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.send = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

beforeEach(() => query.mockReset());

describe('公开帮助页', () => {
  it('索引页与站内帮助同一公开范围，栏目按文章维护顺序出现', async () => {
    query.mockResolvedValueOnce([
      [
        { id: 'a', title: '快速上手', help_section: '快速上手', updated_at: new Date(2026, 9, 1) },
        { id: 'b', title: '笔记入门', help_section: '笔记与编辑', updated_at: new Date(2026, 9, 2) },
        { id: 'c', title: '没有栏目', help_section: '', updated_at: new Date(2026, 9, 3) },
        { id: 'd', title: '第一步', help_section: '快速上手', updated_at: new Date(2026, 9, 4) },
      ],
    ]);
    const res = response();
    await helpIndexPage({}, res);

    expect(query.mock.calls[0][0]).toContain(PUBLIC_HELP_ARTICLE_CONDITION);
    const sections = [...res.body.matchAll(/<div class="cat">([^<]+)<\/div>/g)].map((m) => m[1]);
    expect(sections).toEqual(['快速上手', '笔记与编辑', '其他帮助']);
    expect(res.body).toContain('共 4 篇');
  });

  it('非公开帮助文章返回 404', async () => {
    query.mockResolvedValueOnce([[]]);
    const res = response();
    await helpArticlePage({ params: { id: 'faq-1' } }, res);

    expect(query.mock.calls[0][0]).toContain(PUBLIC_HELP_ARTICLE_CONDITION);
    expect(query.mock.calls[0][1]).toEqual(['faq-1']);
    expect(res.statusCode).toBe(404);
  });

  it('正文开头与标题重复的小标题不再出现，描述从正文说起', async () => {
    query.mockResolvedValueOnce([
      [
        {
          id: 'x',
          title: '快捷搜索直达功能：导入、导出在哪里',
          content: '# 快捷搜索直达功能\n\n找不到某个功能时，直接搜索它的名字。',
          help_section: '快速上手',
          type: 'markdown',
          created_at: new Date(2026, 9, 1),
          updated_at: new Date(2026, 9, 2),
        },
      ],
    ]);
    const res = response();
    await helpArticlePage({ params: { id: 'x' } }, res);

    expect(res.body.match(/<h1\b/g)).toHaveLength(1);
    expect(res.body).toContain('<meta name="description" content="找不到某个功能时，直接搜索它的名字。" />');
    expect(res.body).toContain('<p class="meta">快速上手 · 更新于 2026-10-02</p>');
    expect(res.body).toContain('<link rel="canonical" href="https://boluo66.top/helpCenter/x" />');
  });
});

describe('辅助函数', () => {
  it('只去掉被标题包含的开头小标题', () => {
    expect(stripLeadingTitleHeading('<h2>新建笔记</h2><p>正文</p>', '笔记怎么新建')).toBe('<h2>新建笔记</h2><p>正文</p>');
    expect(stripLeadingTitleHeading('\n<h1 id="t">回收站</h1><p>正文</p>', '回收站')).toBe('<p>正文</p>');
    expect(stripLeadingTitleHeading('<p>没有标题</p>', '回收站')).toBe('<p>没有标题</p>');
  });

  it('空栏目归入其他帮助', () => {
    expect(groupHelpArticlesBySection([{ help_section: null }]).map(([section]) => section)).toEqual(['其他帮助']);
  });
});
