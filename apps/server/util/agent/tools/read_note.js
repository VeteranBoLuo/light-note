import { buildNoteAiPayload, findOwnedNoteForAi } from '../../noteAiService.js';
import { noteQuestionNeedsImageOcr } from '../../noteSemantic.js';

const VALID_FOCUS = new Set(['all', 'tasks', 'images']);
const VALID_TASK_STATUS = new Set(['all', 'pending', 'completed']);

function normalizeArgs(args = {}) {
  const focusValue = String(args.focus || args.mode || 'all').toLowerCase();
  const statusValue = String(args.taskStatus || args.status || 'all').toLowerCase();
  return {
    noteId: String(args.noteId || args.id || '').trim(),
    title: String(args.title || args.name || args.keyword || '').trim(),
    focus: VALID_FOCUS.has(focusValue) ? focusValue : 'all',
    taskStatus: VALID_TASK_STATUS.has(statusValue) ? statusValue : 'all',
  };
}

export default {
  name: 'read_note',
  description:
    '精确读取某一篇笔记的结构化正文，可识别富文本和 Markdown 的标题、段落、普通列表、复选任务、表格、引用、代码、链接和图片引用；' +
    '本工具不执行图片识别。返回中存在图片引用且问题需要读取图中文字时，再调用 analyze_resource_images。' +
    'query_notes 只用于列清单和数量，涉及单篇正文细节必须优先使用本工具。',
  parameters: {
    type: 'object',
    properties: {
      noteId: { type: 'string', description: '笔记 ID；显式资源上下文形如 [note:ID] 时优先传这个值' },
      title: { type: 'string', description: '笔记标题；没有笔记 ID 时使用，可部分匹配' },
      focus: {
        type: 'string',
        enum: ['all', 'tasks', 'images'],
        description: '读取重点：all 全部语义内容，tasks 任务清单，images 图片',
      },
      taskStatus: {
        type: 'string',
        enum: ['all', 'pending', 'completed'],
        description: '任务筛选：all 全部，pending 未完成，completed 已完成',
      },
    },
  },
  normalizeArgs,
  requireRoot: false,
  timeoutMs: 60_000,
  resultBudget: 12_000,
  async execute(input, ctx) {
    const args = normalizeArgs(input);
    const note = await findOwnedNoteForAi({ userId: ctx.userId, noteId: args.noteId, title: args.title });
    if (!note) return { total: 0, items: [] };
    const { document, content } = await buildNoteAiPayload({
      note,
      question: ctx.question || '',
      focus: args.focus,
      taskStatus: args.taskStatus,
    });
    const offersImageAnalysis =
      document.images.length > 0 &&
      (args.focus === 'images' || noteQuestionNeedsImageOcr(ctx.question || '', document));
    return {
      id: note.id,
      title: note.title || '无标题',
      type: note.type,
      content,
      checklist: document.checklist,
      imageCount: document.images.length,
      images: document.images.map(({ order, alt, title, url }) => ({ order, alt, title, url })),
      nextActions: offersImageAnalysis
        ? [{ tool: 'analyze_resource_images', resourceType: 'note', resourceId: String(note.id) }]
        : [],
      create_time: note.create_time,
      update_time: note.update_time,
    };
  },
  transform(raw) {
    if (!raw?.id) return '没有找到这篇笔记，可能标题不准确、笔记已删除或不属于当前账号。';
    const meta = [];
    if (raw.checklist?.total > 0) {
      meta.push(`任务 ${raw.checklist.total} 项（已完成 ${raw.checklist.completed}，未完成 ${raw.checklist.pending}）`);
    }
    if (raw.imageCount > 0) meta.push(`图片 ${raw.imageCount} 张（尚未读取图中文字）`);
    const imageRefs = (raw.images || [])
      .map((image) => `${image.order}. ${image.alt || image.title || '未命名图片'}：${image.url}`)
      .join('\n');
    return (
      `《${raw.title}》${meta.length ? `\n${meta.join('；')}` : ''}\n\n${raw.content || '(正文为空)'}` +
      (imageRefs
        ? `\n\n[图片引用]\n${imageRefs}\n仅当用户的问题需要读取图片内容时，再调用 analyze_resource_images。`
        : '')
    );
  },
  summarize(raw) {
    if (!raw?.id) return '读取笔记：无结果';
    return `读取笔记《${raw.title}》：任务 ${raw.checklist?.total || 0} 项，图片 ${raw.imageCount || 0} 张`;
  },
};
