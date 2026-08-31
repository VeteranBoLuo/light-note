<template>
  <BDrawer
    :open="open"
    placement="bottom"
    mobile-centered-header
    show-handle
    height="min(78dvh, 680px)"
    body-padding="0"
    :title="t('tagSpace.switchTag')"
    :close-label="t('common.close')"
    @close="emit('update:open', false)"
  >
    <div class="mobile-tag-directory">
      <div class="mobile-tag-directory__toolbar">
        <div class="mobile-tag-directory__summary">
          <span>{{ t('tagSpace.allTags') }}</span>
          <strong>{{ total }}</strong>
        </div>
        <BInput v-model:value="keyword" clearable height="42px" :placeholder="t('tagSpace.searchPlaceholder')">
          <template #prefix>
            <SvgIcon :src="icon.navigation.search" size="17" aria-hidden="true" />
          </template>
        </BInput>
      </div>

      <div v-if="error && tags.length" class="mobile-tag-directory__inline-error" role="alert">
        <span>{{ t('tagSpace.staleError') }}</span>
        <BButton size="small" @click="emit('retry')">{{ t('common.retry') }}</BButton>
      </div>

      <div
        v-if="loading && !tags.length"
        class="mobile-tag-directory__skeleton"
        :aria-label="t('common.loading')"
        aria-busy="true"
      >
        <span v-for="index in 8" :key="index" class="mobile-tag-directory__skeleton-row">
          <i></i>
          <b></b>
          <small></small>
        </span>
      </div>

      <div v-else-if="error && !tags.length" class="mobile-tag-directory__state" role="alert">
        <span class="mobile-tag-directory__state-icon">!</span>
        <strong>{{ t('tagSpace.loadFailedTitle') }}</strong>
        <p>{{ t('tagSpace.loadFailedDesc') }}</p>
        <BButton type="primary" @click="emit('retry')">{{ t('common.retry') }}</BButton>
      </div>

      <div v-else-if="!filteredTags.length" class="mobile-tag-directory__state">
        <span class="mobile-tag-directory__state-icon">#</span>
        <strong>{{ keyword.trim() ? t('tagSpace.noMatchTitle') : t('tagSpace.emptyTitle') }}</strong>
        <p>{{ keyword.trim() ? t('tagSpace.switcherNoMatchDesc') : t('tagSpace.emptyDesc') }}</p>
        <BButton v-if="keyword.trim()" @click="keyword = ''">{{ t('tagSpace.clearSearch') }}</BButton>
        <BButton v-else-if="!readOnly" type="primary" @click="createTag">{{ t('tagSpace.createTag') }}</BButton>
      </div>

      <div v-else v-auto-scrollbar class="mobile-tag-directory__list" :aria-busy="loading">
        <BButton
          v-for="tagItem in filteredTags"
          :key="tagItem.id"
          class="mobile-tag-directory__row"
          :class="{ 'is-active': activeTagId === String(tagItem.id) }"
          :aria-current="activeTagId === String(tagItem.id) ? 'page' : undefined"
          :disabled="Boolean(switchingTagId)"
          :aria-label="
            t('tagSpace.openSpaceBreakdownAria', {
              name: tagItem.name,
              total: tagItem.counts.total,
              bookmark: tagItem.counts.bookmark,
              note: tagItem.counts.note,
              file: tagItem.counts.file,
            })
          "
          @click="selectTag(String(tagItem.id))"
        >
          <span class="mobile-tag-directory__row-icon" aria-hidden="true">
            <SvgIcon :src="tagItem.iconUrl || icon.resource.tag" size="19" />
          </span>
          <span class="mobile-tag-directory__row-copy">
            <span class="mobile-tag-directory__row-title">
              <strong>{{ tagItem.name }}</strong>
              <small v-if="activeTagId === String(tagItem.id)">{{ t('tagSpace.currentTag') }}</small>
            </span>
            <span class="mobile-tag-directory__metrics" aria-hidden="true">
              <span
                class="mobile-tag-directory__metric mobile-tag-directory__metric--bookmark"
                :class="{ 'is-zero': !tagItem.counts.bookmark }"
              >
                <i></i>{{ t('tagSpace.bookmark') }} <b>{{ tagItem.counts.bookmark }}</b>
              </span>
              <span
                class="mobile-tag-directory__metric mobile-tag-directory__metric--note"
                :class="{ 'is-zero': !tagItem.counts.note }"
              >
                <i></i>{{ t('tagSpace.note') }} <b>{{ tagItem.counts.note }}</b>
              </span>
              <span
                class="mobile-tag-directory__metric mobile-tag-directory__metric--file"
                :class="{ 'is-zero': !tagItem.counts.file }"
              >
                <i></i>{{ t('tagSpace.file') }} <b>{{ tagItem.counts.file }}</b>
              </span>
            </span>
          </span>
          <strong class="mobile-tag-directory__row-total">{{ tagItem.counts.total }}</strong>
        </BButton>
      </div>
    </div>
  </BDrawer>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { TagSpaceSummary } from '@/api/tagSpace';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';

  const props = withDefaults(
    defineProps<{
      open: boolean;
      tags: TagSpaceSummary[];
      total: number;
      currentTagId: string;
      switchingTagId?: string;
      loading?: boolean;
      error?: boolean;
      readOnly?: boolean;
    }>(),
    {
      switchingTagId: '',
      loading: false,
      error: false,
      readOnly: false,
    },
  );

  const emit = defineEmits<{
    'update:open': [value: boolean];
    select: [id: string];
    create: [];
    retry: [];
  }>();
  const { t } = useI18n();
  const keyword = ref('');

  const activeTagId = computed(() => props.switchingTagId || props.currentTagId);
  const filteredTags = computed(() => {
    const normalizedKeyword = keyword.value.trim().toLocaleLowerCase();
    const matches = normalizedKeyword
      ? props.tags.filter((tagItem) =>
          String(tagItem.name || '')
            .toLocaleLowerCase()
            .includes(normalizedKeyword),
        )
      : props.tags;
    const activeIndex = matches.findIndex((tagItem) => String(tagItem.id) === activeTagId.value);
    if (activeIndex <= 0) return matches;
    return [matches[activeIndex], ...matches.slice(0, activeIndex), ...matches.slice(activeIndex + 1)];
  });

  async function selectTag(id: string) {
    await closeCurrentMobileOverlayThen(
      () => emit('update:open', false),
      () => emit('select', id),
    );
  }

  async function createTag() {
    await closeCurrentMobileOverlayThen(
      () => emit('update:open', false),
      () => emit('create'),
    );
  }

  watch(
    () => props.open,
    (open) => {
      if (!open) keyword.value = '';
    },
  );
