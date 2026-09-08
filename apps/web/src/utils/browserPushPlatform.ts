import { computed, onMounted, onUnmounted, ref } from 'vue';
import { usesMobileDeviceLayout } from '@/config/responsive';
import { isLightNoteAndroidApp } from '@/utils/androidBridge';

export function isBrowserPushDesktop(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof window !== 'undefined' &&
    !usesMobileDeviceLayout(window.innerWidth, window.matchMedia?.('(pointer: coarse)').matches ?? false) &&
    !document.documentElement.classList.contains('light-note-mobile-rendering') &&
    !isLightNoteAndroidApp()
  );
}

export function useBrowserPushDesktop() {
  const desktop = ref(isBrowserPushDesktop());
  const update = () => { desktop.value = isBrowserPushDesktop(); };
  onMounted(() => window.addEventListener('resize', update));
  onUnmounted(() => window.removeEventListener('resize', update));
  return computed(() => desktop.value);
}
