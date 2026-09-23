<template>
  <section
    v-if="visible"
    class="resource-backlinks"
    :class="[`resource-backlinks--${placement}`, { 'resource-backlinks--compact': compact }]"
  >
    <BPopover
      v-if="headerPopover"
      v-model:open="expanded"
      trigger="click"
      placement="bottom-right"
      overlay-class-name="resource-backlinks-popover"
    >
      <BButton class="resource-backlinks__trigger" :aria-expanded="expanded" :title="t('note.resourceBacklinks.title')">
        <span class="resource-backlinks__title">{{
          t(compact ? 'note.resourceBacklinks.compactTitle' : 'note.resourceBacklinks.title')
        }}</span>
        <span class="resource-backlinks__count">{{ items.length }}{{ hasMore ? '+' : '' }}</span>
      </BButton>
      <template #content>
        <ResourceBacklinkContent
          :groups="groups"
          :compact="compact"
          :loading="loading"
          :has-more="hasMore"
          @open-source="openSource"
          @show-more="showMore"
        />
      </template>
    </BPopover>

    <template v-else>
      <BButton class="resource-backlinks__trigger" :aria-expanded="expanded" @click="expanded = !expanded">
        <span class="resource-backlinks__title">{{ t('note.resourceBacklinks.title') }}</span>
        <span class="resource-backlinks__count">{{ items.length }}{{ hasMore ? '+' : '' }}</span>
      </BButton>
      <ResourceBacklinkContent
        v-if="expanded"
        :groups="groups"
        :compact="compact"
        :loading="loading"
        :has-more="hasMore"
        @open-source="openSource"
        @show-more="showMore"
      />
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import ResourceBacklinkContent from '@/components/noteLibrary/detail/ResourceBacklinkContent.vue';
  import { fetchResourceBacklinks, type ResourceBacklinkItem } from '@/api/noteReferences';
  import { resolveAiSourceNavigation } from '@/utils/aiSourceNavigation';
  import type { ResourceRefType } from '@/utils/noteResourceRefs';

  const props = withDefaults(
    defineProps<{
      targetType: ResourceRefType;
      targetId: string;
      placement?: 'panel' | 'inline' | 'header';
      compact?: boolean;
    }>(),
    { placement: 'panel', compact: false },
  );

  const { t } = useI18n();
  const router = useRouter();
  const loading = ref(false);
  const initialized = ref(false);
  const available = ref(false);
  const expanded = ref(false);
  const items = ref<ResourceBacklinkItem[]>([]);
  const hasMore = ref(false);
  const hasMoreByType = ref<Record<ResourceBacklinkItem['sourceType'], boolean>>({ note: false, todo: false });
  const currentLimit = ref(5);
  let requestVersion = 0;

  const visible = computed(() => initialized.value && available.value && items.value.length > 0);
  // Placement chooses the container; compact only changes the content presentation.
  const headerPopover = computed(() => props.placement === 'header');
  const groups = computed(() =>
    (['note', 'todo'] as const)
      .map((type) => ({
        type,
        items: items.value.filter((item) => item.sourceType === type),
        hasMore: hasMoreByType.value[type],
      }))
      .filter((group) => group.items.length > 0),
  );

  async function load(limit = 5) {
    const request = ++requestVersion;
    loading.value = true;
    try {
      const result = await fetchResourceBacklinks(props.targetType, props.targetId, limit);
      if (request !== requestVersion) return;
      available.value = result.available;
      items.value = result.items;
      hasMore.value = result.hasMore;
      hasMoreByType.value = result.hasMoreByType;
      currentLimit.value = limit;
    } catch {
      if (request !== requestVersion) return;
      available.value = false;
      items.value = [];
      hasMore.value = false;
      hasMoreByType.value = { note: false, todo: false };
    } finally {
      if (request === requestVersion) {
        initialized.value = true;
        loading.value = false;
      }
    }
  }

  function showMore() {
    if (loading.value || !hasMore.value) return;
    void load(Math.min(currentLimit.value + 15, 50));
  }

  function openSource(item: ResourceBacklinkItem) {
    const focusRef = `${props.targetType}:${props.targetId}`;
    if (item.sourceType === 'todo') {
      void router.push({ path: '/inbox', query: { tab: 'todo', todoId: item.id, focusRef } });
      return;
    }
    const navigation = resolveAiSourceNavigation({ type: 'note', id: item.id, title: '', target: 'note-detail' });
    if (navigation.kind === 'internal') {
      void router.push({ path: navigation.target, query: { focusRef } });
    }
  }

  watch(
    [() => props.targetType, () => props.targetId],
    () => {
      initialized.value = false;
      available.value = false;
      expanded.value = false;
      items.value = [];
      hasMore.value = false;
      hasMoreByType.value = { note: false, todo: false };
      currentLimit.value = 5;
      void load(5);
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .resource-backlinks {
    margin: var(--ui-space-8, 8px) var(--ui-space-12, 12px) var(--ui-space-12, 12px);
    border: 1px solid color-mix(in srgb, var(--primary-color) 16%, var(--surface-border-color));
    border-radius: 12px;
    background: var(--card-background);
    overflow: hidden;
  }

  .resource-backlinks--inline {
    margin: 0;
    border-width: 0 0 1px;
    border-radius: 0;
    background: color-mix(in srgb, var(--primary-color) 2%, var(--background-color));
  }

  .resource-backlinks--header {
    position: relative;
    flex: 0 0 auto;
    margin: 0;
    border: 0;
    border-radius: 8px;
    overflow: visible;
    background: transparent;

    :deep(.resource-backlinks__trigger.b_btn.default_btn) {
      width: auto;
      min-height: var(--ui-control-28, 28px);
      padding: var(--ui-space-4, 4px) var(--ui-space-8, 8px);
      border-radius: 8px;
      background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
      color: var(--primary-color);
      font-size: var(--ui-font-12, 12px);
      line-height: 1.2;

      &:hover {
        background: color-mix(in srgb, var(--primary-color) 13%, var(--card-background));
      }
    }

    .resource-backlinks__title {
      font-weight: 600;
    }
  }

  .resource-backlinks__trigger {
    width: 100%;
    min-height: var(--ui-control-40, 40px);
    height: auto;
    padding: var(--ui-space-7, 7px) var(--ui-space-12, 12px);
    box-shadow: none;
    transition:
      background-color 0.2s,
      color 0.2s;
  }

  :deep(.resource-backlinks__trigger.b_btn.default_btn) {
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
    color: var(--text-color);
    border-radius: 0;
    background: color-mix(in srgb, var(--primary-color) 4%, var(--card-background));
    font-size: var(--ui-font-13, 13px);
    text-align: left;

    &:hover {
      background: color-mix(in srgb, var(--primary-color) 9%, var(--card-background));
    }
  }

  .resource-backlinks--inline :deep(.resource-backlinks__trigger.b_btn.default_btn) {
    background: transparent;

    &:hover {
      background: color-mix(in srgb, var(--primary-color) 7%, var(--background-color));
    }
  }

  .resource-backlinks__title {
    font-weight: 650;
  }

  .resource-backlinks__count {
    flex: 0 0 auto;
    color: var(--primary-color);
    font-size: var(--ui-font-12, 12px);
    font-variant-numeric: tabular-nums;
  }

  .resource-backlinks--compact {
    :deep(.resource-backlinks__trigger.b_btn.default_btn) {
      min-height: var(--ui-control-32, 32px);
      padding: var(--ui-space-4, 4px) var(--ui-space-9, 9px);
      font-size: var(--ui-font-12, 12px);
      line-height: 1.2;
    }
  }

  :global(html .b-popover-panel.resource-backlinks-popover) {
    z-index: 930;
    /* ui-density-fixed: viewport edge clearance stays in viewport pixels. */
    width: min(var(--ui-layout-320, 320px), calc(100vw - 20px));
    overflow: hidden;
    border-color: var(--surface-border-color);
    border-radius: 10px;
    box-shadow: 0 4px 12px -6px var(--message-shadow-color);
  }

  @media (max-width: 767px) {
    .resource-backlinks {
      margin: 8px 8px 10px;
    }

    .resource-backlinks--inline,
    .resource-backlinks--header {
      margin: 0;
    }

    .resource-backlinks__trigger {
      min-height: 44px;
    }

    .resource-backlinks--compact :deep(.resource-backlinks__trigger.b_btn.default_btn) {
      min-height: 44px;
    }
  }
</style>
