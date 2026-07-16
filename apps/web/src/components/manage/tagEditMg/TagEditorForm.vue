<template>
  <div class="tag-editor-form">
    <BCard as="section" variant="card" padding="16px" class="tag-editor-base">
      <div class="tag-field">
        <span class="tag-field__label">{{ $t('tagManage.tagName') }}</span>
        <BInput v-model:value="tag.name" />
      </div>
      <div class="tag-field tag-field--icon">
        <TagIconPicker v-model:value="tag.iconUrl" :tag-name="tag.name" />
      </div>
      <div class="tag-field">
        <span class="tag-field__label">{{ $t('tagManage.relatedTag') }}</span>
        <BSelect
          v-model:value="tag.relatedTagIds"
          mode="multiple"
          :show-search="true"
          :max-tag-count="4"
          :options="tagOptions"
          :filter-option="SelectionSearch"
        />
      </div>
    </BCard>

    <BCard
      as="section"
      variant="panel"
      padding="14px"
      class="tag-editor-resources"
      :style="{ '--section-color': activeResourceSection.color }"
    >
      <div class="resource-toolbar">
        <div class="resource-tabs no-scrollbar">
          <BButton
            v-for="section in resourceSections"
            :key="section.type"
            class="resource-tab"
            :class="{ active: activeResourceType === section.type }"
            @click="activeResourceType = section.type"
          >
            <span class="resource-tab-dot" :style="{ background: section.color }"></span>
            <span>{{ section.label }}</span>
            <strong>{{ section.selectedCount }}/{{ section.items.length }}</strong>
          </BButton>
        </div>
        <BInput
          v-model:value="searchMap[activeResourceType]"
          class="resource-search"
          :placeholder="$t('placeholder.searchPlaceholder')"
          clearable
        />
      </div>

      <div :key="activeResourceType" class="resource-grid">
        <BCard
          v-for="item in activeResourceSection.filteredItems"
          :key="`${activeResourceType}-${item.rawId}`"
          as="label"
          variant="card"
          padding="0 12px"
          class="resource-card"
          :class="{ active: activeResourceSection.selectedIds.includes(item.rawId) }"
        >
          <BCheckbox
            :checked="activeResourceSection.selectedIds.includes(item.rawId)"
            @change="(checked: boolean) => emit('toggleResource', activeResourceSection.type, item.rawId, checked)"
          />
          <span class="resource-name text-hidden" :title="item.name">{{ item.name }}</span>
        </BCard>
        <div v-if="!activeResourceSection.filteredItems.length" class="resource-empty">
          {{ $t('tagManage.listEmptyText') }}
        </div>
      </div>
    </BCard>

    <footer class="tag-editor-footer">
      <span>{{ $t('tagManage.linkedCount', { count: totalSelectedCount }) }}</span>
      <div class="tag-editor-footer__actions">
        <BButton @click="emit('cancel')">{{ $t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="saving" @click="emit('submit')">{{ $t('common.save') }}</BButton>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
  import type { TagInterface } from '@/config/bookmarkCfg.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import { SelectionSearch } from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import TagIconPicker from './TagIconPicker.vue';
  import type { TagResourceItem, TagResourceKind } from '@/composables/useTagEditor.ts';

  type ResourceSection = {
    type: TagResourceKind;
    label: string;
    color: string;
    items: TagResourceItem[];
    filteredItems: TagResourceItem[];
    selectedIds: string[];
    selectedCount: number;
  };

  defineProps<{
    tagOptions: { label: string; value: string }[];
    searchMap: Record<TagResourceKind, string>;
    resourceSections: ResourceSection[];
    activeResourceSection: ResourceSection;
    totalSelectedCount: number;
    saving: boolean;
  }>();
  const tag = defineModel<TagInterface>('tag', { required: true });
  const activeResourceType = defineModel<TagResourceKind>('activeResourceType', { required: true });
  const emit = defineEmits<{
    toggleResource: [type: TagResourceKind, id: string, checked: boolean];
    submit: [];
    cancel: [];
  }>();
</script>

<style scoped lang="less">
  .tag-editor-form {
    width: min(1180px, 100%);
    height: 100%;
    margin: 0 auto;
    display: grid;
    grid-template-rows: auto minmax(260px, 1fr) auto;
    gap: 14px;
    color: var(--text-color);
  }

  .tag-editor-base,
  .tag-editor-resources {
    border-radius: 14px;
  }

  .tag-editor-base {
    --b-card-background: var(--card-background);
    --b-card-border-color: var(--surface-border-color);
    --b-card-shadow: var(--surface-card-shadow);

    display: grid;
    grid-template-columns: minmax(220px, 0.85fr) minmax(420px, 1.65fr) minmax(210px, 0.7fr);
    gap: 14px;
  }

  .tag-field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tag-field__label {
    color: var(--desc-color);
    font-size: 13px;
  }

  .tag-editor-resources {
    --b-card-background: var(--workspace-panel-bg-color);
    --b-card-border-color: var(--surface-border-color);

    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
  }

  .resource-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .resource-tabs {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
  }

  .resource-tab {
    height: 34px;
    padding: 0 12px;
    gap: 7px;
    color: var(--desc-color);
    border: 1px solid transparent;
    background: transparent;

    strong {
      font-size: 11px;
      font-weight: 550;
    }

    &.active {
      color: var(--text-color);
      border-color: color-mix(in srgb, var(--section-color) 36%, var(--surface-border-color));
      background: color-mix(in srgb, var(--section-color) 9%, var(--card-background));
    }
  }

  .resource-tab-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
  }

  .resource-search {
    width: 260px;
    flex: 0 0 auto;
  }

  .resource-grid {
    min-height: 0;
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    grid-auto-rows: 44px;
    align-content: start;
    gap: 8px;
    overflow: auto;
  }

  .resource-card {
    --b-card-background: var(--card-background);
    --b-card-border-color: var(--surface-border-color);
    --b-card-shadow: var(--surface-card-shadow);

    min-width: 0;
    height: 44px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 9px;
    cursor: pointer;

    &.active {
      border-color: color-mix(in srgb, var(--section-color) 42%, var(--surface-border-color));
      background: color-mix(in srgb, var(--section-color) 7%, var(--card-background));
    }
  }

  .resource-name {
    min-width: 0;
    color: var(--text-color);
    font-size: 13px;
  }

  .resource-empty {
    grid-column: 1 / -1;
    padding: 40px 0;
    color: var(--desc-color);
    text-align: center;
  }

  .tag-editor-footer {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .tag-editor-footer__actions {
    display: flex;
    gap: 8px;
  }

  @media (max-width: 1100px) {
    .tag-editor-form {
      height: auto;
      min-height: 100%;
      grid-template-rows: auto minmax(320px, 1fr) auto;
    }

    .tag-editor-base {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 767px) {
    .tag-editor-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .tag-editor-base,
    .tag-editor-resources {
      padding: 12px;
      border-radius: 12px;
    }

    .resource-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
    }

    .resource-search {
      width: 100%;
    }

    .resource-grid {
      display: flex;
      flex-direction: column;
      max-height: min(42vh, 360px);
    }

    .resource-card {
      min-height: 44px;
      flex: 0 0 44px;
    }

    .tag-editor-footer {
      position: sticky;
      bottom: 0;
      z-index: 2;
      padding: 10px 0 max(4px, env(safe-area-inset-bottom));
      background: var(--card-background);
    }
  }
</style>
