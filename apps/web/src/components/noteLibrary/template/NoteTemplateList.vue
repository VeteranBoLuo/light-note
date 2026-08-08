<template>
  <aside class="note-template-list" :class="{ 'is-mobile': mobile }">
    <div class="note-template-list__tools">
      <BInput v-model:value="search" clearable :placeholder="t('note.templateManager.searchPlaceholder')">
        <template #prefix><SvgIcon :src="icon.navigation.search" size="16" aria-hidden="true" /></template>
      </BInput>
      <BTabs v-model:active-tab="filter" variant="segment" :options="filterOptions" />
    </div>

    <div v-auto-scrollbar class="note-template-list__scroll">
      <div v-if="loading" class="note-template-list__status">
        <BLoading inline loading :title="t('note.tplLoading')" />
      </div>
      <div v-else-if="error" class="note-template-list__status is-error">
        <strong>{{ t('note.templateManager.loadFailed') }}</strong>
        <BButton size="small" @click="emit('retry')">{{ t('common.retry') }}</BButton>
      </div>
      <p v-else-if="!filteredTemplates.length" class="note-template-list__status">
        {{ templates.length ? t('note.templateManager.noMatch') : t('note.tplEmptyMine') }}
      </p>

      <MobileListSurface v-else-if="mobile" :aria-label="t('note.templateManager.listLabel')">
        <MobileListRow
          v-for="template in filteredTemplates"
          :key="template.id"
          interactive
          complex
          :selected="template.id === activeId"
          accent="var(--resource-note-color)"
          @click="emit('select', template.id)"
        >
          <template #leading>
            <span class="note-template-list__format-icon">
              <SvgIcon :src="formatIcon(template.type)" size="21" aria-hidden="true" />
            </span>
          </template>
          <template #title>{{ template.name }}</template>
          <template #subtitle>{{ template.description || t('note.templateManager.noDescription') }}</template>
          <template #meta>{{ typeLabel(template.type) }} · {{ formatTime(template.updateTime) }}</template>
          <template #trailing><SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" /></template>
        </MobileListRow>
      </MobileListSurface>

      <div
        v-else
        class="note-template-list__desktop-items"
        role="list"
        :aria-label="t('note.templateManager.listLabel')"
      >
        <BButton
          v-for="template in filteredTemplates"
          :key="template.id"
          class="note-template-list__item"
          :class="{ 'is-selected': template.id === activeId }"
          :aria-current="template.id === activeId ? 'true' : undefined"
          @click="emit('select', template.id)"
        >
          <span class="note-template-list__format-icon">
            <SvgIcon :src="formatIcon(template.type)" size="19" aria-hidden="true" />
          </span>
          <span class="note-template-list__copy">
            <strong>{{ template.name }}</strong>
            <small>{{ template.description || t('note.templateManager.noDescription') }}</small>
            <span>
              <BChip tone="neutral" size="small">{{ typeLabel(template.type) }}</BChip>
              <time>{{ formatTime(template.updateTime) }}</time>
            </span>
          </span>
        </BButton>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { NoteTemplateSummary, NoteTemplateType } from '@/types/noteTemplate';

  const props = withDefaults(
    defineProps<{
      templates: NoteTemplateSummary[];
      activeId?: string;
      loading?: boolean;
      error?: boolean;
      mobile?: boolean;
    }>(),
    { activeId: '', loading: false, error: false, mobile: false },
  );
  const emit = defineEmits<{ select: [id: string]; retry: [] }>();
  const { t, locale } = useI18n();
  const search = ref('');
  const filter = ref<'all' | NoteTemplateType>('all');
  const filterOptions = computed(() => [
    { key: 'all', label: t('note.templateManager.filterAll') },
    { key: 'html', label: t('note.tplTypeHtml') },
    { key: 'markdown', label: t('note.tplTypeMd') },
  ]);
  const filteredTemplates = computed(() => {
    const keyword = search.value.trim().toLocaleLowerCase(locale.value);
    return props.templates.filter((template) => {
      if (filter.value !== 'all' && template.type !== filter.value) return false;
      if (!keyword) return true;
      return [template.name, template.titleTemplate, template.description]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase(locale.value).includes(keyword));
    });
  });
  const typeLabel = (type: NoteTemplateType) => (type === 'markdown' ? t('note.tplTypeMd') : t('note.tplTypeHtml'));
  const formatIcon = (type: NoteTemplateType) =>
    type === 'markdown' ? icon.resource.noteMarkdown : icon.resource.noteHtml;
  function formatTime(value?: string | null) {
    if (!value) return t('note.templateManager.neverUpdated');
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
</script>

<style scoped lang="less">
  .note-template-list {
    width: 320px;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex: 0 0 320px;
    flex-direction: column;
    border-right: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }
  .note-template-list.is-mobile {
    width: 100%;
    flex: 1 1 auto;
    border-right: 0;
    background: transparent;
  }
  .note-template-list__tools {
    display: grid;
    gap: 8px;
    padding: 10px;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .note-template-list__tools :deep(.b-input) {
    border: 1px solid var(--surface-border-color) !important;
    background: var(--card-background) !important;
    color: var(--text-color);
    transition:
      border-color 0.16s ease,
      background-color 0.16s ease;
  }
  .note-template-list__tools :deep(.b-input::placeholder) {
    color: var(--desc-color);
    opacity: 1;
  }
  .note-template-list__tools :deep(.b-input:hover) {
    border-color: var(--sub-text-color) !important;
  }
  .note-template-list__tools :deep(.b-input:focus-visible) {
    border-color: var(--resource-note-color) !important;
    outline: 2px solid var(--resource-note-color);
    outline-offset: 1px;
  }
  :deep(.note-template-list__tools .tab-container) {
    width: 100%;
  }
  :deep(.note-template-list__tools .tab) {
    min-width: 0;
    flex: 1;
    justify-content: center;
  }
  .note-template-list__scroll {
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
    padding: 10px;
    scrollbar-gutter: stable;
  }
  .note-template-list__status {
    min-height: 150px;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
    color: var(--desc-color);
    text-align: center;
  }
  .note-template-list__status.is-error strong {
    color: var(--text-color);
  }
  .note-template-list__desktop-items {
    display: grid;
    gap: 6px;
  }
  .note-template-list__item {
    width: 100%;
    height: auto;
    min-height: 82px;
    justify-content: flex-start;
    gap: 10px;
    padding: 11px;
    border: 1px solid transparent !important;
    border-radius: 11px;
    color: var(--text-color);
    background: transparent;
    text-align: left;
  }
  .note-template-list__item:hover {
    border-color: var(--surface-border-color) !important;
    background: var(--hover-background);
  }
  .note-template-list__item.is-selected {
    border-color: var(--resource-note-color) !important;
    background: var(--mobile-selected-bg);
    color: var(--resource-note-color);
    font-weight: 650;
  }
  .note-template-list__format-icon {
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-note-color);
    border-radius: 10px;
    color: var(--resource-note-color);
    background: var(--resource-note-soft-bg, var(--card-background));
  }
  .note-template-list__copy {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    overflow: hidden;
    line-height: 1.35;
  }
  .note-template-list__copy strong,
  .note-template-list__copy small {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note-template-list__copy strong {
    color: inherit;
    font-size: 14px;
  }
  .note-template-list__copy small {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 400;
  }
  .note-template-list__copy > span {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .note-template-list__copy time {
    color: var(--muted-text-color, var(--desc-color));
    font-size: 10px;
    font-weight: 400;
  }
  .is-mobile .note-template-list__scroll {
    padding: 12px var(--mobile-page-gutter, 14px) 28px;
  }
  .is-mobile .note-template-list__tools {
    padding: 10px var(--mobile-page-gutter, 14px);
  }
</style>
