import type { Router } from 'vue-router';
import { recordOperation } from '@/api/commonApi';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { createNoteFromContent } from '@/utils/aiNoteDraft';
import { formatNoteReferenceQuery } from '@/utils/noteReference';
import { rememberPdfPage, setPendingPdfExcerpt } from '@/utils/pdfExcerptHandoff';
import {
  buildPdfExcerptContent,
  pdfExcerptNoteTitle,
  type PdfExcerpt,
  type PdfExcerptFile,
  type PdfExcerptNoteTarget,
} from '@/utils/pdfExcerpt';

export interface PdfExcerptToNoteContext {
  router: Router;
  t: (key: string, values?: Record<string, unknown>) => string;
  isMobile: boolean;
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `pdf-excerpt-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * 云空间预览里的「摘录到笔记」：服务端没有追加接口，统一跳到笔记页，由编辑器写入，
 * 保存、撤销与并发冲突都沿用编辑器的流程。新建笔记时摘录直接作为正文创建。
 */
export async function sendPdfExcerptToNote(
  { router, t, isMobile }: PdfExcerptToNoteContext,
  excerpt: PdfExcerpt,
  file: PdfExcerptFile,
  target: PdfExcerptNoteTarget,
) {
  const { html, markdown } = buildPdfExcerptContent(excerpt, file, t);
  let noteId = '';
  let noteTitle = '';
  if (target.type === 'new') {
    noteTitle = pdfExcerptNoteTitle(file.fileName, t('cloudSpace.previewPanel.pdfExcerptNoteSuffix'));
    try {
      ({ noteId } = await createNoteFromContent({ title: noteTitle, content: html, type: 'html' }, createIdempotencyKey(), {
        title: noteTitle,
        parentId: null,
        tags: [],
        projectId: '',
        thoughts: '',
      }));
    } catch (error) {
      if ((error as { code?: string })?.code !== 'SAVE_NOTE_CANCELLED') message.error(t('cloudSpace.previewPanel.pdfExcerptCreateFailed'));
      return false;
    }
    // 插入已有笔记要等到达后真正写入才记录，见 useNotePdfExcerpt。
    void recordOperation({ module: 'PDF 摘录', operation: `摘录到新笔记【${isMobile ? '手机' : '云空间'}】` }).catch(
      () => {},
    );
  } else {
    noteId = target.id;
    noteTitle = target.title;
  }
  // 浮层占用的 history 由调用方先关闭；这里只记下返回位置和页码，不改写当前地址。
  const route = router.currentRoute.value;
  const returnTo = route.path === '/cloudSpace' ? route.fullPath : '';
  rememberPdfPage(file.fileId, excerpt.pageStart);
  setPendingPdfExcerpt({
    noteId,
    noteTitle,
    insert: target.type === 'note',
    html,
    markdown,
    text: excerpt.text,
    fileId: file.fileId,
    page: excerpt.pageStart,
    returnTo,
  });
  // 电脑上把 PDF 放进参考栏，停在同一页，可以接着摘；手机没有参考栏，只打开笔记。
  await router.push({
    path: `/noteLibrary/${noteId}`,
    query: isMobile ? {} : { ref: formatNoteReferenceQuery({ type: 'file', id: file.fileId }) },
  });
  return true;
}
