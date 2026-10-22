import { computed, reactive, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

export interface RangeSelectionGroup {
  id: string;
  keys: readonly string[];
}
export interface RangeSelectionOptions {
  active: MaybeRefOrGetter<boolean>;
  mobile: MaybeRefOrGetter<boolean>;
  blocked?: MaybeRefOrGetter<boolean>;
  groups: MaybeRefOrGetter<readonly RangeSelectionGroup[]>;
  scope?: MaybeRefOrGetter<unknown>;
  apply: (keys: string[]) => boolean | void;
}
export type RangeSelectionController = ReturnType<typeof useRangeSelection>;

/** Owns the gesture only. Each surface supplies its displayed order and keeps its selection store. */
export function useRangeSelection(options: RangeSelectionOptions) {
  const anchor = ref<{ key: string; group: string } | null>(null);
  const selecting = ref(false);
  const wrongGroup = ref(false);
  const inset = ref(0);
  const shiftHeld = ref(false);
  const groups = computed(() => toValue(options.groups).map((group) => ({ id: group.id, keys: [...group.keys] })));
  const active = computed(() => toValue(options.active));
  const blocked = computed(() => Boolean(toValue(options.blocked)));
  const mobile = computed(() => toValue(options.mobile));
  const available = computed(() => active.value && !blocked.value && groups.value.some((group) => group.keys.length));
  function reset() {
    shiftHeld.value = false;
    anchor.value = null;
    selecting.value = false;
    wrongGroup.value = false;
  }
  function hideShiftHint() {
    shiftHeld.value = false;
  }
  function ignoresShiftHint(target: EventTarget | null) {
    return (
      target instanceof Element &&
      Boolean(
        target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="dialog"], [aria-modal="true"], [role="menu"]',
        ),
      )
    );
  }
  watch(
    () => available.value && !mobile.value,
    (enabled, _previous, onCleanup) => {
      hideShiftHint();
      if (!enabled || typeof window === 'undefined') return;
      const keydown = (event: KeyboardEvent) => {
        if (
          ignoresShiftHint(event.target) ||
          event.isComposing ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.key === 'Escape'
        ) {
          hideShiftHint();
        } else if (event.key === 'Shift' && !event.repeat) {
          shiftHeld.value = true;
        }
      };
      const keyup = (event: KeyboardEvent) => {
        if (event.key === 'Shift' && !event.shiftKey) hideShiftHint();
      };
      const visibility = () => {
        if (document.visibilityState !== 'visible') hideShiftHint();
      };
      const focus = (event: FocusEvent) => {
        if (ignoresShiftHint(event.target)) hideShiftHint();
      };
      // Capture releases even when a focused child stops keyboard propagation; never consume the keys.
      window.addEventListener('keydown', keydown, true);
      window.addEventListener('keyup', keyup, true);
      window.addEventListener('blur', hideShiftHint);
      window.addEventListener('pagehide', hideShiftHint);
      document.addEventListener('visibilitychange', visibility);
      document.addEventListener('focusin', focus);
      onCleanup(() => {
        window.removeEventListener('keydown', keydown, true);
        window.removeEventListener('keyup', keyup, true);
        window.removeEventListener('blur', hideShiftHint);
        window.removeEventListener('pagehide', hideShiftHint);
        document.removeEventListener('visibilitychange', visibility);
        document.removeEventListener('focusin', focus);
        hideShiftHint();
      });
    },
    { immediate: true, flush: 'sync' },
  );
  function toggle() {
    if (!available.value) return;
    const next = !selecting.value;
    reset();
    selecting.value = next;
  }
  function contains(key: string, group: string) {
    return groups.value.find((entry) => entry.id === group)?.keys.includes(key) === true;
  }
  /** true consumes the activation; false leaves the surface's ordinary click/keyboard behavior intact. */
  function activate(key: string, group = 'default', shift = false) {
    if (!available.value || !contains(key, group)) return false;
    const start = anchor.value;
    if (mobile.value && selecting.value && !start) {
      anchor.value = { key, group };
      return true;
    }
    const extend = mobile.value ? selecting.value : shift;
    if (!extend || !start || (!mobile.value && start.group !== group)) {
      anchor.value = { key, group };
      return false;
    }
    if (start.group !== group) {
      wrongGroup.value = true;
      return true;
    }
    wrongGroup.value = false;
    const keys = groups.value.find((entry) => entry.id === group)!.keys;
    const from = keys.indexOf(start.key);
    const to = keys.indexOf(key);
    if (from < 0 || to < 0) {
      reset();
      return true;
    }
    const ok = options.apply([...keys.slice(Math.min(from, to), Math.max(from, to) + 1)]);
    if (ok !== false && mobile.value) reset();
    return true;
  }
  function isAnchor(key: string, group = 'default') {
    return selecting.value && anchor.value?.key === key && anchor.value.group === group;
  }
  watch([active, blocked, mobile, () => toValue(options.scope)], reset, { flush: 'sync' });
  watch(
    available,
    (value) => {
      if (!value) reset();
    },
    { flush: 'sync' },
  );
  watch(
    groups,
    (next, previous) => {
      const start = anchor.value;
      if (!start) return;
      const before = previous.find((group) => group.id === start.group)?.keys;
      const after = next.find((group) => group.id === start.group)?.keys;
      // Appending another page is safe. Filtering, replacing or reordering an existing range needs a new anchor.
      if (!before || !after || after.length < before.length || before.some((key, index) => after[index] !== key))
        reset();
    },
    { flush: 'sync' },
  );
  return reactive({
    active,
    available,
    mobile,
    inset,
    selecting,
    anchor,
    desktopHintKey: computed(() =>
      available.value && !mobile.value && shiftHeld.value
        ? anchor.value
          ? 'resourceSelection.range.shiftChooseEnd'
          : 'resourceSelection.range.shiftChooseStart'
        : '',
    ),
    hintKey: computed(() =>
      !selecting.value
        ? ''
        : wrongGroup.value
          ? 'resourceSelection.range.sameGroup'
          : anchor.value
            ? 'resourceSelection.range.chooseEnd'
            : 'resourceSelection.range.chooseStart',
    ),
    toggle,
    reset,
    activate,
    isAnchor,
    setInset: (value: number) => {
      inset.value = Math.max(0, value);
    },
  });
}
