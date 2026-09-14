import { nextTick, watch, type Ref } from 'vue';
import { findVerticalScrollContainer, scrollCenterIntoContainer } from '@/utils/zoom';

/** The caller supplies a whitelisted field selector, never a raw URL selector. */
export function useSettingsFieldFocus(root: Ref<HTMLElement | null>, target: () => string | null) {
  watch(
    target,
    async (selector, _, onCleanup) => {
      let cancelled = false;
      let frame = 0;
      let timer = 0;
      let field: HTMLElement | null = null;
      onCleanup(() => {
        cancelled = true;
        cancelAnimationFrame(frame);
        window.clearTimeout(timer);
        field?.classList.remove('is-settings-focus');
      });
      if (!selector) return;
      await nextTick();
      if (cancelled) return;
      // Run after category rendering and the settings shell's scroll restoration.
      frame = requestAnimationFrame(() => {
        field = root.value?.querySelector<HTMLElement>(selector) || null;
        if (!field) return;
        const container = findVerticalScrollContainer(field, root.value);
        if (container) {
          const bounds = container.getBoundingClientRect();
          const rect = field.getBoundingClientRect();
          const header = root.value?.querySelector<HTMLElement>('.settings-subhead, .settings-category-heading');
          const visibleTop = Math.max(bounds.top, header?.getBoundingClientRect().bottom || bounds.top);
          if (rect.top < visibleTop || rect.bottom > Math.min(bounds.bottom, window.innerHeight)) {
            scrollCenterIntoContainer(container, field, 'auto');
          }
        }
        field.classList.add('is-settings-focus');
        timer = window.setTimeout(() => field?.classList.remove('is-settings-focus'), 2400);
      });
    },
    { immediate: true, flush: 'post' },
  );
}
