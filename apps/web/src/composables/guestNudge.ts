import { ref } from 'vue';

// 游客撞墙软引导(右下角非模态卡)的全局状态。
// showPreviewGuide 等命令式入口(可能在 axios 拦截器等无组件上下文处调用)只改这里的状态,
// 由根组件 GuestNudge.vue 负责渲染,从而拿到进出动画、自动收起、hover 暂停等能力。

export const nudgeVisible = ref(false);
export const nudgeContent = ref('');

const AUTO_HIDE_MS = 7000; // 首次展示后自动收起
const RESUME_MS = 4000; // 鼠标移开后再停留一会

let hideTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

export function showGuestNudge(content: string): void {
  nudgeContent.value = content;
  nudgeVisible.value = true;
  clearTimer();
  hideTimer = setTimeout(() => {
    nudgeVisible.value = false;
    hideTimer = null;
  }, AUTO_HIDE_MS);
}

export function hideGuestNudge(): void {
  nudgeVisible.value = false;
  clearTimer();
}

// hover 时暂停自动收起,避免用户正要点「注册」时卡片消失
export function pauseNudgeTimer(): void {
  clearTimer();
}
export function resumeNudgeTimer(): void {
  if (nudgeVisible.value && !hideTimer) {
    hideTimer = setTimeout(() => {
      nudgeVisible.value = false;
      hideTimer = null;
    }, RESUME_MS);
  }
}
