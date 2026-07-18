import { createTag } from '../../services/tagService.js';

export default {
  name: 'add_tag',
  description: '创建一个新标签。如果标签已存在则返回已有信息。只创建标签，不关联资源。',
  parameters: {
    type: 'object',
    properties: {
      tagName: { type: 'string', description: '标签名称' },
    },
    required: ['tagName'],
  },
  requireRoot: false,
  isWrite: true,
  riskLevel: 'low',
  confirmationPolicy: 'default',
  toSources(raw) {
    if (raw?.error || !raw?.id) return [];
    return [{ type: 'tag', id: raw.id, title: raw.tagName, target: 'tag-detail' }];
  },
  async execute(args, ctx) {
    const tagName = (args.tagName || args.tag || '').trim();
    if (!tagName) {
      return { error: 'TAG_REQUIRED', message: '标签名称不能为空' };
    }

    const result = await createTag({ userId: ctx.userId, name: tagName, existingIsSuccess: true });
    return { id: result.id, tagName: result.name, isNew: result.isNew };
  },
  transform(raw) {
    if (raw.error) return `操作失败：${raw.message}`;
    if (!raw.isNew) return `标签「${raw.tagName}」已存在`;
    return `✅ 已创建标签「${raw.tagName}」`;
  },
  summarize(raw) {
    if (raw.error) return `加标签失败：${raw.message}`;
    if (!raw.isNew) return `标签「${raw.tagName}」已存在`;
    return `已创建标签「${raw.tagName}」`;
  },
};
