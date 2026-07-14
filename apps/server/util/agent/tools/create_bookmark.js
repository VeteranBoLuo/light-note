import pool from '../../../db/index.js';
import { insertData } from '../data.js';
import { fetchWebMeta } from '../../fetchWebMeta.js';
import { ensureTag } from '../tagUtil.js';

export default {
  name: 'create_bookmark',
  description:
    '收藏一个网址为书签。参数 url 必填;name/description 可选(不传则自动抓取网页标题与描述补全);tags 可选(标签名数组,自动创建并关联,最多 4 个)。用于"帮我收藏这个链接"等请求。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要收藏的网址,必填' },
      name: { type: 'string', description: '书签名称,可选;不传则用网页标题' },
      description: { type: 'string', description: '书签描述,可选;不传则用网页描述' },
      tags: { type: 'array', items: { type: 'string' }, description: '要关联的标签名数组,可选,最多 4 个' },
    },
    required: ['url'],
  },
  requireRoot: false,
  isWrite: true,
  riskLevel: 'low',
  confirmationPolicy: 'default',
  async execute(args, ctx) {
    let url = String(args.url || '').trim();
    if (!url) return { error: 'URL_REQUIRED', message: '网址不能为空' };
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    let name = String(args.name || '').trim();
    let description = String(args.description || '').trim();

    // 未给名称/描述时抓网页补全(fetchWebMeta 自带 SSRF 防护)
    if (!name || !description) {
      const meta = await fetchWebMeta(url, { signal: ctx.signal });
      if (meta.ok) {
        if (!name) name = meta.title || '';
        if (!description) description = meta.description || '';
      }
    }
    if (!name) name = url; // 兜底

    const tagNames = Array.isArray(args.tags)
      ? args.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 4)
      : [];
    const userId = ctx.userId;
    const data = insertData({ name, url, description, userId });
    const attached = [];
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [dup] = await connection.query(
        'SELECT id FROM bookmark WHERE user_id = ? AND name = ? AND del_flag = 0',
        [userId, name],
      );
      if (dup.length) {
        await connection.rollback();
        return { error: 'DUPLICATE', message: `已存在同名书签「${name}」` };
      }

      await connection.query('INSERT INTO bookmark SET ?', [data]);
      // 书签和标签关系作为一个原子操作提交，避免标签失败后残留半成功书签。
      for (const tagName of tagNames) {
        const tagId = await ensureTag(userId, tagName, connection);
        if (!tagId) continue;
        await connection.query(
          `INSERT IGNORE INTO resource_tag_relations (tag_id, resource_type, resource_id, user_id, source) VALUES (?, 'bookmark', ?, ?, 'agent')`,
          [tagId, data.id, userId],
        );
        attached.push(tagName);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return { id: data.id, name, url, tags: attached };
  },
  transform(raw) {
    if (raw.error) return `收藏失败:${raw.message}`;
    const tagPart = raw.tags?.length ? `,标签:${raw.tags.join('、')}` : '';
    return `✅ 已收藏书签「${raw.name}」${tagPart}(ID: ${raw.id})`;
  },
  summarize(raw) {
    if (raw.error) return `收藏书签失败:${raw.message}`;
    return `收藏书签「${raw.name}」成功`;
  },
};
