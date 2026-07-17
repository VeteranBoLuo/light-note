import pool from '../../../db/index.js';
import { findOwnedNoteForAi, recognizeOwnedNoteImages } from '../../noteAiService.js';
import { parseNoteContent } from '../../noteSemantic.js';

const VALID_RESOURCE_TYPES = new Set(['note', 'document']);

function normalizeArgs(args = {}) {
  const resourceType = String(args.resourceType || args.type || 'note').toLowerCase();
  const rawNumbers = Array.isArray(args.imageNumbers) ? args.imageNumbers : [];
  return {
    resourceType: VALID_RESOURCE_TYPES.has(resourceType) ? resourceType : 'note',
    resourceId: String(args.resourceId || args.noteId || args.documentId || args.id || '').trim(),
    imageNumbers: [...new Set(rawNumbers.map(Number).filter((value) => Number.isInteger(value) && value > 0))].slice(
      0,
      3,
    ),
  };
}

async function analyzeNote(args, ctx) {
  const note = await findOwnedNoteForAi({ userId: ctx.userId, noteId: args.resourceId });
  if (!note) return null;
  const document = parseNoteContent({ content: note.content, type: note.type });
  const results = await recognizeOwnedNoteImages({
    note,
    document,
    signal: ctx.signal,
    limit: 3,
    imageNumbers: args.imageNumbers,
  });
  return {
    resourceType: 'note',
    resourceId: String(note.id),
    title: note.title || '无标题',
    totalImages: document.images.length,
    results,
  };
}

async function analyzeDocument(args, ctx) {
  const [sources] = await pool.query(
    `SELECT id, file_name, file_type, status
       FROM ai_document_sources WHERE id = ? AND user_id = ? LIMIT 1`,
    [args.resourceId, ctx.userId],
  );
  const source = sources[0];
  if (!source) return null;
  if (source.status !== 'ready') {
    return { error: 'ATTACHMENT_NOT_READY', message: '文件仍在解析中，请稍后再试。' };
  }
  if (
    !String(source.file_type || '')
      .toLowerCase()
      .startsWith('image/')
  ) {
    return { error: 'INVALID_TYPE', message: '该资源不是图片文件，请使用文件正文解析结果。' };
  }
  const [chunks] = await pool.query(
    `SELECT chunk_index, content, locator_value
       FROM ai_document_chunks WHERE source_id = ? ORDER BY chunk_index ASC LIMIT 8`,
    [source.id],
  );
  return {
    resourceType: 'document',
    resourceId: String(source.id),
    title: source.file_name || '未命名图片',
    totalImages: 1,
    results: chunks.length
      ? [
          {
            order: 1,
            status: 'success',
            content: chunks
              .map((chunk) => chunk.content)
              .join('\n\n')
              .slice(0, 12_000),
          },
        ]
      : [{ order: 1, status: 'failed', content: '', errorCode: 'ATTACHMENT_EMPTY' }],
  };
}

export default {
  name: 'analyze_resource_images',
  description:
    '按需读取资源里的图片文字。必须先有明确资源 ID；笔记使用 read_note 返回的 note ID，已上传或云空间图片使用 document ID。' +
    '只在用户询问图片、截图、图表，或正文信息不足且图片可能包含答案时调用。每轮最多分析 3 张，普通文字问题不要调用。',
  parameters: {
    type: 'object',
    properties: {
      resourceType: {
        type: 'string',
        enum: ['note', 'document'],
        description: 'note 为笔记内图片，document 为已解析的上传/云空间图片',
      },
      resourceId: { type: 'string', description: '笔记 ID 或已解析文件的 document ID' },
      imageNumbers: {
        type: 'array',
        items: { type: 'integer' },
        maxItems: 3,
        description: '可选，读取第几张图片；不填则按顺序读取前 3 张',
      },
    },
    required: ['resourceType', 'resourceId'],
  },
  normalizeArgs,
  requireRoot: false,
  timeoutMs: 90_000,
  resultBudget: 14_000,
  async execute(input, ctx) {
    const args = normalizeArgs(input);
    if (!args.resourceId) throw new Error('ID_REQUIRED: 请提供要分析的资源 ID');
    return args.resourceType === 'document' ? analyzeDocument(args, ctx) : analyzeNote(args, ctx);
  },
  transform(raw) {
    if (!raw) return '没有找到该资源，或资源不属于当前账号。';
    if (raw.error) return raw.message || '图片资源暂时无法分析。';
    const lines = (raw.results || []).map((result) => {
      const label = result.alt || `第 ${result.order || 1} 张图片`;
      if (result.status === 'success') return `### ${label}\n${result.content}`;
      if (result.status === 'unsupported') return `### ${label}\n该图片不是可安全读取的轻笺资源。`;
      return `### ${label}\n图片文字暂未识别成功。`;
    });
    return `《${raw.title}》图片分析（共 ${raw.totalImages} 张）\n\n${lines.join('\n\n') || '没有可分析的图片。'}`;
  },
  summarize(raw) {
    if (!raw || raw.error) return '图片分析：无结果';
    const success = (raw.results || []).filter((item) => item.status === 'success').length;
    return `图片分析《${raw.title}》：成功读取 ${success} 张`;
  },
};
