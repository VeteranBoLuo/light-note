<template>
  <article class="publication-content">
    <header
      ><span class="publication-content__icon" :class="`is-${material.kind}`"
        ><SvgIcon :src="icon.resource[material.kind]" size="26" /></span
      ><div
        ><small>{{ t('publicResources.' + material.kind) }}</small
        ><h2>{{ material.title }}</h2></div
      ></header
    >
    <template v-if="material.kind === 'bookmark'"
      ><a :href="material.url" target="_blank" rel="noopener noreferrer" class="publication-content__url">{{
        material.url
      }}</a
      ><p class="publication-content__text">{{ material.description }}</p></template
    >
    <div v-else class="publication-content__text">{{ material.body }}</div>
  </article>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { PublicationMaterial } from '@lightnote/shared/public-resources';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  defineProps<{ material: PublicationMaterial }>();
  const { t } = useI18n();
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .publication-content {
    min-width: 0;
    color: var(--text-color);
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: .ui-space(12px) [];
    margin-bottom: .ui-space(20px) [];
  }
  header > div {
    min-width: 0;
  }
  h2 {
    font-size: .ui-font(20px) [];
    line-height: 1.5;
    margin: 0;
    overflow-wrap: anywhere;
  }
  small {
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .publication-content__icon {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: .ui-layout(48px) [];
    height: .ui-layout(48px) [];
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
    color: var(--resource-bookmark-color);
    background: var(--workspace-purple-selected);
  }
  .publication-content__icon.is-note {
    color: var(--workspace-note-text);
    background: var(--workspace-note-selected);
  }
  .publication-content__text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.85;
    font-size: .ui-font(15px) [];
  }
  .publication-content__url {
    display: block;
    color: var(--workspace-purple-text);
    overflow-wrap: anywhere;
    margin-bottom: .ui-space(16px) [];
  }
</style>
