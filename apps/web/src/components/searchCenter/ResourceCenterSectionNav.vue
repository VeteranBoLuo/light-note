<template>
  <div class="resource-center-section-bar" role="tablist" :aria-label="t('resourceCenter.title')">
    <div class="resource-center-section-nav">
      <BButton
        class="section-nav-item"
        :class="{ active: activeSection === 'resources' }"
        role="tab"
        :aria-selected="activeSection === 'resources'"
        @click="goTo('resources')"
      >
        {{ t('resourceCenter.sections.resources') }}
      </BButton>
      <BButton
        class="section-nav-item"
        :class="{ active: activeSection === 'organize' }"
        role="tab"
        :aria-selected="activeSection === 'organize'"
        @click="goTo('organize')"
      >
        <SvgIcon class="section-nav-item__icon" :src="icon.ai.organize" size="15" aria-hidden="true" />
        {{ t('resourceCenter.sections.organize') }}
        <BChip
          class="organize-attention-badge"
          :class="{ 'is-hidden': !attentionBadgeVisible }"
          tone="neutral"
          size="small"
          :role="attentionBadgeVisible ? 'status' : undefined"
          :aria-hidden="attentionBadgeVisible ? undefined : 'true'"
          :aria-label="attentionBadgeVisible ? attentionBadgeLabel : undefined"
        >
          {{ attentionBadgeVisible ? attentionBadgeText : '' }}
        </BChip>
      </BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { recordOperation } from '@/api/commonApi';
  import icon from '@/config/icon';
  import { organizeStore, useUserStore } from '@/store';

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const organizer = organizeStore();
  const user = useUserStore();
  const organizeOwnerKey = computed(() =>
    [user.id || 'visitor', user.role || '', user.adminContext?.subjectUserId || '', user.adminContext?.mode || ''].join(
      '|',
    ),
  );
  const attentionBadgeVisible = computed(() => Number(organizer.attentionCount) > 0);
  const attentionBadgeText = computed(() =>
    Number(organizer.attentionCount) > 99 ? '99+' : String(Math.max(0, Number(organizer.attentionCount) || 0)),
  );
  const attentionBadgeLabel = computed(() =>
    t('organize.attentionSummary', { count: Number(organizer.attentionCount) || 0 }),
  );

  const activeSection = computed(() => {
    if (route.path.startsWith('/organize')) return 'organize';
    return 'resources';
  });

  function goTo(section: 'resources' | 'organize') {
    const target = section === 'organize' ? '/organize' : '/search';
    if (router.resolve(target).fullPath === route.fullPath) return;
    recordOperation({
      module: '资源中心',
      operation: section === 'organize' ? '切换整理中心视图' : '切换查找视图',
    });
    // 同级分区切换不产生历史记录，否则返回键要按很多次才能离开资源中心
    router.replace(target);
  }

  watch(
    organizeOwnerKey,
    (ownerKey) => {
      organizer.resetForOwner(ownerKey);
      void organizer.loadSummary({ silent: Boolean(organizer.summary) });
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .resource-center-section-bar {
    min-width: 0;
    flex: 0 0 auto;
    margin-left: 12px;
    height: 32px;
    display: inline-flex;
    align-items: stretch;
    gap: 4px;
    padding: 2px;
    border-radius: 12px;
    background: var(--workspace-panel-bg-color, var(--hover-background));
    box-sizing: border-box;
  }

  .resource-center-section-nav {
    display: contents;
  }

  .section-nav-item {
    position: relative;
    height: 28px;
    padding: 0 12px;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: var(--desc-color);
    transition:
      color 0.16s ease,
      background-color 0.16s ease,
      border-color 0.16s ease,
      box-shadow 0.16s ease;
  }

  :deep(.organize-attention-badge.b-chip--neutral.b-chip--small) {
    --b-chip-fg: var(--primary-color);
    --b-chip-bg: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
    --b-chip-border: transparent;

    min-width: 20px;
    height: 18px;
    min-height: 18px;
    padding: 0 5px;
    border: 0;
    font-size: 10px;
    line-height: 16px;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  :deep(.organize-attention-badge.is-hidden) {
    visibility: hidden;
  }

  .section-nav-item:not(.active):hover {
    color: var(--text-color);
    background: var(--mobile-selected-bg, var(--hover-background));
  }

  .section-nav-item.active {
    border-color: var(--surface-border-color, var(--card-border-color));
    background: var(--card-background, var(--background-color));
    color: var(--primary-color);
    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08);
    font-weight: 650;
  }

  .section-nav-item:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 1px;
  }

  @media (max-width: 767px) {
    .resource-center-section-bar {
      width: 100%;
      height: 52px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
      padding: 4px;
      border-radius: 12px;
      background: var(--workspace-panel-bg-color);
    }

    .resource-center-section-nav {
      display: contents;
    }

    .section-nav-item {
      width: 100%;
      min-width: 0;
      height: var(--mobile-touch-size, 44px);
      padding-inline: 8px;
      border: 1px solid transparent;
      background: transparent !important;
      box-shadow: none;
    }

    .section-nav-item__icon {
      display: none;
    }

    .section-nav-item.active {
      border-color: var(--surface-border-color, var(--card-border-color));
      color: var(--primary-color);
      background: var(--card-background) !important;
      font-weight: 650;
      box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08);
    }
  }
</style>
