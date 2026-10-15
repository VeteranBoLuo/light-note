import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';
import i18n from '@/i18n';
import { bookmarkStore, inboxStore, useUserStore } from '@/store';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import {
  loadAndroidShareFiles,
  onAndroidShareAvailable,
  peekAndroidShare,
} from '@/utils/androidIncomingShare';
import { buildQuickCaptureShareDraft } from '@/utils/incomingShare';

interface AndroidIncomingShareOptions {
  /** /me 已给出确定结果；身份未知时不能把默认游客状态当成真实游客。 */
  authReady: Ref<boolean>;
  /** 公开独立页面不挂载快速添加，等用户回到应用页面再处理。 */
  blocked: Ref<boolean>;
}

/**
 * Android 系统分享的调度：在身份确认后查询原生暂存的分享，读取文件并打开预填好的「快速添加」。
 *
 * - 游客先打开登录框，分享继续留在原生暂存；登录后身份变化会再次触发查询。
 * - 管理员代管上下文不自动打开，避免把自己手机上的分享存进被代管账号。
 * - 快速添加已经打开时不打断用户当前输入，等关闭后再处理。
 */
export function useAndroidIncomingShare(options: AndroidIncomingShareOptions) {
  const user = useUserStore();
  const inbox = inboxStore();
  const bookmark = bookmarkStore();
  let running = false;
  let rerun = false;
  let disposed = false;
  let loginPromptedFor = '';
  let adminNoticeFor = '';

  async function check() {
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      do {
        rerun = false;
        await checkOnce();
      } while (rerun && !disposed);
    } finally {
      running = false;
    }
  }

  function canOpenNow() {
    return options.authReady.value && !options.blocked.value && !inbox.quickCaptureVisible && !disposed;
  }

  async function checkOnce() {
    if (!canOpenNow()) return;
    const peek = await peekAndroidShare();
    if (peek.status !== 'ready' || !canOpenNow()) return;
    const share = peek.share;
    if (!user.id || user.role === 'visitor') {
      if (loginPromptedFor !== share.id) {
        loginPromptedFor = share.id;
        message.info(i18n.global.t('inbox.shareLoginRequired'));
        bookmark.openAuthModal('登录', 'preview_guide');
      }
      return;
    }
    if (user.adminContext) {
      if (adminNoticeFor !== share.id) {
        adminNoticeFor = share.id;
        message.warning(i18n.global.t('inbox.shareAdminContext'));
      }
      return;
    }
    const owner = user.id;
    const closeLoading = share.files.length ? message.loading(i18n.global.t('inbox.shareLoading'), 0) : null;
    let loaded: Awaited<ReturnType<typeof loadAndroidShareFiles>>;
    try {
      loaded = await loadAndroidShareFiles(share);
    } finally {
      closeLoading?.();
    }
    // 读取期间账号变化或用户自己打开了快速添加：放弃本轮，暂存仍在，稍后重新处理。
    if (user.id !== owner || user.adminContext || !canOpenNow()) return;
    inbox.openQuickCaptureWithShare(buildQuickCaptureShareDraft(share, loaded.files, loaded.failed));
  }

  const stopListening = onAndroidShareAvailable(() => void check());
  const stopWatching = watch(
    [
      options.authReady,
      options.blocked,
      () => user.id,
      () => user.role,
      () => user.adminContext?.id || '',
      () => inbox.quickCaptureVisible,
    ],
    () => void check(),
  );
  onMounted(() => void check());
  onBeforeUnmount(() => {
    disposed = true;
    stopListening();
    stopWatching();
  });

  return { check };
}
