<template>
  <section v-if="items.length" class="tag-match-strip" :aria-label="t('resourceCenter.tagMatches.title')">
    <div class="tag-match-strip__heading">
      <div>
        <strong>{{ t('resourceCenter.tagMatches.title') }}</strong>
        <span>{{ t('resourceCenter.tagMatches.hint') }}</span>
      </div>
      <span>{{ t('resourceCenter.tagMatches.count', { count: items.length }) }}</span>
    </div>

    <div class="tag-match-strip__list">
      <BButton
        v-for="item in items"
        :key="item.id"
        class="tag-match-card"
        :aria-label="t('resourceCenter.tagMatches.open', { name: item.name })"
        @click="emit('open', item)"
      >
        <span class="tag-match-card__icon" aria-hidden="true">
          <SvgIcon :src="item.iconUrl || icon.resource.tag" size="22" />
        </span>
        <span class="tag-match-card__body">
          <strong>{{ item.name }}</strong>
          <span class="tag-match-card__description">
            {{ item.description || t('resourceCenter.tagMatches.defaultDescription') }}
          </span>
          <span class="tag-match-card__counts">
            <span>{{ t('resourceCenter.tagMatches.resourceCount', { count: item.counts.total }) }}</span>
            <span v-if="item.counts.bookmark">{{ t('resourceCenter.types.bookmark') }} {{ item.counts.bookmark }}</span>
            <span v-if="item.counts.note">{{ t('resourceCenter.types.note') }} {{ item.counts.note }}</span>
            <span v-if="item.counts.file">{{ t('resourceCenter.types.file') }} {{ item.counts.file }}</span>
          </span>
        </span>
        <SvgIcon class="tag-match-card__arrow" :src="icon.arrow_right" size="15" aria-hidden="true" />
      </BButton>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import type { TagMatchItem } from '@/api/search.ts';

  defineProps<{ items: TagMatchItem[] }>();
  const emit = defineEmits<{ open: [item: TagMatchItem] }>();
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .tag-match-strip {
    display: grid;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-12, 12px) 0 var(--ui-space-14, 14px);
    border-bottom: 1px solid var(--surface-border-color);
  }

  .tag-match-strip__heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }

  .tag-match-strip__heading > div {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--ui-space-8, 8px);
  }

  .tag-match-strip__heading strong {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }

  .tag-match-strip__list {
    display: flex;
    gap: var(--ui-space-8, 8px);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
  }

  .tag-match-card {
    flex: 0 0 min(var(--ui-layout-360, 360px), calc(50% - var(--ui-space-8, 8px) / 2));
    width: min(var(--ui-layout-360, 360px), calc(50% - var(--ui-space-8, 8px) / 2));
    min-width: 0;
    height: auto;
    min-height: var(--ui-layout-76, 76px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
    color: var(--text-color);
    text-align: left;
    line-height: 1.35;
    scroll-snap-align: start;
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      transform 0.18s ease;
  }

  .tag-match-card:hover,
  .tag-match-card:focus-visible {
    border-color: var(--primary-color);
    background: var(--hover-background);
    transform: translateY(-1px);
  }

  .tag-match-card__icon {
    width: var(--ui-layout-40, 40px);
    height: var(--ui-layout-40, 40px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--surface-panel-bg);
    color: var(--resource-tag-color);
    overflow: hidden;
  }

  .tag-match-card__body {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-2, 2px);
  }

  .tag-match-card__body > strong,
  .tag-match-card__description {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-match-card__description,
  .tag-match-card__counts {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }

  .tag-match-card__counts {
    display: flex;
    gap: var(--ui-space-8, 8px);
    overflow: hidden;
    white-space: nowrap;
  }

  .tag-match-card__counts > span:first-child {
    color: var(--resource-tag-color);
    font-weight: 700;
  }

  .tag-match-card__arrow {
    color: var(--desc-color);
  }

  @media (max-width: 720px) {
    .tag-match-strip {
      padding: var(--ui-space-10, 10px) 0 var(--ui-space-12, 12px);
    }

    .tag-match-strip__heading > div > span {
      display: none;
    }

    .tag-match-strip__list {
      scrollbar-width: none;
    }

    .tag-match-strip__list::-webkit-scrollbar {
      display: none;
    }

    .tag-match-card {
      flex: 0 0 min(82vw, var(--ui-layout-320, 320px));
      width: min(82vw, var(--ui-layout-320, 320px));
      min-height: var(--ui-layout-72, 72px);
    }
  }
</style>
