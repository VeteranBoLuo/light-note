import { nextTick, watch, type Ref } from 'vue';
import { useUiDensity } from './useUiDensity';

/** Preserve the reading position of a non-virtual, vertically scrolling panel.
 * Virtual lists retain their own row-key anchors. Only density changes trigger
 * measurement; ordinary scrolling, mounting and navigation do not scan children.
 */
export function useDensityScrollAnchor(container: Readonly<Ref<HTMLElement | null>>) {
  const { density } = useUiDensity();
  watch(
    density,
    async (_, __, onCleanup) => {
      const viewport = container.value;
      if (!viewport?.isConnected || viewport.clientHeight <= 0 || viewport.scrollTop <= 0) return;
      let cancelled = false;
      let frame: number | null = null;
      onCleanup(() => {
        cancelled = true;
        if (frame !== null) cancelAnimationFrame(frame);
      });
      const atBottom = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 1;
      const top = viewport.getBoundingClientRect().top + viewport.clientTop;
      const anchor = atBottom
        ? null
        : Array.from(viewport.children).find((child) => {
            const rect = child.getBoundingClientRect();
            return rect.height > 0 && rect.bottom > top && rect.top < top + viewport.clientHeight;
          });
      const before = anchor?.getBoundingClientRect();
      const offset = before ? before.top - top : 0;
      // A partially visible section retains the same point within that section.
      const progress = before && offset < 0 ? -offset / before.height : 0;
      await nextTick();
      if (cancelled || container.value !== viewport || !viewport.isConnected) return;
      // Let the browser finish its own scroll anchoring before restoring ours.
      frame = requestAnimationFrame(() => {
        frame = null;
        if (cancelled || container.value !== viewport || !viewport.isConnected) return;
        const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        if (atBottom) viewport.scrollTop = max;
        else if (anchor?.parentElement === viewport && anchor.isConnected) {
          const after = anchor.getBoundingClientRect();
          const targetOffset = progress ? -after.height * progress : offset;
          const delta = after.top - viewport.getBoundingClientRect().top - viewport.clientTop - targetOffset;
          viewport.scrollTop = Math.max(0, Math.min(max, viewport.scrollTop + delta));
        }
      });
    },
    // Capture before applyUiDensity writes CSS variables; restore after Vue layout updates.
    { flush: 'sync' },
  );
}
