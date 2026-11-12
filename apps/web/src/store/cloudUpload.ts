import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import i18n from '@/i18n';
import cloudSpaceStore from './cloudSpace';
import bookmarkStore from './bookmark';
import useUserStore from './useUser';
import { apiBasePost } from '@/http/request';
import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
import { recordOperation } from '@/api/commonApi';
import { blockGuestWrite } from '@/composables/useGuestGuard';
import { isLightNoteAndroidApp } from '@/utils/androidBridge';
import {
  createCloudUploadQueue,
  CLOUD_UPLOAD_MOBILE_SELECTION_LIMIT,
  type CloudUploadSnapshot,
} from '@/utils/cloudUploadQueue';
import {
  CloudUploadSizeError,
  prepareCloudUploadSelection,
  renameCloudUploadSelection,
} from '@/utils/cloudUploadSelection';
import Alert from '@/components/base/BasicComponents/BModal/Alert';
import message from '@/components/base/BasicComponents/BMessage/BMessage';

/** 只在当前应用文档内保存；路由和上传入口不拥有队列，也不持久化本地原件。 */
export default defineStore('cloud-upload', () => {
  const cloud = cloudSpaceStore();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const progress = shallowRef<CloudUploadSnapshot | null>(null);
  const checking = ref(false);
  const checked = ref(0);
  const selectionTotal = ref(0);
  const selectionError = ref('');
  const collapsed = ref(false);
  const lastFolderId = ref<string | null>(null);
  const selectionLimit = computed(() =>
    bookmark.isMobileDevice || isLightNoteAndroidApp() ? CLOUD_UPLOAD_MOBILE_SELECTION_LIMIT : null,
  );
  const remaining = computed(() => (progress.value ? progress.value.total - progress.value.success : 0));
  const scope = () => buildNoteDetailRequestScope(user);
  const t = (key: string, values: Record<string, unknown> = {}) => i18n.global.t(key, values);
  let queue: ReturnType<typeof createCloudUploadQueue> | undefined;
  let generation = 0;
  let checkController: AbortController | undefined;
  let picker: ((folderId: string | null) => void) | undefined;

  function clear() {
    generation++;
    checkController?.abort();
    checkController = undefined;
    queue?.dispose();
    queue = undefined;
    progress.value = null;
    checking.value = false;
    checked.value = 0;
    selectionTotal.value = 0;
    selectionError.value = '';
    collapsed.value = false;
    lastFolderId.value = null;
  }
  async function run(current: NonNullable<typeof queue>, retryFailed: boolean) {
    const before = new Set(current.results().map((item) => item.taskId));
    await current.run(retryFailed);
    if (queue !== current) return;
    const added = current.results().filter((item) => !before.has(item.taskId));
    if (added.length) {
      void recordOperation({ module: '云空间', operation: `上传文件成功【${added.length}个】` }).catch(() => {});
      cloud.cacheImgArr.push(...added.filter((item) => item.status === '已覆盖').map((item) => item.fileId));
      try {
        if (!(await cloud.refreshAfterFileMutation({ preserveLoaded: true })) && queue === current)
          message.warning(t('cloudSpace.refreshPartialFailed'));
      } catch {
        if (queue === current) message.warning(t('cloudSpace.refreshPartialFailed'));
      }
    }
  }
  function normalizeFile(file: any): File {
    if (file instanceof File) return file;
    if (!file?.isImg || typeof file.file !== 'string') throw new Error('UPLOAD_SOURCE_INVALID');
    const [header, encoded] = file.file.split(';base64,');
    const mime = header.split(':')[1] || 'application/octet-stream';
    return new File(
      [Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))],
      file.fileName || `converted-image.${mime.split('/')[1]}`,
      { type: mime },
    );
  }
  async function enqueue(input: any[], folderId: string | null = null) {
    if (blockGuestWrite('upload-file') || checking.value || !input.length) return;
    lastFolderId.value = folderId;
    if (selectionLimit.value && input.length > selectionLimit.value) {
      selectionError.value = t('cloudSpace.uploadSelectionLimit', { count: selectionLimit.value });
      collapsed.value = false;
      return;
    }
    const owner = scope();
    const currentGeneration = generation;
    const active = () => generation === currentGeneration && scope() === owner && !controller.signal.aborted;
    const controller = new AbortController();
    checkController = controller;
    checking.value = true;
    checked.value = 0;
    selectionTotal.value = input.length;
    selectionError.value = '';
    if (!queue) collapsed.value = false;
    // 在异步检查开始时预留，上一轮可能在本轮查重期间刚好完成。
    const reserved = new Set(queue?.reservedFileNames() || []);
    try {
      const files = input.map(normalizeFile);
      const names = await prepareCloudUploadSelection(files, controller.signal, (count) => {
        if (active()) checked.value = count;
      });
      const response = await apiBasePost(
        '/api/file/checkFileNames',
        { fileNames: names },
        { silent: true, signal: controller.signal },
      );
      if (!active()) return;
      if (response.status !== 200) throw new Error('CHECK_FILE_NAMES_FAILED');
      const checks = Array.isArray(response.data) ? response.data : response.data?.check;
      if (!Array.isArray(checks)) throw new Error('CHECK_FILE_NAMES_FAILED');
      const localDuplicates = new Set(names).size !== names.length || names.some((name) => reserved.has(name));
      const duplicates = checks.filter((item: any) => item.exists).map((item: any) => item.fileName);
      let selected = files;
      if (localDuplicates || duplicates.length) {
        const choice = await new Promise<'overwrite' | 'rename' | 'cancel'>((resolve) => {
          const cancel = () => {
            Alert.destroy();
            resolve('cancel');
          };
          controller.signal.addEventListener('abort', cancel, { once: true });
          const choose = (value: 'overwrite' | 'rename' | 'cancel') => {
            controller.signal.removeEventListener('abort', cancel);
            Alert.destroy();
            resolve(value);
          };
          Alert.alert({
            title: t('cloudSpace.uploadQueueDuplicateTitle'),
            content: localDuplicates
              ? t('cloudSpace.uploadQueueLocalDuplicates')
              : t('cloudSpace.uploadQueueDuplicates', {
                  names: duplicates.slice(0, 3).join('、'),
                  count: duplicates.length,
                }),
            onCancel: () => choose('cancel'),
            footer: [
              ...(!localDuplicates
                ? [{ label: t('cloudSpace.uploadQueueOverwrite'), function: () => choose('overwrite') }]
                : []),
              { label: t('cloudSpace.uploadQueueRename'), type: 'primary' as const, function: () => choose('rename') },
              { label: t('common.cancel'), function: () => choose('cancel') },
            ],
          });
        });
        if (choice === 'cancel' || !active()) return;
        if (choice === 'rename') {
          const existing = new Set<string>([...(response.data?.allNames || []), ...duplicates, ...reserved]);
          selected = await renameCloudUploadSelection(files, names, existing, controller.signal);
        }
      }
      if (!active()) return;
      lastFolderId.value = folderId;
      if (queue) queue.append(selected, folderId);
      else
        queue = createCloudUploadQueue(selected, folderId, (state) => {
          if (generation === currentGeneration && scope() === owner) progress.value = state;
        });
      checking.value = false;
      if (!queue.snapshot().running) return run(queue, false);
    } catch (error) {
      if (!active()) return;
      selectionError.value =
        error instanceof CloudUploadSizeError
          ? t('cloudSpace.uploadFileTooLarge', { names: error.names.join('、'), count: error.count, size: 10 })
          : t('cloudSpace.uploadQueueCheckFailed');
      collapsed.value = false;
    } finally {
      if (checkController === controller) {
        checkController = undefined;
        checking.value = false;
      }
    }
  }
  function cancel() {
    checkController?.abort();
    checking.value = false;
    queue?.cancel();
  }
  async function retry() {
    if (blockGuestWrite('upload-file') || checking.value || !queue || queue.snapshot().running) return;
    return run(queue, true);
  }
  function setPicker(next: typeof picker) {
    picker = next;
  }
  const selectionOwner = () => `${generation}:${scope()}`;
  function openPicker(folderId: string | null = lastFolderId.value) {
    if (!blockGuestWrite('upload-file') && !checking.value) picker?.(folderId);
  }
  function attachLifecycle(target: Window = window) {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (remaining.value || checking.value) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    // 空闲页面不挂关闭拦截，避免全局队列影响浏览器的往返缓存。
    const stopGuard = watch(
      () => Boolean(remaining.value || checking.value),
      (needed) => {
        if (needed) target.addEventListener('beforeunload', beforeUnload);
        else target.removeEventListener('beforeunload', beforeUnload);
      },
      { immediate: true, flush: 'sync' },
    );
    target.addEventListener('pagehide', clear);
    target.addEventListener('light-note:app-exit', clear);
    return () => {
      stopGuard();
      target.removeEventListener('beforeunload', beforeUnload);
      target.removeEventListener('pagehide', clear);
      target.removeEventListener('light-note:app-exit', clear);
      clear();
    };
  }
  watch(scope, clear, { flush: 'sync' });
  onScopeDispose(clear);
  return {
    progress,
    checking,
    checked,
    selectionTotal,
    selectionError,
    collapsed,
    lastFolderId,
    selectionLimit,
    remaining,
    enqueue,
    retry,
    cancel,
    clear,
    setPicker,
    openPicker,
    attachLifecycle,
    selectionOwner,
  };
});
