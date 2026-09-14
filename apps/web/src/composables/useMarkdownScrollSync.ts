import { onBeforeUnmount, watch, type Ref } from 'vue';
import { codeLinePositions, mapScrollPosition, SOURCE_ATTRIBUTE, type ScrollAnchor } from '@/utils/markdownScrollMap';

type Side = 'edit' | 'preview';
type Editor = { getScrollElement(): HTMLElement | null; getSourceTop(offset: number): number; getValue(): string };

export function useMarkdownScrollSync(
  editor: Ref<Editor | null>,
  preview: Ref<HTMLElement | null>,
  enabled: () => boolean,
  blocked: () => boolean,
  renderedSource: () => string,
) {
  let leader: Side = 'edit';
  let frame = 0;
  let disposed = false;
  let points: Array<{ offset: number; top: number }> | null = null;
  const expected: Partial<Record<Side, number>> = {};
  let resize: ResizeObserver | undefined;
  let mutation: MutationObserver | undefined;

  function measurePreview(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const scale = element.offsetHeight ? rect.height / element.offsetHeight : 1;
    const top = (y: number) => (y - rect.top) / (scale || 1) + element.scrollTop - element.clientTop;
    const measured: Array<{ offset: number; top: number }> = [];
    // Only generated top-level anchors are authoritative. Raw HTML cannot inject nested anchors.
    for (const node of Array.from(element.children)) {
      const start = node.getAttribute(SOURCE_ATTRIBUTE);
      if (start === null) continue;
      measured.push({ offset: Number(start), top: top(node.getBoundingClientRect().top) });
      const codeStart = node.getAttribute('data-ln-md-code');
      const code = node.tagName === 'PRE' ? node.querySelector<HTMLElement>('code') : null;
      if (codeStart !== null && code) {
        for (const line of codeLinePositions(code)) {
          measured.push({ offset: Number(codeStart) + line.offset, top: top(line.top) });
        }
      }
    }
    return measured;
  }

  function sync() {
    frame = 0;
    if (disposed || !enabled() || blocked()) return;
    const cm = editor.value;
    const left = cm?.getScrollElement();
    const right = preview.value;
    if (!cm || !left || !right || !left.clientHeight || !right.clientHeight) return;
    // Never map the new editor document against an older, debounced preview.
    if (cm.getValue() !== renderedSource()) return;
    const leftMax = Math.max(0, left.scrollHeight - left.clientHeight);
    const rightMax = Math.max(0, right.scrollHeight - right.clientHeight);
    points ||= measurePreview(right);
    const anchors: ScrollAnchor[] = [{ source: 0, preview: 0 }];
    for (const point of points) {
      const source = cm.getSourceTop(point.offset);
      const previous = anchors[anchors.length - 1];
      if (source > previous.source && point.top > previous.preview && source < leftMax && point.top < rightMax) {
        anchors.push({ source, preview: point.top });
      }
    }
    anchors.push({ source: leftMax, preview: rightMax });
    const targetSide = leader === 'edit' ? 'preview' : 'edit';
    const target = leader === 'edit' ? right : left;
    const position = mapScrollPosition(
      leader === 'edit' ? left.scrollTop : right.scrollTop,
      anchors,
      leader === 'edit' ? 'source' : 'preview',
    );
    if (Math.abs(target.scrollTop - position) < 0.5) return;
    target.scrollTop = position;
    expected[targetSide] = target.scrollTop;
  }

  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(sync);
  }
  function invalidate(source?: Side) {
    points = null;
    if (source) leader = source;
    schedule();
  }
  function onScroll(source: Side) {
    const element = source === 'edit' ? editor.value?.getScrollElement() : preview.value;
    const target = expected[source];
    delete expected[source];
    if (element && target !== undefined && Math.abs(element.scrollTop - target) < 1) return;
    if (blocked()) return;
    if (editor.value?.getValue() !== renderedSource()) return;
    leader = source;
    schedule();
  }

  watch(
    [editor, preview, enabled],
    (_value, _old, onCleanup) => {
      resize?.disconnect();
      mutation?.disconnect();
      points = null;
      delete expected.edit;
      delete expected.preview;
      const element = preview.value;
      const left = editor.value?.getScrollElement();
      if (!element) return;
      resize = new ResizeObserver(() => invalidate());
      const observe = () => {
        resize?.disconnect();
        resize?.observe(element);
        if (left) resize?.observe(left);
        for (const child of Array.from(element.children)) resize?.observe(child);
      };
      observe();
      mutation = new MutationObserver(() => {
        observe();
        invalidate();
      });
      mutation.observe(element, { childList: true, subtree: true, characterData: true });
      const loaded = () => invalidate();
      element.addEventListener('load', loaded, true);
      element.addEventListener('error', loaded, true);
      onCleanup(() => {
        resize?.disconnect();
        mutation?.disconnect();
        element.removeEventListener('load', loaded, true);
        element.removeEventListener('error', loaded, true);
      });
      invalidate('edit');
    },
    { flush: 'post', immediate: true },
  );

  onBeforeUnmount(() => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    resize?.disconnect();
    mutation?.disconnect();
  });
  return { onScroll, invalidate, refresh: schedule };
}
