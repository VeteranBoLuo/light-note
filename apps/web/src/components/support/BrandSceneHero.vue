<template>
  <header class="brand-scene" :class="[`brand-scene--${scene}`, { 'brand-scene--mobile': bookmark.isMobile }]">
    <picture class="brand-scene__art" aria-hidden="true"
      ><img
        :src="`/brand-scenes/${scene}${bookmark.isMobile ? '-mobile' : ''}.webp`"
        alt=""
        fetchpriority="high"
        decoding="async"
        width="2170"
        height="725"
    /></picture>
    <div class="brand-scene__inner">
      <p class="brand-scene__eyebrow"
        ><SvgIcon
          :src="scene === 'support' ? icon.support.heart : scene === 'store' ? icon.support.store : icon.support.autumn"
          size="15"
        />{{ eyebrow }}</p
      >
      <h1
        ><template v-for="(line, i) in title.split('\n')" :key="i"
          ><br v-if="i" /><span :class="{ 'brand-scene__accent': scene === 'store' && i > 0 }">{{
            line
          }}</span></template
        ></h1
      >
      <p class="brand-scene__description">{{ description }}</p>
      <div class="brand-scene__features"
        ><div v-for="feature in features" :key="feature.key" class="brand-scene__feature"
          ><span class="brand-scene__orb"><SvgIcon :src="feature.icon" size="22" /></span
          ><div
            ><strong>{{ t(`autumn.reference.${feature.key}`) }}</strong
            ><small>{{ t(`autumn.reference.${feature.key}Hint`) }}</small></div
          ></div
        ></div
      >
      <div v-if="$slots.default" class="brand-scene__actions"><slot /></div>
    </div>
  </header>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore } from '@/store';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import './commerceScene.less';
  const props = defineProps<{
    scene: 'support' | 'store' | 'campaign';
    title: string;
    description: string;
    eyebrow?: string;
  }>();
  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const features = computed(() =>
    props.scene === 'support'
      ? [
          { key: 'free', icon: icon.growth.reward },
          { key: 'privacy', icon: icon.settings.account },
          { key: 'separate', icon: icon.support.heart },
        ]
      : props.scene === 'store'
        ? [
            { key: 'permanent', icon: icon.growth.storage },
            { key: 'verified', icon: icon.growth.reward },
            { key: 'daily', icon: icon.growth.ai },
          ]
        : [
            { key: 'work', icon: icon.growth.ai },
            { key: 'storage', icon: icon.growth.storage },
            { key: 'independent', icon: icon.growth.reward },
            { key: 'creative', icon: icon.resource.note },
          ],
  );
</script>
<style scoped>
  .brand-scene {
    position: relative;
    isolation: isolate;
    min-height: 308px;
    padding: 18px 0 24px;
    box-sizing: border-box;
  }
  .brand-scene__art {
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
  }
  .brand-scene__art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }
  .brand-scene__art::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(0deg, var(--background-color), transparent 27%);
  }
  .brand-scene__inner {
    width: 74%;
    max-width: 1260px;
    margin: auto;
  }
  .brand-scene h1 {
    font:
      700 clamp(34px, 2.66vw, 46px)/1.24 'Songti SC',
      'STSong',
      serif;
    white-space: pre-line;
    letter-spacing: -0.04em;
    margin: 13px 0 10px;
    max-width: 720px;
  }
  .brand-scene__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    padding: 3px 11px;
    border: 1px solid var(--primary-color);
    border-radius: 18px;
    background: var(--hover-background);
    color: var(--primary-color);
    font-size: 12px;
  }
  .brand-scene__description {
    white-space: pre-line;
    max-width: 650px;
    font-size: 14px;
    line-height: 1.7;
    margin: 0;
  }
  .brand-scene__features {
    display: flex;
    gap: 10px;
    max-width: 720px;
    margin-top: 14px;
  }
  .brand-scene__feature {
    display: flex;
    align-items: center;
    gap: 9px;
    flex: 1;
    min-width: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    padding: 9px 11px;
    background: var(--card-background);
    background: color-mix(in srgb, var(--card-background) 87%, transparent);
  }
  .brand-scene__feature strong {
    display: block;
    font-size: 13px;
    line-height: 1.5;
  }
  .brand-scene__feature small {
    display: block;
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.5;
  }
  .brand-scene__orb {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--hover-background);
    color: var(--primary-color);
  }
  .brand-scene__actions {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 14px;
  }
  .brand-scene__accent {
    color: var(--primary-color);
  }
  .brand-scene--campaign {
    min-height: 358px;
  }
  .brand-scene--campaign h1 {
    font-size: clamp(40px, 3.6vw, 60px);
  }
  .brand-scene--campaign .brand-scene__inner {
    width: 74%;
  }
  html[data-theme='night'] .brand-scene__art img {
    filter: brightness(0.85) saturate(0.95);
  }
  .brand-scene--mobile {
    padding: 158px 18px 18px;
    min-height: 0;
  }
  .brand-scene--mobile .brand-scene__art {
    height: 177px;
  }
  .brand-scene--mobile .brand-scene__inner {
    width: 100%;
  }
  .brand-scene--mobile h1 {
    font-size: 30px;
  }
  .brand-scene--mobile .brand-scene__features {
    gap: 6px;
  }
  .brand-scene--mobile .brand-scene__feature {
    display: block;
    padding: 8px;
  }
  .brand-scene--mobile .brand-scene__feature small {
    display: none;
  }
  .brand-scene--mobile .brand-scene__orb {
    margin-bottom: 5px;
    width: 28px;
    height: 28px;
  }
  .brand-scene--mobile .brand-scene__feature strong {
    font-size: 12px;
  }
</style>
