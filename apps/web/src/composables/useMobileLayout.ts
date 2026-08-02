import { computed, inject, onBeforeUnmount, onMounted, ref, type InjectionKey, type Ref } from 'vue';
import { isMobileViewport } from '@/config/responsive';

export const MOBILE_LAYOUT_CONTEXT: InjectionKey<Readonly<Ref<boolean>>> = Symbol('mobile-layout-context');

/**
 * 读取统一的移动端布局状态。
 *
 * 正常应用树由 App 把 bookmark store 的结果注入为唯一事实源；少数通过
 * createApp/render 独立挂载的基础弹框没有应用上下文，此时才按共享断点降级。
 */
export function useMobileLayout() {
  const injected = inject(MOBILE_LAYOUT_CONTEXT, null);
  if (injected) return computed(() => injected.value);

  const fallback = ref(typeof window !== 'undefined' && isMobileViewport(window.innerWidth));
  const syncFallback = () => {
    fallback.value = isMobileViewport(window.innerWidth);
  };
  onMounted(() => window.addEventListener('resize', syncFallback, { passive: true }));
  onBeforeUnmount(() => window.removeEventListener('resize', syncFallback));
  return computed(() => fallback.value);
}