</script>

<style scoped lang="less">
  .mobile-tag-directory {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--surface-page-bg, var(--background-color));
  }

  .mobile-tag-directory__toolbar {
    padding: 12px 16px 10px;
    display: grid;
    gap: 10px;
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .mobile-tag-directory__summary {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--desc-color);
    font-size: 13px;
  }

  .mobile-tag-directory__summary strong {
    color: var(--text-color);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .mobile-tag-directory__list {
    min-height: 0;
    padding: 8px 12px max(14px, env(safe-area-inset-bottom));
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 6px;
    overflow: auto;
  }

  .mobile-tag-directory__row {
    width: 100%;
    min-width: 0;
    min-height: 68px;
    height: auto;
    padding: 9px 10px;
    justify-content: flex-start;
    gap: 10px;
    border: 1px solid transparent;
    border-radius: 12px;
    color: var(--text-color);
    background: transparent;
    text-align: left;
    transition:
      border-color 0.18s ease,
      background 0.18s ease;
  }

  .mobile-tag-directory__row:hover,
  .mobile-tag-directory__row:focus-visible {
    border-color: var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }

  .mobile-tag-directory__row.is-active {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background, transparent));
  }

  .mobile-tag-directory__row-icon {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border-radius: 10px;
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color);
    overflow: hidden;
  }

  .mobile-tag-directory__row-copy {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 6px;
  }

  .mobile-tag-directory__row-title {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .mobile-tag-directory__row-title strong {
    min-width: 0;
    overflow: hidden;
    flex: 0 1 auto;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-tag-directory__row-title small {
    padding: 1px 5px;
    flex: 0 0 auto;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    font-size: 10px;
    line-height: 1.35;
  }

  .mobile-tag-directory__metrics {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.2;
    white-space: nowrap;
  }

  .mobile-tag-directory__metric {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .mobile-tag-directory__metric i {
    width: 5px;
    height: 5px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: currentColor;
  }

  .mobile-tag-directory__metric b {
    color: var(--text-color);
    font-size: inherit;
    font-variant-numeric: tabular-nums;
  }

  .mobile-tag-directory__metric--bookmark {
    color: var(--resource-bookmark-color, #615ced);
  }

  .mobile-tag-directory__metric--note {
    color: var(--resource-note-color, #00a884);
  }

  .mobile-tag-directory__metric--file {
    color: var(--resource-file-color, #ff8a00);
  }

  .mobile-tag-directory__metric.is-zero {
    color: var(--desc-color);
    opacity: 0.62;
  }

  .mobile-tag-directory__row-total {
    min-width: 26px;
    flex: 0 0 auto;
    color: var(--text-color);
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .mobile-tag-directory__inline-error {
    margin: 10px 12px 0;
    padding: 9px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid var(--warning-color, #d97706);
    border-radius: 10px;
    color: var(--text-color);
    background: var(--card-background, var(--background-color));
    font-size: 12px;
  }

  .mobile-tag-directory__state {
    min-height: 0;
    padding: 32px 24px max(24px, env(safe-area-inset-bottom));
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 9px;
    color: var(--desc-color);
    text-align: center;
  }

  .mobile-tag-directory__state strong {
    color: var(--text-color);
    font-size: 16px;
  }

  .mobile-tag-directory__state p {
    max-width: 280px;
    margin: 0 0 4px;
    font-size: 13px;
    line-height: 1.6;
  }

  .mobile-tag-directory__state-icon {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-tag-color, #ec4899);
    border-radius: 13px;
    color: var(--resource-tag-color, #ec4899);
    font-size: 19px;
    font-weight: 700;
  }

  .mobile-tag-directory__skeleton {
    min-height: 0;
    padding: 8px 12px max(14px, env(safe-area-inset-bottom));
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 4px;
    overflow: hidden;
  }

  .mobile-tag-directory__skeleton-row {
    min-height: 52px;
    padding: 9px 10px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 12px;
  }

  .mobile-tag-directory__skeleton-row i,
  .mobile-tag-directory__skeleton-row b,
  .mobile-tag-directory__skeleton-row small {
    display: block;
    border-radius: 8px;
    background: var(--skeleton-bg, var(--workspace-panel-bg-color));
    animation: mobile-tag-directory-pulse 1.35s ease-in-out infinite;
  }

  .mobile-tag-directory__skeleton-row i {
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
  }

  .mobile-tag-directory__skeleton-row b {
    width: min(54%, 190px);
    height: 13px;
  }

  .mobile-tag-directory__skeleton-row small {
    width: 24px;
    height: 11px;
    margin-left: auto;
  }

  :global(html.light-note-mobile-rendering .mobile-tag-directory__inline-error) {
    box-shadow: none;
  }

  :global(html.light-note-mobile-rendering .mobile-tag-directory__row.is-active) {
    border-color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  @keyframes mobile-tag-directory-pulse {
    0%,
    100% {
      opacity: 0.55;
    }
    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-tag-directory__row {
      transition: none;
    }

    .mobile-tag-directory__skeleton-row i,
    .mobile-tag-directory__skeleton-row b,
    .mobile-tag-directory__skeleton-row small {
      animation: none;
    }
  }
</style>
