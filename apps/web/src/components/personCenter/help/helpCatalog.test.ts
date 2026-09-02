import { describe, expect, it } from 'vitest';
import { groupHelpArticles, normalizeHelpSection, type HelpArticle } from './helpCatalog';

const article = (id: string, helpSection?: string | null): HelpArticle => ({
  id,
  title: `文章 ${id}`,
  content: '',
  helpSection,
});

describe('帮助中心栏目数据源', () => {
  it('按服务端 helpSection 分组，并保持文章首次出现的栏目顺序', () => {
    expect(
      groupHelpArticles([article('1', '笔记与编辑'), article('2', '云空间'), article('3', '笔记与编辑')], '其他帮助'),
    ).toEqual([
      { id: '笔记与编辑', name: '笔记与编辑', items: [article('1', '笔记与编辑'), article('3', '笔记与编辑')] },
      { id: '云空间', name: '云空间', items: [article('2', '云空间')] },
    ]);
  });

  it('新增栏目随文章出现、最后一篇删除后自然消失', () => {
    const before = groupHelpArticles([article('1', '笔记与编辑')], '其他帮助');
    const afterAdd = groupHelpArticles([...before[0].items, article('2', '新栏目')], '其他帮助');
    const afterDelete = groupHelpArticles(
      afterAdd.flatMap((group) => group.items).filter((item) => item.id !== '2'),
      '其他帮助',
    );

    expect(afterAdd.map((group) => group.name)).toEqual(['笔记与编辑', '新栏目']);
    expect(afterDelete.map((group) => group.name)).toEqual(['笔记与编辑']);
  });

  it('兼容迁移前或未填写栏目的文章，并规范首尾与连续空白', () => {
    expect(normalizeHelpSection('  AI   与权益  ', '其他帮助')).toBe('AI 与权益');
    expect(groupHelpArticles([article('1'), article('2', '   ')], '其他帮助')[0]).toEqual({
      id: '其他帮助',
      name: '其他帮助',
      items: [article('1'), article('2', '   ')],
    });
  });
});
