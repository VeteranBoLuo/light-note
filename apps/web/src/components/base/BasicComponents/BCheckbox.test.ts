import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import BCheckbox from './BCheckbox.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountCheckbox(
  options: {
    modelValue?: boolean;
    checked?: boolean;
    disabled?: boolean;
    indeterminate?: boolean;
    controlled?: boolean;
    reject?: boolean;
  } = {},
) {
  const host = document.createElement('div');
  document.body.append(host);
  const modelValue = ref(options.modelValue);
  const checked = ref(options.checked);
  const onChange = vi.fn();
  const app = createApp({
    setup() {
      return () =>
        h(
          BCheckbox,
          {
            ...(options.modelValue === undefined ? {} : { modelValue: modelValue.value }),
            ...(options.checked === undefined ? {} : { checked: checked.value }),
            disabled: options.disabled,
            controlled: options.controlled,
            indeterminate: options.indeterminate,
            'onUpdate:modelValue': (value: boolean) => {
              if (options.reject) return;
              modelValue.value = value;
            },
            'onUpdate:checked': (value: boolean) => {
              if (options.reject) return;
              checked.value = value;
            },
            onChange,
          },
          { default: () => 'Choose' },
        );
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, modelValue, checked, onChange };
}

describe('BCheckbox semantics', () => {
  it('受控模式下父层拒绝超限选择时不显示假勾选', async () => {
    const { host, onChange } = mountCheckbox({ checked: false, controlled: true, reject: true });
    const checkbox = host.querySelector<HTMLElement>('[role="checkbox"]')!;
    checkbox.click();
    await nextTick();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
  });
  it('preserves an initial v-model value and toggles with Space', async () => {
    const { host, modelValue, onChange } = mountCheckbox({ modelValue: true });
    const checkbox = host.querySelector<HTMLElement>('[role="checkbox"]');
    expect(checkbox?.getAttribute('aria-checked')).toBe('true');

    checkbox?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await nextTick();

    expect(modelValue.value).toBe(false);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(checkbox?.getAttribute('aria-checked')).toBe('false');
  });

  it('reports mixed state and ignores interaction while disabled', async () => {
    const { host, onChange } = mountCheckbox({ checked: false, disabled: true, indeterminate: true });
    const checkbox = host.querySelector<HTMLElement>('[role="checkbox"]');
    expect(checkbox?.getAttribute('aria-checked')).toBe('mixed');
    expect(checkbox?.tabIndex).toBe(-1);

    checkbox?.click();
    checkbox?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    expect(onChange).not.toHaveBeenCalled();
  });
});
