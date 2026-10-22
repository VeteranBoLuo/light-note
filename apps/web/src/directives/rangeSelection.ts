import { shallowRef, watchEffect, type ObjectDirective, type ShallowRef } from 'vue';
import type { RangeSelectionController } from '@/composables/useRangeSelection';
import '@/assets/css/range-selection.less';

export interface RangeSelectionBinding {
  controller?: RangeSelectionController;
  key: string;
  group?: string;
}
const dispose = new WeakMap<HTMLElement, () => void>();
const bindingValues = new WeakMap<HTMLElement, ShallowRef<RangeSelectionBinding>>();

/** Capture a range gesture before a row or checkbox can perform its ordinary single toggle. */
export const vRangeSelect: ObjectDirective<HTMLElement, RangeSelectionBinding> = {
  mounted(element, binding) {
    const current = shallowRef(binding.value);
    bindingValues.set(element, current);
    const handle = (event: MouseEvent | KeyboardEvent) => {
      const value = current.value;
      if (!value?.controller?.active) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('[data-range-selection-item]') !== element) return;
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        if (!value.controller.selecting) return;
        value.controller.reset();
      } else {
        if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) return;
        if (target.closest('[aria-disabled="true"], :disabled, [contenteditable="true"], input, textarea, select'))
          return;
        const control = target.closest('button, a, [role="button"]');
        const checkbox = target.closest('[role="checkbox"]');
        if (control && control !== element && !checkbox && !control.hasAttribute('data-range-select')) return;
        if (value.controller.available && !value.controller.activate(String(value.key), value.group, event.shiftKey))
          return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const stop = watchEffect(() => {
      const value = current.value;
      element.toggleAttribute('data-range-selection-item', Boolean(value?.controller));
      if (value?.controller) {
        element.dataset.rangeSelectionKey = String(value.key);
        element.dataset.rangeSelectionGroup = value.group || 'default';
      } else {
        delete element.dataset.rangeSelectionKey;
        delete element.dataset.rangeSelectionGroup;
      }
      element.classList.toggle('range-selection-active', Boolean(value?.controller?.active));
      element.classList.toggle(
        'range-selection-anchor',
        Boolean(value?.controller?.isAnchor(String(value.key), value.group)),
      );
    });
    element.addEventListener('click', handle, true);
    element.addEventListener('keydown', handle, true);
    dispose.set(element, () => {
      stop();
      element.removeEventListener('click', handle, true);
      element.removeEventListener('keydown', handle, true);
    });
  },
  updated(element, binding) {
    const current = bindingValues.get(element);
    if (current) current.value = binding.value;
    element.toggleAttribute('data-range-selection-item', Boolean(binding.value?.controller));
    element.classList.toggle('range-selection-active', Boolean(binding.value?.controller?.active));
    element.classList.toggle(
      'range-selection-anchor',
      Boolean(binding.value?.controller?.isAnchor(String(binding.value.key), binding.value.group)),
    );
  },
  unmounted(element) {
    dispose.get(element)?.();
    dispose.delete(element);
    bindingValues.delete(element);
  },
};

const scrollBindings = new WeakMap<
  HTMLElement,
  { current: ShallowRef<RangeSelectionController | undefined>; stop: () => void }
>();
/** Reserve the measured toolbar footprint on the scroll owner, or on list content that overflows a fixed-height ancestor. */
export const vRangeSelectionScroll: ObjectDirective<HTMLElement, RangeSelectionController | undefined> = {
  mounted(element, binding) {
    const current = shallowRef(binding.value);
    const padding = element.style.paddingBottom;
    const scrollPadding = element.style.scrollPaddingBottom;
    const restore = () => {
      element.style.paddingBottom = padding;
      element.style.scrollPaddingBottom = scrollPadding;
    };
    const stop = watchEffect(() => {
      restore();
      const controller = current.value;
      if (!controller?.active || !controller.mobile || !controller.inset) return;
      const style = getComputedStyle(element);
      const gap = parseFloat(style.getPropertyValue('--ui-space-12')) || 0;
      const space = Math.max(parseFloat(style.paddingBottom) || 0, controller.inset + gap);
      element.style.paddingBottom = `${space}px`;
      element.style.scrollPaddingBottom = `${space}px`;
    });
    scrollBindings.set(element, {
      current,
      stop: () => {
        stop();
        restore();
      },
    });
  },
  updated(element, binding) {
    const state = scrollBindings.get(element);
    if (state) state.current.value = binding.value;
  },
  unmounted(element) {
    scrollBindings.get(element)?.stop();
    scrollBindings.delete(element);
  },
};
