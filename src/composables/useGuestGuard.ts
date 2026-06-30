import { computed } from 'vue';
import Alert from '@/components/base/BasicComponents/BModal/Alert';
import { bookmarkStore, useUserStore } from '@/store';

let previewGuideLocked = false;

/**
 * 弹出「预览模式」软引导。
 *
 * 命令式，可在任意处调用（包括 axios 响应拦截器作为兜底），不依赖组件上下文。
 * 内置 1.5s 防抖，避免批量请求 / 连点导致重复弹窗。
 *
 * 话术红线：预览模式下游客还没有自己的内容，不要写「保存你的内容」，
 * 统一用「注册后拥有你自己的轻笺」。
 */
export function showPreviewGuide(content?: string): void {
  if (previewGuideLocked) {
    return;
  }
  previewGuideLocked = true;
  setTimeout(() => {
    previewGuideLocked = false;
  }, 1500);
  const bookmark = bookmarkStore();
  Alert.alert({
    title: '预览模式',
    content: content || '当前是预览模式，注册后即可拥有你自己的轻笺，免费保存你的书签、笔记和文件。',
    footer: [
      { label: '继续浏览', type: 'dashed', function: () => Alert.destroy() },
      {
        label: '立即注册',
        type: 'primary',
        function: () => {
          Alert.destroy();
          bookmark.openAuthModal('注册');
        },
      },
    ],
  });
}

/**
 * 写操作守卫（点击层）。
 *
 * 游客点写操作时拦下并弹预览引导、不发请求；非游客放行。
 * 用法：
 *   const { guardWrite } = useGuestGuard();
 *   if (!guardWrite()) return;        // 守卫式
 *   guardWrite(() => doWrite());      // 包裹式
 *
 * 注意：这是「即时反馈」优化层，并非安全层。真正的拦截由后端 ensureNotVisitor 兜底，
 * 即使某个入口漏接 guardWrite，游客的写请求也会被后端拦下并由响应拦截器统一弹引导。
 */
export function useGuestGuard() {
  const user = useUserStore();
  const isGuest = computed(() => !user.id || user.role === 'visitor');
  function guardWrite(action?: () => void): boolean {
    if (isGuest.value) {
      showPreviewGuide();
      return false;
    }
    action?.();
    return true;
  }
  return { isGuest, guardWrite, showPreviewGuide };
}
