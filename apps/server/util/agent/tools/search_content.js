import pool from '../../../db/index.js';
import { parseNoteContent, renderNoteForAi } from '../../noteSemantic.js';

// 「问我的知识库」检索工具:在用户已收藏/记录的【内容正文】里找相关片段,交给模型据此作答并标注来源。
// 覆盖 query_bookmarks 读不到的部分——书签的网页正文存档(bookmark_snapshot.content)、AI 摘要、描述;笔记正文同样纳入。
// v1 用关键词全文匹配(LIKE)+ 命中处摘录,个人规模足够;不返回整篇(按 ±radius 截取,控 token)。

function excerpt(text, kw, radius = 300) {
  const s = String(text || '');
  if (!s) return '';
  const i = s.toLowerCase().indexOf(String(kw).toLowerCase());
  if (i < 0) return s.slice(0, radius * 2) + (s.length > radius * 2 ? '…' : ''); // 命中在别的字段(如标题/描述)时,取正文开头
  const start = Math.max(0, i - radius);
  const end = Math.min(s.length, i + String(kw).length + radius);
  return (start > 0 ? '…' : '') + s.slice(start, end) + (end < s.length ? '…' : '');
}

export default {
  name: 'search_content',
  description:
    '在用户"已收藏/记录的内容正文"里检索并回答问题:书签的网页正文存档、AI 摘要、描述,以及笔记正文。' +
    '当用户问"我收藏/存过的关于 X 的资料/文章里怎么说""我之前记的关于 X 的内容"等涉及【自己收藏内容的具体信息】时,用这个工具,' +
    '并在回答里用"来源N《标题》"标注出处。它与 query_bookmarks/query_notes 的区别:那两个用于"列清单/数数量",本工具用于"读正文回答问题"。',
  parameters: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: '要检索的关键词或主题,从用户问题里提炼,尽量用具体名词(如"Express""报销流程""番茄钟")',
      },
      limit: { type: 'integer', description: '返回条数,默认 6,最大 12' },
    },
    required: ['keyword'],
  },
  requireRoot: false,
  async execute(args, ctx) {
    const kw = String(args.keyword || '').trim();
    if (!kw) return { keyword: '', hits: [] };
    const take = Math.min(Math.max(args.limit || 6, 1), 12);
    const like = `%${kw}%`;

    const [bm] = await pool.query(
      `SELECT b.id, b.name, b.url, b.description, s.summary, s.content
         FROM bookmark b
         LEFT JOIN bookmark_snapshot s ON s.bookmark_id = b.id
        WHERE b.user_id = ? AND b.del_flag = 0
          AND (b.name LIKE ? OR b.description LIKE ? OR s.summary LIKE ? OR s.content LIKE ?)
        ORDER BY (s.content IS NOT NULL) DESC, b.create_time DESC
        LIMIT ?`,
      [ctx.userId, like, like, like, like, take],
    );
    const [nt] = await pool.query(
      `SELECT id, title, content, type FROM note
        WHERE create_by = ? AND del_flag = 0 AND (title LIKE ? OR content LIKE ?)
        ORDER BY create_time DESC LIMIT ?`,
      [ctx.userId, like, like, take],
    );

    const hits = [];
    for (const b of bm) {
      const body = b.content || b.summary || b.description || '';
      hits.push({
        type: 'bookmark',
        id: b.id,
        title: b.name || '无标题',
        url: b.url || '',
        summary: b.summary || '',
        excerpt: excerpt(body, kw),
      });
    }
    for (const n of nt) {
      const document = parseNoteContent({ content: n.content, type: n.type });
      const plain = renderNoteForAi(document, { maxChars: 12_000 });
      hits.push({ type: 'note', id: n.id, title: n.title || '无标题', excerpt: excerpt(plain, kw) });
    }
    return { keyword: kw, hits: hits.slice(0, take) };
  },
  transform(raw) {
    const hits = raw?.hits || [];
    if (!hits.length) return `没有在你收藏/记录的内容里找到与"${raw?.keyword || ''}"相关的资料。`;
    const lines = hits.map((h, i) => {
      const tag = h.type === 'bookmark' ? '书签' : '笔记';
      const src = h.type === 'bookmark' && h.url ? ` — ${h.url}` : '';
      const sum = h.summary ? `\n   摘要:${h.summary}` : '';
      return `[来源${i + 1}·${tag}]《${h.title}》${src}${sum}\n   正文摘录:${h.excerpt || '(无正文)'}`;
    });
    return `已在你的收藏/笔记里找到 ${hits.length} 条相关资料,请据此作答并用"来源N"标注出处:\n\n${lines.join('\n\n')}`;
  },
  summarize(raw) {
    return `内容检索:命中 ${raw?.hits?.length || 0} 条`;
  },
};
