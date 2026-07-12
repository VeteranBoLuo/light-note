import pool from '../../../db/index.js';

// 收藏洞察(只读):跨模块统计。回答"帮我分析下我的收藏"。
export default {
  name: 'get_insights',
  description: '对当前用户的收藏做数据洞察:各类内容总量、本月新增、高频标签 Top、未打标签的书签数。回答"帮我分析下我的收藏""我最常用的标签""我这个月存了多少""我的收藏概况"。',
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  async execute(args, ctx) {
    const uid = ctx.userId;
    if (!uid || ctx.userRole === 'visitor') return null;
    const d = new Date();
    const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;
    const [[tot]] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM bookmark WHERE user_id=? AND del_flag=0) AS bm,
        (SELECT COUNT(*) FROM note WHERE create_by=? AND del_flag=0) AS nt,
        (SELECT COUNT(*) FROM files WHERE create_by=? AND del_flag=0) AS fl,
        (SELECT COUNT(*) FROM tag WHERE user_id=? AND del_flag=0) AS tg`,
      [uid, uid, uid, uid],
    );
    const [[mon]] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM bookmark WHERE user_id=? AND del_flag=0 AND create_time>=?) AS bm,
        (SELECT COUNT(*) FROM note WHERE create_by=? AND del_flag=0 AND create_time>=?) AS nt,
        (SELECT COUNT(*) FROM files WHERE create_by=? AND del_flag=0 AND create_time>=?) AS fl`,
      [uid, monthStart, uid, monthStart, uid, monthStart],
    );
    const [tags] = await pool.query(
      `SELECT t.name, COUNT(*) c FROM resource_tag_relations r JOIN tag t ON t.id=r.tag_id AND t.del_flag=0
       WHERE r.user_id=? GROUP BY t.id ORDER BY c DESC LIMIT 5`,
      [uid],
    );
    const [[untag]] = await pool.query(
      `SELECT COUNT(*) c FROM bookmark b LEFT JOIN resource_tag_relations r ON r.resource_id=b.id AND r.resource_type='bookmark'
       WHERE b.user_id=? AND b.del_flag=0 AND r.tag_id IS NULL`,
      [uid],
    );
    return {
      total: tot,
      month: mon,
      topTags: tags.map((t) => ({ name: t.name, count: Number(t.c) })),
      untaggedBookmarks: Number(untag.c),
    };
  },
  transform(raw) {
    if (!raw) return '暂无数据。';
    const t = raw.total;
    const m = raw.month;
    const tags = raw.topTags.length ? raw.topTags.map((x) => `${x.name}(${x.count})`).join('、') : '暂无标签';
    return [
      '📊 你的收藏概况',
      `总量:书签 ${t.bm} · 笔记 ${t.nt} · 文件 ${t.fl} · 标签 ${t.tg}`,
      `本月新增:书签 ${m.bm} · 笔记 ${m.nt} · 文件 ${m.fl}`,
      `高频标签 Top:${tags}`,
      `未打标签的书签:${raw.untaggedBookmarks} 个${raw.untaggedBookmarks > 0 ? '(可用「AI 智能整理」一键打标签)' : ''}`,
    ].join('\n');
  },
  summarize(raw) {
    return raw ? `洞察:书签 ${raw.total.bm} · 笔记 ${raw.total.nt} · 文件 ${raw.total.fl}` : '洞察:无数据';
  },
};
