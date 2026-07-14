import { createBookmark } from '../../services/bookmarkService.js';

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
    const url = String(args.url || '').trim();
    if (!url) return { error: 'URL_REQUIRED', message: '网址不能为空' };
    const tagNames = Array.isArray(args.tags) ? args.tags.map((t) => String(t).trim()).filter(Boolean) : [];
    return createBookmark({
      userId: ctx.userId,
      userRole: ctx.userRole,
      bookmark: {
        name: String(args.name || '').trim(),
        url,
        description: String(args.description || '').trim(),
      },
      tagNames,
      tagSource: 'agent',
      fillMetadata: true,
      saveSnapshot: true,
      signal: ctx.signal,
      request: ctx.request,
      suppressUserRewards: ctx.suppressUserRewards,
    });
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
