<template>
  <section v-if="visible" class="resource-backlinks" :class="`resource-backlinks--${placement}`">
    <BButton class="resource-backlinks__trigger" :aria-expanded="expanded" @click="expanded = !expanded">
      <span class="resource-backlinks__title">{{ t('note.resourceBacklinks.title') }}</span>
      <span class="resource-backlinks__count">{{ items.length }}{{ hasMore ? '+' : '' }}</span>
    </BButton>

    <div v-if="expanded" class="resource-backlinks__content">
      <BButton v-for="item in items" :key="item.id" class="resource-backlinks__item" @click="openSourceNote(item.id)">
        <span class="resource-backlinks__item-copy">
          <strong>{{ item.title || t('note.resourceBacklinks.untitled') }}</strong>
          <small v-if="item.updateTime">{{
            t('note.resourceBacklinks.updatedAt', { time: formatTime(item.updateTime) })
          }}</small>
        </span>
      </BButton>
      <BButton v-if="hasMore" class="resource-backlinks__more" :loading="loading" :disabled="loading" @click="showMore">
        {{ t('note.resourceBacklinks.showMore') }}
      </BButton>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { fetchResourceBacklinks, type ResourceBacklinkItem } from '@/api/noteReferences';
  import { resolveAiSourceNavigation } from '@/components/aiAssistant/aiSourceNavigation';
  import type { ResourceRefType } from '@/utils/noteResourceRefs';

  const props = withDefaults(
    defineProps<{
      targetType: ResourceRefType;
      targetId: string;
      placement?: 'panel' | 'inline' | 'header';
    }>(),
    { placement: 'panel' },
  );

  const { t, locale } = useI18n();
  const router = useRouter();
  const loading = ref(false);
  const initialized = ref(false);
  const available = ref(false);
  const expanded = ref(false);
  const items = ref<ResourceBacklinkItem[]>([]);
  const hasMore = ref(false);
  const currentLimit = ref(5);
  let requestVersion = 0;

  const visible = computed(() => initialized.value && available.value && items.value.length > 0);

  function formatTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale.value, { month: 'numeric', day: 'numeric' }).format(date);
  }

  async function load(limit = 5) {
    const request = ++requestVersion;
    loading.value = true;
    try {
      const result = await fetchResourceBacklinks(props.targetType, props.targetId, limit);
      if (request !== requestVersion) return;
      available.value = result.available;
      items.value = result.items;
      hasMore.value = result.hasMore;
      currentLimit.value = limit;
    } catch {
      if (request !== requestVersion) return;
      available.value = false;
      items.value = [];
      hasMore.value = false;
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

  function openSourceNote(id: string) {
    const navigation = resolveAiSourceNavigation({ type: 'note', id, title: '', target: 'note-detail' });
    if (navigation.kind !== 'internal') return;
    void router.push(navigation.target);
  }

  watch(
    [() => props.targetType, () => props.targetId],
    () => {
      initialized.value = false;
      available.value = false;
      expanded.value = false;
      items.value = [];
      hasMore.value = false;
      currentLimit.value = 5;
      void load(5);
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .resource-backlinks {
    margin: 8px 12px 12px;
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
      min-height: 28px;
      padding: 4px 8px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
      color: var(--primary-color);
      font-size: 12px;
      line-height: 1.2;

      &:hover {
        background: color-mix(in srgb, var(--primary-color) 13%, var(--card-background));
      }
    }

    .resource-backlinks__title {
      font-weight: 600;
    }

    .resource-backlinks__content {
      position: absolute;
      z-index: 20;
      top: calc(100% + 7px);
      left: 0;
      width: min(320px, calc(100vw - 40px));
      border: 1px solid var(--surface-border-color);
      border-radius: 10px;
      box-shadow: var(--surface-raised-shadow, 0 10px 28px rgba(0, 0, 0, 0.12));
    }
  }

  .resource-backlinks__trigger,
  .resource-backlinks__item,
  .resource-backlinks__more {
    width: 100%;
    min-height: 40px;
    height: auto;
    padding: 7px 12px;
    box-shadow: none;
    transition:
      background-color 0.2s,
      color 0.2s;
  }

  :deep(.resource-backlinks__trigger.b_btn.default_btn) {
    justify-content: space-between;
    gap: 10px;
    color: var(--text-color);
    border-radius: 0;
    background: color-mix(in srgb, var(--primary-color) 4%, var(--card-background));
    font-size: 13px;
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
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .resource-backlinks__content {
    display: grid;
    gap: 3px;
    padding: 5px;
    border-top: 1px solid color-mix(in srgb, var(--surface-border-color) 76%, transparent);
    background: color-mix(in srgb, var(--primary-color) 2%, var(--card-background));
  }

  :deep(.resource-backlinks__item.b_btn.default_btn) {
    justify-content: flex-start;
    border-radius: 7px;
    background: transparent;
    text-align: left;
    white-space: normal;

    &:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
    }
  }

  .resource-backlinks__item-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .resource-backlinks__item-copy strong,
  .resource-backlinks__item-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-backlinks__item-copy strong {
    color: var(--text-color);
    font-weight: 550;
  }

  .resource-backlinks__item-copy small {
    color: var(--desc-color);
    font-size: 12px;
  }

  :deep(.resource-backlinks__more.b_btn.default_btn) {
    justify-self: start;
    width: auto;
    min-height: 40px;
    border-radius: 6px;
    color: var(--primary-color);
    background: transparent;
    font-size: 12px;

    &:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
    }
  }

  @media (max-width: 767px) {
    .resource-backlinks {
      margin: 8px 8px 10px;
    }

    .resource-backlinks--inline {
      margin: 0;
    }

    .resource-backlinks__trigger,
    .resource-backlinks__item,
    .resource-backlinks__more {
      min-height: 44px;
    }
  }
</style>
