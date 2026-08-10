import { readonly, ref } from 'vue';

const SHOW_DELAY = 380;
const MIN_VISIBLE_DURATION = 260;

const activeRequestCount = ref(0);
const networkRequestLoadingState = ref(false);
export const networkRequestLoading = readonly(networkRequestLoadingState);

let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let visibleSince = 0;

function clearShowTimer() {
  if (!showTimer) return;
  clearTimeout(showTimer);
  showTimer = null;
}

function clearHideTimer() {
  if (!hideTimer) return;
  clearTimeout(hideTimer);
  hideTimer = null;
}

export function beginNetworkRequestFeedback() {
  activeRequestCount.value += 1;
  clearHideTimer();
  if (networkRequestLoadingState.value || showTimer) return;
  showTimer = setTimeout(() => {
    showTimer = null;
    if (activeRequestCount.value <= 0) return;
    visibleSince = Date.now();
    networkRequestLoadingState.value = true;
  }, SHOW_DELAY);
}

export function finishNetworkRequestFeedback() {
  activeRequestCount.value = Math.max(0, activeRequestCount.value - 1);
  if (activeRequestCount.value > 0) return;
  clearShowTimer();
  if (!networkRequestLoadingState.value) return;
  const remaining = Math.max(0, MIN_VISIBLE_DURATION - (Date.now() - visibleSince));
  clearHideTimer();
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (activeRequestCount.value > 0) return;
    networkRequestLoadingState.value = false;
    visibleSince = 0;
  }, remaining);
}

export function resetNetworkRequestFeedback() {
  activeRequestCount.value = 0;
  clearShowTimer();
  clearHideTimer();
  networkRequestLoadingState.value = false;
  visibleSince = 0;
}
