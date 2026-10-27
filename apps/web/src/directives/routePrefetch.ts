import type { ObjectDirective } from 'vue';
import type { RouteLocationRaw, Router } from 'vue-router';
import { PREWARM_PRIORITY, PREWARM_RUNTIME_ENTRIES } from '@/config/staticPrewarmGroups';
import { prefetchResolvedRoute } from '@/utils/routePrefetch';
import { scheduleStaticPrewarm } from '@/utils/staticPrewarm';

type Target = RouteLocationRaw | null | undefined;

/** Hover only downloads bytes; pressing or focusing resolves the intended route without mounting it. */
export function createRoutePrefetchDirective(router: Router): ObjectDirective<HTMLElement, Target> {
  const bindings = new WeakMap<HTMLElement, { update: (target: Target) => void; dispose: () => void }>();

  return {
    mounted(element, binding) {
      let target = binding.value;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let stopPrewarm: (() => void) | undefined;
      const clear = () => {
        clearTimeout(timer);
        timer = undefined;
        stopPrewarm?.();
        stopPrewarm = undefined;
      };
      const resolveTarget = () => {
        if (!target || element.matches(':disabled, [aria-disabled="true"]')) return;
        const resolved = router.resolve(target);
        if (resolved.fullPath !== router.currentRoute.value.fullPath) return resolved;
      };
      const hover = (event: PointerEvent) => {
        clear();
        if (event.pointerType === 'touch' || !resolveTarget()) return;
        timer = setTimeout(() => {
          timer = undefined;
          const resolved = resolveTarget();
          if (!resolved) return;
          const group = `route.${String(resolved.name || '')}`;
          if (!Object.hasOwn(PREWARM_RUNTIME_ENTRIES, group)) return;
          // Reuse the background queue, including its foreground and network restrictions.
          stopPrewarm = scheduleStaticPrewarm({ groups: [group], priority: PREWARM_PRIORITY.intent, optional: true });
        }, 100);
      };
      const prepare = () => {
        clear();
        if (!resolveTarget()) return;
        void prefetchResolvedRoute(router, target!).catch(() => {
          // Speculation must not navigate, report an error or prevent the ordinary click from retrying.
        });
      };
      const press = (event: PointerEvent) => {
        if (event.button === 0 && event.isPrimary !== false) prepare();
      };

      element.addEventListener('pointerenter', hover);
      element.addEventListener('pointerleave', clear);
      element.addEventListener('pointerdown', press);
      element.addEventListener('focus', prepare);
      element.addEventListener('blur', clear);
      bindings.set(element, {
        update(next) {
          if (target !== next) clear();
          target = next;
        },
        dispose() {
          clear();
          element.removeEventListener('pointerenter', hover);
          element.removeEventListener('pointerleave', clear);
          element.removeEventListener('pointerdown', press);
          element.removeEventListener('focus', prepare);
          element.removeEventListener('blur', clear);
        },
      });
    },
    updated(element, binding) {
      bindings.get(element)?.update(binding.value);
    },
    unmounted(element) {
      bindings.get(element)?.dispose();
      bindings.delete(element);
    },
  };
}
