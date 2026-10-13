import TurndownService from 'turndown';
import gfm from 'turndown-plugin-gfm';
import { EXTRACTION_LIMITS } from '@lightnote/shared/extraction';
import { resolveExtractionSourceVersions } from './sourceVersions.js';
import { parseDocumentBuffer, validateDocumentDescriptor } from '../aiDocument/parser.js';
import { localOcrProvider } from '../aiDocument/localOcr.js';
import { getObjectBufferFromObs, getObjectMetadataFromObs } from '../obsClient.js';
import { digest, fail } from './domain.js';

/** Never use search/Q&A truncation or visual descriptions as transcription evidence. */
export async function readMaterial({ userId, ref, id, database, signal }, dependencies = {}) {
  const resolve = dependencies.resolveVersions || resolveExtractionSourceVersions;
  const assertCurrent = async () => {
    const versions = await resolve({ userId, resourceRefs: [ref], database });
    if (versions.length !== 1 || versions[0].version !== ref.version)
      fail('SOURCE_CHANGED', '资料已变化，请重新选择', 409);
  };
  await assertCurrent();
  let title,
    segments,
    complete = true,
    coverage = {};
  if (ref.type === 'file') {
    const [[file]] = await database.query(
      'SELECT file_name,file_type,file_size,obs_key FROM files WHERE id=? AND create_by=? AND del_flag=0',
      [ref.id, userId],
    );
    if (!file?.obs_key) fail('SOURCE_UNAVAILABLE', '文件不可用', 404);
    const descriptor = validateDocumentDescriptor({
      fileName: file.file_name,
      fileType: file.file_type,
      fileSize: file.file_size,
    });
    const meta = await (dependencies.metadata || getObjectMetadataFromObs)(file.obs_key);
    if (Number(meta.contentLength) !== Number(file.file_size)) fail('SOURCE_CHANGED', '文件大小已变化', 409);
    const buffer = await (dependencies.download || getObjectBufferFromObs)(file.obs_key, {
      maxBytes: 20 * 1024 * 1024,
    });
    if (buffer.length !== Number(file.file_size)) fail('SOURCE_CHANGED', '文件大小已变化', 409);
    const parsed = await (dependencies.parse || parseDocumentBuffer)(buffer, descriptor, {
      includeSegments: true,
      signal,
      ocrProvider: localOcrProvider,
      imageProvider: localOcrProvider,
    });
    ({ segments, coverage } = parsed);
    if (['.md', '.markdown'].includes(descriptor.extension))
      segments = segments.map((segment) => ({ ...segment, format: 'markdown' }));
    complete = coverage.complete === true && !coverage.truncated;
    title = file.file_name;
  } else {
    const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    converter.use(gfm.gfm);
    let body;
    if (ref.type === 'note') {
      const [[note]] = await database.query(
        'SELECT title,content,type FROM note WHERE id=? AND create_by=? AND del_flag=0',
        [ref.id, userId],
      );
      if (!note) fail('SOURCE_UNAVAILABLE', '笔记不可用', 404);
      if (note.type === 'drawing') fail('DRAWING_UNSUPPORTED', '手绘笔记暂不支持提取');
      title = note.title;
      body = ['md', 'markdown'].includes(note.type)
        ? String(note.content || '')
        : converter.turndown(String(note.content || ''));
    } else {
      const [[bookmark]] = await database.query(
        'SELECT b.name,s.content FROM bookmark b LEFT JOIN bookmark_snapshot s ON s.bookmark_id=b.id AND s.user_id=b.user_id AND BINARY s.url=BINARY b.url WHERE b.id=? AND b.user_id=? AND b.del_flag=0',
        [ref.id, userId],
      );
      if (!bookmark?.content) fail('NO_ARCHIVED_BODY', '书签没有已存档正文，请先保存正文');
      title = bookmark.name;
      body = converter.turndown(bookmark.content);
      // Complete for the selected archive, not a claim about the live web page.
      coverage = { scope: 'saved_snapshot' };
    }
    if (body.length > EXTRACTION_LIMITS.sourceCharacters) fail('MATERIAL_LIMIT', '正文超过 300,000 字符，未截断处理');
    segments = [
      { id: 's1', text: body, kind: 'original', format: 'markdown', locator: { type: 'document', value: '正文' } },
    ];
  }
  if (!segments?.some((segment) => segment.text.trim())) fail('NO_TEXT', '资料没有可读取文字');
  await assertCurrent();
  const source = { id, version: ref.version, title: String(title || '').slice(0, 255), complete, coverage, segments };
  source.snapshotHash = digest(segments);
  return source;
}

/** Pack complete paragraphs/tables; adjoining windows share a whole boundary block.
 * Anchors retain stable segment IDs. Overlap records are deduplicated by source position only.
 * Oversized atomic blocks fail closed rather than clipping a table or a record silently.
 */
export function planWindows(source, budget = EXTRACTION_LIMITS.windowBytes) {
  const segments = [];
  for (const parent of source.segments) {
    let offset = 0;
    // Blank-line blocks keep ordinary Markdown tables intact.
    for (const block of parent.text.split(/(?<=\n)\s*\n/u)) {
      const index = parent.text.indexOf(block, offset);
      offset = index + block.length;
      if (!block.trim()) continue;
      const segment = { ...parent, id: `${parent.id}:${index}`, text: block, sourceOffset: index };
      if (Buffer.byteLength(JSON.stringify(segment), 'utf8') > budget / 2)
        fail('BLOCK_LIMIT', '单个段落或表格超过安全处理范围，请拆分资料后重试');
      segments.push(segment);
    }
  }
  if (!segments.length) fail('NO_TEXT', '资料没有可读取文字');
  const windows = [];
  let start = 0;
  while (start < segments.length) {
    let end = start,
      bytes = 0;
    while (end < segments.length) {
      const size = Buffer.byteLength(JSON.stringify(segments[end]), 'utf8');
      if (bytes + size > budget) break;
      bytes += size;
      end++;
    }
    windows.push({
      ...source,
      segments: segments.slice(start, end),
      window: { index: windows.length, start, end, total: segments.length },
      complete: source.complete && start === 0 && end === segments.length,
    });
    if (end === segments.length) break;
    start = end - 1; // Whole prior block provides continuation context with stable identity.
  }
  if (windows.length > EXTRACTION_LIMITS.windows) fail('WINDOW_LIMIT', '资料超过分段处理上限');
  return windows;
}
