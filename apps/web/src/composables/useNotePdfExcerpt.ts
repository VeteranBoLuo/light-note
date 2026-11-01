import { ref, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { recordOperation } from '@/api/commonApi';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { bookmarkStore } from '@/store';
import { copyTextToClipboard } from '@/utils/clipboard';
import { takePendingPdfExcerpt, type PendingPdfExcerpt } from '@/utils/pdfExcerptHandoff';
import { buildPdfExcerptContent, type PdfExcerpt, type PdfExcerptFile } from '@/utils/pdfExcerpt';

export interface NotePdfExcerptEditor {
  insertExcerpt?: (excerpt: { html: string; markdown: string }, position?: 'cursor' | 'end') => boolean | Promise<boolean>;
  undoLastExcerpt?: () => boolean;
}

interface Options {
  editor: Ref<NotePdfExcerptEditor | null>;
  noteId: () => string;
  noteTitle: () => string;
  /** 只读笔记、手绘笔记不能插入摘录。 */
  canInsert: () => boolean;
}

/**
 * 笔记页里的 PDF 摘录：参考栏选中文字插到光标处，以及从云空间「摘录到笔记」跳来后追加到末尾。
 * 插不进去时把文字复制到剪贴板，不让摘录静默丢失。
 */
export function useNotePdfExcerpt(options: Options) {
  const { t } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();
  /** 手机没有参考栏，摘录后在笔记顶部给出「回到 PDF」。 */
  const returnTarget = ref<{ returnTo: string; fileId: string } | null>(null);

  async function insert(content: { html: string; markdown: string }, position: 'cursor' | 'end') {
    if (!options.canInsert()) return false;
    try {
      return Boolean(await options.editor.value?.insertExcerpt?.(content, position));
    } catch {
      return false;
    }
  }

  async function insertReferenceExcerpt(excerpt: PdfExcerpt, file: PdfExcerptFile) {
    const inserted = await insert(buildPdfExcerptContent(excerpt, file, t), 'cursor');
    if (inserted) void recordOperation({ module: 'PDF 摘录', operation: '插入笔记【参考栏】' }).catch(() => {});
    return inserted;
  }

  function undoReferenceExcerpt() {
    options.editor.value?.undoLastExcerpt?.();
  }

  function announce(arrival: PendingPdfExcerpt) {
    if (bookmark.isMobile) {
      returnTarget.value = { returnTo: arrival.returnTo, fileId: arrival.fileId };
      return;
    }
    message.success(t('cloudSpace.previewPanel.pdfExcerptAppended', { title: options.noteTitle() || arrival.noteTitle }));
  }

  /** 编辑器就绪后调用：消费从云空间带来的摘录，追加到末尾。 */
  async function consumeArrival() {
    const noteId = options.noteId();
    const arrival = noteId ? takePendingPdfExcerpt(noteId) : null;
    if (!arrival) return;
    if (arrival.insert) {
      if (!(await insert({ html: arrival.html, markdown: arrival.markdown }, 'end'))) {
        await copyTextToClipboard(arrival.text);
        message.warning(t('cloudSpace.previewPanel.pdfExcerptCannotInsert'));
        return;
      }
      void recordOperation({
        module: 'PDF 摘录',
        operation: `插入笔记【${bookmark.isMobile ? '手机' : '云空间'}】`,
      }).catch(() => {});
    }
    announce(arrival);
  }

  /** 来时是从云空间预览跳过来的，就按浏览器返回回去（页码已记在内存里）；否则重新打开该文件。 */
  async function returnToPdf() {
    const target = returnTarget.value;
    returnTarget.value = null;
    if (!target) return;
    if (target.returnTo && window.history.state?.back === target.returnTo) {
      router.back();
      return;
    }
    await router.push(target.returnTo || { path: '/cloudSpace', query: { fileId: target.fileId } });
  }

  watch(options.noteId, () => {
    returnTarget.value = null;
  });

  return { returnTarget, insertReferenceExcerpt, undoReferenceExcerpt, consumeArrival, returnToPdf };
}
