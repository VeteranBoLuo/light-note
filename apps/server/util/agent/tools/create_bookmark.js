import pool from '../../../db/index.js';
import { insertData } from '../../../util/common.js';
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
  async execute(args, ctx) {
    let url = String(args.url || '').trim();
    if (!url) return { error: 'URL_REQUIRED', message: '网址不能为空' };
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    let name = String(args.name || '').trim();
    let description = String(args.description || '').trim();

    // 未给名称/描述时抓网页补全(fetchWebMeta 自带 SSRF 防护)
    if (!name || !description) {
      const meta = await fetchWebMeta(url);
      if (meta.ok) {
        if (!name) name = meta.title || '';
        if (!description) description = meta.description || '';
      }
    }
    if (!name) name = url; // 兜底

    const userId = ctx.userId;
    const [dup] = await pool.query('SELECT id FROM bookmark WHERE user_id = ? AND name = ? AND del_flag = 0', [userId, name]);
    if (dup.length) return { error: 'DUPLICATE', message: `已存在同名书签「${name}」` };

    const data = insertData({ name, url, description, userId });
    await pool.query('INSERT INTO bookmark SET ?', [data]);

    // 关联标签(自动建标签,最多 4 个,与手动新增一致)
    const tagNames = Array.isArray(args.tags)
      ? args.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 4)
      : [];
    const attached = [];
    for (const tagName of tagNames) {
      const tagId = await ensureTag(userId, tagName);
      if (!tagId) continue;
      await pool.query(
        `INSERT IGNORE INTO resource_tag_relations (tag_id, resource_type, resource_id, user_id, source) VALUES (?, 'bookmark', ?, ?, 'agent')`,
        [tagId, data.id, userId],
      );
      attached.push(tagName);
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
