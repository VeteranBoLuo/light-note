import { nextTick, onBeforeUnmount, onMounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

export interface ElementWidthClassRule {
  className: string;
  maxWidth: number;
}

export function resolveElementWidthClasses(width: number, rules: readonly ElementWidthClassRule[]) {
  if (!Number.isFinite(width) || width <= 0) return [];
  return rules.filter((rule) => width <= rule.maxWidth).map((rule) => rule.className);
}

/**
 * 以 ResizeObserver 给容器同步显式宽度类，作为旧 WebView 不支持 @container 的稳定替代。
 * 现代浏览器与 App 都走同一条 JS 判定，避免两端在相同容器宽度下分叉。
 */
export function useElementWidthClasses(
  rules: MaybeRefOrGetter<readonly ElementWidthClassRule[]>,
  onChange?: (activeClasses: ReadonlySet<string>) => void,
) {
  const elementRef = ref<HTMLElement | null>(null);
  let observer: ResizeObserver | null = null;
  let disposed = false;

  const sync = (explicitWidth?: number) => {
    const element = elementRef.value;
    if (!element) return;
    const width = explicitWidth || element.clientWidth || element.getBoundingClientRect().width;
    if (!Number.isFinite(width) || width <= 0) return;
    const widthRules = toValue(rules);
    const activeClasses = new Set(resolveElementWidthClasses(width, widthRules));
    widthRules.forEach((rule) => element.classList.toggle(rule.className, activeClasses.has(rule.className)));
    onChange?.(activeClasses);
  };

  const handleWindowResize = () => sync();
  watch(() => toValue(rules), handleWindowResize, { flush: 'post' });

  onMounted(() => {
    disposed = false;
    void nextTick(() => {
      // 组件可能在 nextTick 执行前已被条件渲染卸载，不能在卸载后重新挂监听。
      if (disposed) return;
      sync();
      const ResizeObserverConstructor = globalThis.ResizeObserver;
      if (typeof ResizeObserverConstructor === 'function' && elementRef.value) {
        observer = new ResizeObserverConstructor((entries) => {
          const entry = entries.find((item) => item.target === elementRef.value);
          sync(entry?.contentRect.width);
        });
        observer.observe(elementRef.value);
      }
      window.addEventListener('resize', handleWindowResize, { passive: true });
    });
  });

  onBeforeUnmount(() => {
    disposed = true;
    observer?.disconnect();
    observer = null;
    window.removeEventListener('resize', handleWindowResize);
  });

  return elementRef;
}
