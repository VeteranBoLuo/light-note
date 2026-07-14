import { computed } from 'vue';
import i18n from '@/i18n';
import { useUserStore } from '@/store';
import { apiBasePost } from '@/http/request';
import { showGuestNudge } from './guestNudge';
import message from '@/components/base/BasicComponents/BMessage/BMessage';

let previewGuideLocked = false;
let wallHitLocked = false;

// 游客维护工作区只放行展示内容本身；该列表是前端体验层，真正的安全边界仍由后端接口白名单控制。
const VISITOR_WORKSPACE_WRITE_SOURCES = new Set([
  'add-bookmark',
  'delete-bookmark',
  'bookmark-sort',
  'add-tag',
  'delete-tag',
  'add-note',
  'save-note',
  'delete-note',
  'reorder-note',
  'update-note-tags',
  'restore-note-version',
]);

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
export function showPreviewGuide(content?: string, source = 'preview_guide'): void {
  if (previewGuideLocked) {
    return;
  }
  previewGuideLocked = true;
  setTimeout(() => {
    previewGuideLocked = false;
  }, 1500);

  // 右下角非模态软引导:不挡内容、不强制交互、自动收起;注册 CTA(打开注册弹窗,记 signup_open)在 GuestNudge 组件内。
  // source 透传给 nudge,CTA 打开注册时复用它,保证 wall_hit→signup_open→signup_submit→register 归因来源一致
  showGuestNudge(content || i18n.global.t('guest.previewContent'), source);
}

// 按撞墙操作给场景:① 引导文案 msgKey ② 注册归因 source(取值都在 CONVERSION_SOURCES 白名单内)。
// 用关键词做「模块级」归类:同模块的增删改都归同一注册 source —— 这是期望行为(书签相关操作都算书签场景),
// 不是模糊匹配出错;未命中一律回退 preview_guide。话术红线:游客此刻没有自己的内容,统一「注册后拥有你自己的 X」。
function sceneForSource(raw: string): { source: string; msgKey: string } {
  const s = String(raw || '');
  if (s.includes('bookmark')) return { source: 'write_add_bookmark', msgKey: 'guest.nudgeBookmark' };
  if (s.includes('note')) return { source: 'write_add_note', msgKey: 'guest.nudgeNote' };
  if (s.includes('file') || s.includes('folder') || s.includes('upload') || s.includes('cloud'))
    return { source: 'write_upload_file', msgKey: 'guest.nudgeCloud' };
  if (s.includes('tag')) return { source: 'preview_guide', msgKey: 'guest.nudgeTag' };
  if (s.includes('ai')) return { source: 'write_ai', msgKey: 'guest.nudgeAi' };
  return { source: 'preview_guide', msgKey: 'guest.previewContent' };
}

/**
 * 游客写操作即时拦截:是游客则记 wall_hit + 弹注册引导,返回 true 表示已拦截(不应继续写)。
 * 非游客返回 false,调用方照常执行写操作。
 * 用于「点击层」优化:游客点写操作时即时反馈、不发无效请求;后端 ensureNotVisitor 仍是安全兜底。
 */
export function blockGuestWrite(source: string, content?: string): boolean {
  const user = useUserStore();
  if (user.visitorWorkspace) {
    if (VISITOR_WORKSPACE_WRITE_SOURCES.has(source)) {
      return false;
    }
    message.warning(i18n.global.t('guest.visitorWorkspaceScope'));
    return true;
  }
  if (!user.id || user.role === 'visitor') {
    recordWallHit(source); // wall_hit 的 context 用原始操作名(热点表按具体操作分析)
    const scene = sceneForSource(source);
    // 文案优先用调用方显式传的,否则用场景文案;CTA 打开注册用场景归因 source,保持全链路同源
    showPreviewGuide(content || i18n.global.t(scene.msgKey), scene.source);
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
  const isGuest = computed(() => !user.visitorWorkspace && (!user.id || user.role === 'visitor'));
  function guardWrite(action?: () => void, source = 'client-guard'): boolean {
    if (blockGuestWrite(source)) {
      return false;
    }
    action?.();
    return true;
  }
  return { isGuest, guardWrite, showPreviewGuide };
}
