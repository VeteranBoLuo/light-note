import { previewTrashRestore, restoreTrashResources } from '../../services/trashService.js';

export default {
  name: 'restore_trash',
  description:
    '从回收站恢复已删除的内容。支持按 id 恢复单个、按 type 恢复某类内容、按 timeRange 恢复某时间段删除的内容；至少应提供一个筛选条件以避免误恢复。',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', description: '资源类型：bookmark(书签)、note(笔记)、file(文件)，不填则查全部' },
      id: { type: 'string', description: '要恢复的资源 ID，指定后只恢复这一个' },
      timeRange: { type: 'string', description: '时间范围，恢复该时间段内删除的内容，如"今天"、"昨天"' },
    },
  },
  requireRoot: false,
  isWrite: true,
  riskLevel: 'medium',
  confirmationPolicy: 'always',
  async preview(args, ctx) {
    const { items, total } = await previewTrashRestore({ userId: ctx.userId, filters: args });
    return {
      title: '恢复回收站内容',
      target: items.map((item) => `${item.type} ${item.count} 项`).join('、'),
      impact: `预计恢复 ${total} 项内容`,
      items,
    };
  },
  async execute(args, ctx) {
    return restoreTrashResources({ userId: ctx.userId, filters: args });
  },
  transform(raw) {
    if (!raw?.length) return '没有找到可恢复的内容，或已恢复过了。';
    const parts = raw.map((r) => `【${r.type}】${r.count} 项`);
    return `✅ 已恢复 ${parts.join('、')}`;
  },
  summarize(raw) {
    if (!raw?.length) return '恢复：无操作';
    const total = raw.reduce((s, r) => s + r.count, 0);
    return `恢复回收站：共 ${total} 项`;
  },
};
