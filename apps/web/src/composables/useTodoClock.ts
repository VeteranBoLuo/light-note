import { onScopeDispose, readonly, shallowRef } from 'vue';

const now = shallowRef(Date.now());
const today = shallowRef(new Date(now.value));
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  now.value = Date.now();
  const date = new Date(now.value);
  if (date.toDateString() !== today.value.toDateString()) today.value = date;
}

function stopTimer() {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}

function syncVisibility() {
  tick();
  stopTimer();
  if (document.visibilityState !== 'hidden') timer = setInterval(tick, 1000);
}

/** 所有已挂载待办共用一个前台时钟；日期标签只在跨日时重新格式化。 */
export function useTodoClock() {
  tick();
  if (subscribers++ === 0 && typeof document !== 'undefined') {
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('focus', tick);
  }
  onScopeDispose(() => {
    if (--subscribers !== 0) return;
    stopTimer();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', syncVisibility);
      window.removeEventListener('focus', tick);
    }
  });
  return { now: readonly(now), today: readonly(today) };
}
