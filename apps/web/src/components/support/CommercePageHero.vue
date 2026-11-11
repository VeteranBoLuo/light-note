<template>
  <BCard
    as="section"
    class="commerce-hero"
    :class="{ 'is-mobile': bookmark.isMobile, 'is-tablet': bookmark.isTablet }"
    padding="0"
    radius="14px"
  >
    <div class="commerce-hero__copy">
      <h2
        >{{ title }}<em>{{ accent }}</em></h2
      >
      <p>{{ description }}</p>
      <div v-if="features?.length" class="commerce-hero__features">
        <span v-for="feature in features" :key="feature.label">
          <SvgIcon :src="feature.icon" size="15" color="var(--workspace-purple-text)" aria-hidden="true" />{{
            feature.label
          }}
        </span>
      </div>
    </div>
    <div v-if="!bookmark.isMobile" class="commerce-hero__art" aria-hidden="true">
      <img :src="publicArtworkUrl('/brand-scenes/cloud-object.webp')" alt="" decoding="async" />
    </div>
  </BCard>
</template>

<script setup lang="ts">
  import { bookmarkStore } from '@/store';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { publicArtworkUrl } from '@/utils/publicArtwork';

  defineProps<{
    title: string;
    accent: string;
    description: string;
    features?: Array<{ icon: string; label: string }>;
  }>();
  const bookmark = bookmarkStore();
</script>

<style scoped lang="less">
  .commerce-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--ui-layout-330, 330px);
    align-items: center;
    gap: var(--ui-space-32, 32px);
    overflow: hidden;
    margin-bottom: var(--ui-space-26, 26px);
  }
  .commerce-hero__copy {
    padding: var(--ui-space-25, 25px) 0 var(--ui-space-25, 25px) var(--ui-space-28, 28px);
    min-width: 0;
  }
  h2 {
    margin: 0 0 var(--ui-space-9, 9px);
    font-size: var(--ui-font-29, 29px);
    font-weight: 600;
    line-height: 1.45;
  }
  em {
    color: var(--workspace-purple-text);
    font-style: normal;
  }
  p {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.8;
    white-space: pre-line;
  }
  .commerce-hero__features {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px) var(--ui-space-22, 22px);
    margin-top: var(--ui-space-17, 17px);
    font-size: var(--ui-font-12, 12px);
  }
  .commerce-hero__features > span {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
  }
  .commerce-hero__art {
    position: relative;
    align-self: stretch;
    min-height: var(--ui-layout-168, 168px);
    overflow: hidden;
  }
  .commerce-hero__art img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: right center;
  }
  .commerce-hero__art::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, var(--card-background), transparent 24%);
  }
  html[data-theme='night'] .commerce-hero__art img {
    filter: brightness(0.72) saturate(0.7);
  }
  .is-tablet {
    grid-template-columns: minmax(0, 1fr) var(--ui-layout-260, 260px);
  }
  .is-tablet h2 {
    font-size: var(--ui-font-25, 25px);
  }
  .is-mobile.commerce-hero {
    display: block;
    margin-bottom: var(--ui-space-21, 21px);
  }
  .is-mobile .commerce-hero__copy {
    padding: var(--ui-space-18, 18px) var(--ui-space-17, 17px);
  }
  .is-mobile h2 {
    font-size: var(--ui-font-21, 21px);
    line-height: 1.55;
  }
  .is-mobile p {
    font-size: var(--ui-font-12, 12px);
  }
  .is-mobile .commerce-hero__features {
    gap: var(--ui-space-10, 10px) var(--ui-space-16, 16px);
    margin-top: var(--ui-space-12, 12px);
    font-size: var(--ui-font-11, 11px);
  }
  .is-mobile .commerce-hero__features > span:last-child {
    display: none;
  }
</style>
