<template>
  <div v-if="resource" class="resource-inspector-panel">
    <div
      class="resource-inspector-hero"
      :class="[
        'is-' + resource.type,
        { 'resource-inspector-hero--expanded': resource.type === 'note' && presentation === 'sidebar' },
      ]"
    >
      <div class="resource-inspector-identity">
        <span class="resource-inspector-icon" aria-hidden="true">
          <SvgIcon :src="iconSrc" size="23" />
        </span>
        <div class="resource-inspector-identity__copy">
          <span>{{ t('resourceCenter.currentResource') }}</span>
          <strong>{{ typeLabel }}</strong>
        </div>
      </div>
      <h2>{{ resource.title || '-' }}</h2>
      <p v-auto-scrollbar class="resource-inspector-description">{{ preview }}</p>
    </div>

    <dl class="resource-inspector-meta">
      <div v-if="resource.type === 'note'">
        <dt>{{ t('resourceCenter.noteType') }}</dt>
        <dd>{{ noteTypeLabel }}</dd>
      </div>
      <div>
        <dt>{{ t(resource.type === 'note' ? 'resourceCenter.location' : 'resourceCenter.source') }}</dt>
        <dd>
          {{
            resource.type === 'note'
              ? resource.path || t('resourceCenter.rootLocation')
              : resource.domain || resource.category || '-'
          }}
        </dd>
      </div>
      <div>
        <dt>{{ t('resourceCenter.updatedAt') }}</dt>
        <dd>{{ resource.updatedAtText || resource.extra || '-' }}</dd>
      </div>
    </dl>

    <div v-if="resource.tagNames.length" class="resource-inspector-tags">
      <span class="resource-inspector-tags__label">{{ t('resourceCenter.tags') }}</span>
      <ResourceTagChip
        v-for="tag in resource.tagNames.slice(0, 6)"
        :key="tag"
        :tag="{ name: tag }"
        size="small"
        max-width="min(100%, 180px)"
      />
    </div>

    <div class="resource-inspector-actions">
      <BButton block size="large" type="primary" @click="emit('open', resource)">
        <SvgIcon :src="icon.noteTree.openPage" size="17" aria-hidden="true" />
        {{ t('resourceCenter.openResource') }}
      </BButton>
      <BButton block size="large" type="function" @click="emit('analyze', resource)">
        <SvgIcon :src="icon.ai.organize" size="17" aria-hidden="true" />
        {{ t('resourceCenter.analyzeResource') }}
      </BButton>
      <BButton block size="large" class="resource-inspector-action--inbox" @click="emit('inbox', resource)">
        <SvgIcon :src="icon.contextMenu.inbox" size="16" aria-hidden="true" />
        {{ t('inbox.addExisting') }}
      </BButton>
      <BActionMenu
        class="resource-inspector-tag-menu"
        :items="tagActions"
        :triggers="['click']"
        placement="top-left"
        :aria-label="t('resourceCenter.manageResourceTags')"
        @select="handleTagAction"
      >
        <BButton block size="large" class="resource-inspector-action--tags">
          <SvgIcon :src="icon.manage_categoryBtn_tag" size="16" aria-hidden="true" />
          {{ t('resourceCenter.manageResourceTags') }}
        </BButton>
      </BActionMenu>
      <BButton
        block
        size="large"
        type="danger"
        class="resource-inspector-action--delete"
        @click="emit('delete', resource)"
      >
        <SvgIcon :src="icon.table_delete" size="16" aria-hidden="true" />
        {{ t('inbox.deleteResource') }}
      </BButton>
    </div>
  </div>

  <div v-else class="resource-inspector-empty">
    <strong>{{ t('resourceCenter.inspectorEmptyTitle') }}</strong>
    <p>{{ t('resourceCenter.inspectorEmptyDesc') }}</p>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';
  import icon from '@/config/icon.ts';
  import type { BActionMenuItem } from '@/components/base/BasicComponents/actionMenu';
  import type { DisplaySearchItem } from '@/components/searchCenter/searchUtils.ts';

  const props = withDefaults(
    defineProps<{
      resource: DisplaySearchItem | null;
      iconSrc: string;
      typeLabel: string;
      preview: string;
      noteTypeLabel: string;
      presentation?: 'sidebar' | 'drawer';
    }>(),
    { presentation: 'sidebar' },
  );

  const emit = defineEmits<{
    open: [resource: DisplaySearchItem];
    analyze: [resource: DisplaySearchItem];
    inbox: [resource: DisplaySearchItem];
    addTag: [resource: DisplaySearchItem];
    removeTag: [resource: DisplaySearchItem];
    delete: [resource: DisplaySearchItem];
  }>();
  const { t } = useI18n();

  const tagActions = computed<BActionMenuItem[]>(() => [
    {
      key: 'addTag',
      label: t('resourceCenter.batch.addTag'),
      icon: icon.manage_categoryBtn_tag,
    },
    {
      key: 'removeTag',
      label: t('resourceCenter.batch.removeTag'),
      icon: icon.manage_categoryBtn_tag,
    },
  ]);

  function handleTagAction(action: string) {
    if (!props.resource) return;
    if (action === 'addTag') emit('addTag', props.resource);
    else if (action === 'removeTag') emit('removeTag', props.resource);
  }
