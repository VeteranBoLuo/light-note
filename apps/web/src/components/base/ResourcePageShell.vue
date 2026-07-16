<template>
  <section
    class="resource-page-shell"
    :class="[`resource-page-shell--${accent}`, { 'resource-page-shell--with-back': showBack }]"
  >
    <header class="resource-page-header">
      <BButton
        v-if="showBack"
        class="resource-page-back"
        :aria-label="$t('common.back')"
        :title="$t('common.back')"
        @click="emit('back')"
      >
        <SvgIcon :src="icon.noteDetail.back" size="20" />
      </BButton>

      <div class="resource-page-heading">
        <div class="resource-page-title-row">
          <span class="resource-page-accent" aria-hidden="true"></span>
          <h1>
            <BButton
              v-if="titleActionable"
              class="resource-page-title-action"
              role="button"
              tabindex="0"
              @click="emit('titleClick')"
              @keydown.enter="emit('titleClick')"
              @keydown.space.prevent="emit('titleClick')"
            >
              {{ title }}
            </BButton>
            <template v-else>{{ title }}</template>
          </h1>
          <slot name="meta" />
        </div>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>

      <div v-if="slots.actions" class="resource-page-actions">
        <slot name="actions" />
      </div>
    </header>

    <div class="resource-page-body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
  import { useSlots } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  withDefaults(
    defineProps<{
      title: string;
      subtitle?: string;
      accent?: 'bookmark' | 'note' | 'file' | 'tag' | 'neutral';
      showBack?: boolean;
      titleActionable?: boolean;
    }>(),
    {
      subtitle: '',
      accent: 'bookmark',
      showBack: false,
      titleActionable: false,
    },
  );

  const emit = defineEmits<{
    back: [];
    titleClick: [];
  }>();
  const slots = useSlots();
</script>

<style scoped lang="less">
  .resource-page-shell {
    --resource-page-accent: var(--primary-color);
    width: 100%;
    height: 100%;
    padding: 18px clamp(16px, 2vw, 28px) 24px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .resource-page-shell--bookmark {
    --resource-page-accent: var(--resource-bookmark-color, #615ced);
  }

  .resource-page-shell--note {
    --resource-page-accent: var(--resource-note-color, #00a884);
  }

  .resource-page-shell--file {
    --resource-page-accent: var(--resource-file-color, #ff8a00);
  }

  .resource-page-shell--tag {
    --resource-page-accent: var(--resource-tag-color, #ec4899);
  }

  .resource-page-shell--neutral {
    --resource-page-accent: var(--desc-color);
  }

  .resource-page-header {
    width: min(100%, 1540px);
    min-height: 54px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
  }

  .resource-page-back {
    display: flex;
    width: 36px;
    min-width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--text-color);
    background: transparent !important;
    transition:
      color 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease;

    &:hover,
    &:focus-visible {
      color: var(--resource-page-accent);
      border-color: color-mix(in srgb, var(--resource-page-accent) 22%, var(--surface-border-color));
      background: color-mix(in srgb, var(--resource-page-accent) 7%, transparent) !important;
      outline: none;
    }
  }

  .resource-page-shell--with-back .resource-page-accent {
    display: none;
  }

  .resource-page-shell--with-back .resource-page-heading p {
    margin-left: 0;
  }

  .resource-page-heading {
    min-width: 0;
    flex: 1;
  }

  .resource-page-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .resource-page-accent {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--resource-page-accent);
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--resource-page-accent) 10%, transparent);
  }

  h1 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: clamp(22px, 2vw, 28px);
    font-weight: 750;
    line-height: 1.2;
    letter-spacing: -0.025em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-page-title-action {
    max-width: 100%;
    height: auto;
    padding: 0;
    overflow: hidden;
    border-radius: 5px;
    color: inherit;
    background: transparent !important;
    font: inherit;
    line-height: inherit;
    letter-spacing: inherit;
    text-overflow: ellipsis;
    transition: color 0.18s ease;

    &:hover,
    &:focus-visible {
      color: var(--resource-page-accent);
      background: transparent !important;
      outline: none;
    }

    &:focus-visible {
      text-decoration: underline;
      text-underline-offset: 4px;
    }
  }

  p {
    margin: 5px 0 0 17px;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-page-actions {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  .resource-page-body {
    width: min(100%, 1540px);
    min-height: 0;
    margin: 0 auto;
    flex: 1;
  }

  @media (max-width: 767px) {
    .resource-page-shell {
      padding: 12px 12px max(14px, env(safe-area-inset-bottom));
      gap: 10px;
    }

    .resource-page-header {
      min-height: 40px;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .resource-page-back {
      width: 40px;
      min-width: 40px;
      height: 40px;
      border-radius: 10px;
      background: transparent;

      &:hover,
      &:active {
        color: var(--resource-page-accent);
        background: color-mix(in srgb, var(--resource-page-accent) 8%, transparent);
      }
    }

    .resource-page-title-row {
      min-height: 40px;
    }

    .resource-page-accent {
      display: none;
    }

    h1 {
      font-size: 20px;
      font-weight: 720;
    }

    p {
      display: none;
    }

    .resource-page-actions {
      width: 100%;
      order: 3;
      justify-content: flex-start;
      flex-wrap: nowrap;
      overflow: visible;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .resource-page-shell * {
      scroll-behavior: auto !important;
    }
  }
</style>
