import { computed } from 'vue';
import Alert from '@/components/base/BasicComponents/BModal/Alert';
import { bookmarkStore, useUserStore } from '@/store';
import { apiBasePost } from '@/http/request';

let previewGuideLocked = false;
let wallHitLocked = false;

/**
 * 上报「撞墙」转化埋点(wall_hit)。
 * 仅用于前端点击层拦截(不发写请求)的场景;走后端 ensureNotVisitor 的写请求由后端记 wall_hit,两者互斥不重复。
 * 内置 1.5s 节流:自动保存/连点等高频入口(如 NoteDetail 逐字保存)不会把同一次撞墙刷成多条。
 */
export function recordWallHit(source = 'client-guard'): void {
  if (wallHitLocked) {
    return;
  }
  wallHitLocked = true;
  setTimeout(() => {
    wallHitLocked = false;
  }, 1500);
  apiBasePost('/api/common/recordConversion', { event: 'wall_hit', source }).catch(() => {});
}

/**
 * 弹出「注册邀请」软引导。
 *
 * 命令式，可在任意处调用（包括 axios 响应拦截器作为兜底），不依赖组件上下文。
 * 内置 1.5s 防抖，避免批量请求 / 连点导致重复弹窗。
 *
 * 话术红线：预览模式下游客还没有自己的内容，不要写「保存你的内容」，
 * 统一用「注册后拥有你自己的轻笺」。
 *
 * 注意：本函数不记录 wall_hit —— 它会被后端 preview 兜底路径(App.vue handlePreviewBlocked)复用(后端已记 wall_hit),
 * 客户端主动拦截请用 blockGuestWrite / recordWallHit 记录,避免重复计数。
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
    title: '注册后即可动手',
    content:
      content ||
      '预览模式仅支持浏览查看，新建、编辑、删除等操作需要注册。注册即用、自动登录、已备好示例数据，免费收藏书签、记笔记、存文件。',
    footer: [
      { label: '继续浏览', type: 'dashed', function: () => Alert.destroy() },
      {
        label: '免费注册，立即拥有',
        type: 'primary',
        function: () => {
          Alert.destroy();
          // 转化埋点:点击 CTA(fire-and-forget,不阻塞)
          apiBasePost('/api/common/recordConversion', { event: 'cta_click', source: 'preview-guide' }).catch(() => {});
          bookmark.openAuthModal('注册');
        },
      },
    ],
  });
}

/**
 * 游客写操作即时拦截:是游客则记 wall_hit + 弹注册引导,返回 true 表示已拦截(不应继续写)。
 * 非游客返回 false,调用方照常执行写操作。
 * 用于「点击层」优化:游客点写操作时即时反馈、不发无效请求;后端 ensureNotVisitor 仍是安全兜底。
 */
export function blockGuestWrite(source: string, content?: string): boolean {
  const user = useUserStore();
  if (!user.id || user.role === 'visitor') {
    recordWallHit(source);
    showPreviewGuide(content);
    return true;
  }
  return false;
}

/**
 * 写操作守卫（点击层）。
 *
 * 游客点写操作时拦下并记 wall_hit、弹注册引导、不发请求；非游客放行。
 * 用法：
 *   const { guardWrite } = useGuestGuard();
 *   if (!guardWrite(undefined, 'add-bookmark')) return;   // 守卫式
 *   guardWrite(() => doWrite(), 'add-tag');                // 包裹式
 *
 * 注意：这是「即时反馈」优化层，并非安全层。真正的拦截由后端 ensureNotVisitor 兜底，
 * 即使某个入口漏接 guardWrite，游客的写请求也会被后端拦下并由响应拦截器统一弹引导。
 */
export function useGuestGuard() {
  const user = useUserStore();
  const isGuest = computed(() => !user.id || user.role === 'visitor');
  function guardWrite(action?: () => void, source = 'client-guard'): boolean {
    if (blockGuestWrite(source)) {
      return false;
    }
    action?.();
    return true;
  }
  return { isGuest, guardWrite, showPreviewGuide };
}