</script>

<style scoped lang="less">
  .resource-inspector-panel {
    min-height: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 12px;
  }

  .resource-inspector-hero {
    --inspector-accent: var(--primary-color);
    display: flex;
    flex-direction: column;
    gap: 11px;
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background:
      linear-gradient(145deg, color-mix(in srgb, var(--inspector-accent) 10%, transparent), transparent 62%),
      var(--card-background);
  }

  .resource-inspector-hero.is-bookmark {
    --inspector-accent: var(--resource-bookmark-color, #7166ff);
  }

  .resource-inspector-hero.is-note {
    --inspector-accent: var(--resource-note-color, #10a77a);
  }

  .resource-inspector-hero.is-file {
    --inspector-accent: var(--resource-file-color, #f58b22);
  }

  .resource-inspector-hero--expanded {
    min-height: 0;
    flex: 1 1 0;
    overflow: hidden;
  }

  .resource-inspector-identity {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .resource-inspector-icon {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--inspector-accent) 28%, var(--surface-border-color));
    border-radius: 13px;
    color: var(--inspector-accent);
    background: color-mix(in srgb, var(--inspector-accent) 11%, var(--card-background));
  }

  .resource-inspector-identity__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .resource-inspector-identity__copy > span,
  .resource-inspector-description,
  .resource-inspector-empty p {
    color: var(--desc-color);
  }

  .resource-inspector-identity__copy > span {
    font-size: 11px;
  }

  .resource-inspector-identity__copy > strong {
    color: var(--inspector-accent);
    font-size: 12px;
  }

  .resource-inspector-hero h2 {
    margin: 0;
    display: -webkit-box;
    overflow: hidden;
    font-size: 17px;
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .resource-inspector-description {
    margin: 0;
    display: -webkit-box;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }

  .resource-inspector-hero--expanded .resource-inspector-description {
    min-height: 0;
    display: block;
    flex: 1 1 auto;
    overflow: hidden auto;
    -webkit-line-clamp: unset;
  }

  .resource-inspector-meta {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-panel-bg);
  }

  .resource-inspector-meta > div {
    display: grid;
    grid-template-columns: 74px minmax(0, 1fr);
    gap: 8px;
  }

  .resource-inspector-meta dt,
  .resource-inspector-meta dd {
    margin: 0;
    font-size: 12px;
  }

  .resource-inspector-meta dt {
    color: var(--desc-color);
  }

  .resource-inspector-meta dd {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-inspector-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .resource-inspector-tags__label {
    width: 100%;
    color: var(--desc-color);
    font-size: 12px;
  }

  .resource-inspector-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid var(--surface-border-color);
  }

  .resource-inspector-actions :deep(.b-action-menu-anchor),
  .resource-inspector-actions :deep(.b_btn) {
    width: 100%;
    min-width: 0;
  }

  .resource-inspector-actions :deep(.b_btn) {
    padding-inline: 10px;
    gap: 6px;
    font-size: 13px;
  }

  .resource-inspector-action--inbox,
  .resource-inspector-action--tags {
    border-color: color-mix(in srgb, var(--primary-color) 28%, var(--surface-border-color));
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
  }

  .resource-inspector-action--delete {
    grid-column: 1 / -1;
  }

  .resource-inspector-empty {
    min-height: 220px;
    display: grid;
    align-content: center;
    gap: 8px;
    text-align: center;
  }

  .resource-inspector-empty p {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
  }

  @media (max-width: 720px) {
    .resource-inspector-panel {
      padding-bottom: max(4px, env(safe-area-inset-bottom));
    }

    .resource-inspector-hero--expanded {
      flex: none;
    }

    .resource-inspector-actions {
      position: sticky;
      bottom: 0;
      padding: 10px 0 0;
      background: var(--background-color);
    }
  }
</style>
