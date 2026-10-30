import { computed, ref } from 'vue';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { recordOperation } from '@/api/commonApi';
import { ensureCloudFolder, uploadCloudFile } from '@/api/cloudFileUploadApi';
import { prepareMaskedIconsForCanvas } from '@/utils/canvasExport';

/**
 * 固定尺寸海报的导出、分享与保存到云空间（成长周报与年度报告共用）。
 *
 * - 导出时克隆海报到屏幕外的原尺寸容器，去掉预览缩放后用 html2canvas 绘制。
 * - 绘制期间账号变化时放弃本次结果，避免把上一个账号的海报存进新账号。
 * - 文件分享不可用或失去用户手势时退回下载，并提示用户。
 */
export interface PosterExportOptions {
  posterRoot: () => HTMLElement | null | undefined;
  width: number;
  height: number;
  background: string;
  scale?: number;
  filename: () => string;
  shareTitle: () => string;
  cloudFolder: string;
  ownerKey: () => string;
  canExport: () => boolean;
  canSaveToCloud?: () => boolean;
  text: {
    exportSuccess: () => string;
    exportFailed: () => string;
    shareFallback: () => string;
    shareFailed: () => string;
    cloudSuccess: () => string;
    cloudFailed: () => string;
  };
  log: { module: string; download: string; share: string; cloud: string };
}

export function usePosterExport(options: PosterExportOptions) {
  const exporting = ref(false);
  const sharing = ref(false);
  const cloudSaving = ref(false);
  const busy = computed(() => exporting.value || sharing.value || cloudSaving.value);

  async function renderPoster() {
    const poster = options.posterRoot();
    if (!poster) throw new Error('poster_not_ready');
    const html2canvas = (await import('html2canvas')).default;
    const exportHost = document.createElement('div');
    const exportPoster = poster.cloneNode(true) as HTMLElement;
    exportHost.setAttribute('aria-hidden', 'true');
    Object.assign(exportHost.style, {
      position: 'fixed',
      top: '0',
      left: '-10000px',
      width: `${options.width}px`,
      height: `${options.height}px`,
      overflow: 'hidden',
      pointerEvents: 'none',
    });
    exportPoster.dataset.posterExport = 'true';
    exportPoster.style.transform = 'none';
    exportHost.append(exportPoster);
    document.body.append(exportHost);
    try {
      prepareMaskedIconsForCanvas(exportPoster, window);
      await document.fonts?.ready;
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      return await html2canvas(exportPoster, {
        backgroundColor: options.background,
        scale: options.scale ?? 3,
        useCORS: true,
        logging: false,
        onclone: (documentClone) => {
          const clonedPoster = documentClone.querySelector<HTMLElement>('[data-poster-export="true"]');
          if (clonedPoster) clonedPoster.style.transform = 'none';
        },
      });
    } finally {
      exportHost.remove();
    }
  }

  function canvasToBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('poster_blob_failed'))), 'image/png'),
    );
  }

  async function posterFile() {
    const owner = options.ownerKey();
    const filename = options.filename();
    const blob = await canvasToBlob(await renderPoster());
    if (owner !== options.ownerKey()) throw new DOMException('Poster owner changed', 'AbortError');
    return new File([blob], filename, { type: 'image/png' });
  }

  function saveBlob(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.download = file.name;
    link.href = url;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadPoster() {
    if (busy.value || !options.canExport()) return;
    exporting.value = true;
    try {
      saveBlob(await posterFile());
      message.success(options.text.exportSuccess());
      recordOperation({ module: options.log.module, operation: options.log.download });
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      console.error('导出海报失败:', error);
      message.error(options.text.exportFailed());
    } finally {
      exporting.value = false;
    }
  }

  async function sharePoster() {
    if (busy.value || !options.canExport()) return;
    sharing.value = true;
    try {
      const file = await posterFile();
      const canShareFile =
        typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ files: [file] }));
      if (canShareFile) {
        try {
          await navigator.share({ title: options.shareTitle(), files: [file] });
          recordOperation({ module: options.log.module, operation: options.log.share });
          return;
        } catch (error) {
          // 某些容器暴露 API 却不支持文件分享，或绘制后已失去短时用户手势。
          if (!['NotAllowedError', 'NotSupportedError', 'TypeError'].includes((error as Error)?.name)) throw error;
        }
      }
      saveBlob(file);
      message.info(options.text.shareFallback());
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        console.error('分享海报失败:', error);
        message.error(options.text.shareFailed());
      }
    } finally {
      sharing.value = false;
    }
  }

  async function savePosterToCloud() {
    if (busy.value || !options.canExport() || options.canSaveToCloud?.() === false) return;
    cloudSaving.value = true;
    const owner = options.ownerKey();
    try {
      const file = await posterFile();
      const folder = await ensureCloudFolder(options.cloudFolder);
      if (owner !== options.ownerKey()) return;
      await uploadCloudFile(file, folder.id);
      message.success(options.text.cloudSuccess());
      recordOperation({ module: options.log.module, operation: options.log.cloud });
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      console.error('保存海报到云空间失败:', error);
      message.error(options.text.cloudFailed());
    } finally {
      cloudSaving.value = false;
    }
  }

  return { exporting, sharing, cloudSaving, busy, downloadPoster, sharePoster, savePosterToCloud };
}
