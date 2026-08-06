<template>
  <component
    :is="rootTag"
    class="b-chip"
    :class="[
      `b-chip--${tone}`,
      `b-chip--${size}`,
      {
        'b-chip--interactive': interactive,
        'b-chip--selected': selected,
        'b-chip--disabled': disabled,
      },
    ]"
    :type="interactive ? 'button' : undefined"
    :disabled="interactive ? disabled : undefined"
    :aria-disabled="disabled || undefined"
    :aria-pressed="interactive && selected ? true : undefined"
    :style="chipStyle"
  >
    <span class="b-chip__content"><slot /></span>
  </component>
</template>

<script setup lang="ts">
  import { computed, type CSSProperties } from 'vue';

  type ChipTone =
    | 'tag'
    | 'pin'
    | 'pending'
    | 'neutral'
    | 'success'
    | 'danger'
    | 'bookmark'
    | 'note'
    | 'file';

  const props = withDefaults(
    defineProps<{
      tone: ChipTone;
      size?: 'small' | 'medium';
      interactive?: boolean;
      selected?: boolean;
      disabled?: boolean;
      maxWidth?: string;
    }>(),
    {
      size: 'small',
      interactive: false,
      selected: false,
      disabled: false,
      maxWidth: undefined,
    },
  );

  const rootTag = computed(() => (props.interactive ? 'button' : 'span'));
  const chipStyle = computed<CSSProperties | undefined>(() =>
    props.maxWidth ? { maxWidth: props.maxWidth } : undefined,
  );
</script>

<style scoped lang="less">
  .b-chip {
    --b-chip-fg: var(--chip-neutral-fg);
    --b-chip-bg: var(--chip-neutral-bg);
    --b-chip-border: var(--chip-neutral-border);

    appearance: none;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--b-chip-border);
    border-radius: 999px;
    color: var(--b-chip-fg);
    background: var(--b-chip-bg);
    font-family: inherit;
    font-weight: 600;
    letter-spacing: 0;
    text-align: center;
    text-decoration: none;
    white-space: nowrap;
    user-select: none;
    vertical-align: middle;
    transition:
      color 0.16s ease,
      background-color 0.16s ease,
      border-color 0.16s ease;
  }

  .b-chip--small {
    min-height: 20px;
    padding: 2px 7px;
    font-size: 11px;
    line-height: 16px;
  }

  .b-chip--medium {
    min-height: 22px;
    padding: 3px 9px;
    font-size: 12px;
    line-height: 16px;
  }

  .b-chip__content {
    display: inline-flex;
    min-width: 0;
    max-width: 100%;
    align-items: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .b-chip--tag {
    --b-chip-fg: var(--chip-tag-fg);
    --b-chip-bg: var(--chip-tag-bg);
    --b-chip-border: var(--chip-tag-border);
  }

  .b-chip--pin {
    --b-chip-fg: var(--chip-pin-fg);
    --b-chip-bg: var(--chip-pin-bg);
    --b-chip-border: var(--chip-pin-border);
  }

  .b-chip--pending {
    --b-chip-fg: var(--chip-pending-fg);
    --b-chip-bg: var(--chip-pending-bg);
    --b-chip-border: var(--chip-pending-border);
  }

  .b-chip--neutral {
    --b-chip-fg: var(--chip-neutral-fg);
    --b-chip-bg: var(--chip-neutral-bg);
    --b-chip-border: var(--chip-neutral-border);
  }

  .b-chip--success {
    --b-chip-fg: var(--chip-success-fg);
    --b-chip-bg: var(--chip-success-bg);
    --b-chip-border: var(--chip-success-border);
  }

  .b-chip--danger {
    --b-chip-fg: var(--chip-danger-fg);
    --b-chip-bg: var(--chip-danger-bg);
    --b-chip-border: var(--chip-danger-border);
  }

  .b-chip--bookmark {
    --b-chip-fg: var(--chip-bookmark-fg);
    --b-chip-bg: var(--chip-bookmark-bg);
    --b-chip-border: var(--chip-bookmark-border);
  }

  .b-chip--note {
    --b-chip-fg: var(--chip-note-fg);
    --b-chip-bg: var(--chip-note-bg);
    --b-chip-border: var(--chip-note-border);
  }

  .b-chip--file {
    --b-chip-fg: var(--chip-file-fg);
    --b-chip-bg: var(--chip-file-bg);
    --b-chip-border: var(--chip-file-border);
  }

  .b-chip--interactive {
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--focus-ring-color, var(--primary-color));
      outline-offset: 2px;
    }
  }

  .b-chip--selected {
    border-color: var(--b-chip-fg);
    font-weight: 700;
  }

  .b-chip--tag.b-chip--selected {
    --b-chip-fg: var(--chip-tag-hover-fg);
    --b-chip-bg: var(--chip-tag-hover-bg);
  }

  .b-chip--disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  @media (hover: hover) and (pointer: fine) {
    .b-chip--tag.b-chip--interactive:not(.b-chip--disabled):hover {
      --b-chip-fg: var(--chip-tag-hover-fg);
      --b-chip-bg: var(--chip-tag-hover-bg);
      --b-chip-border: var(--chip-tag-fg);
    }

    .b-chip--interactive:not(.b-chip--tag, .b-chip--disabled):hover {
      border-color: var(--b-chip-fg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .b-chip {
      transition: none;
    }
  }
</style>
