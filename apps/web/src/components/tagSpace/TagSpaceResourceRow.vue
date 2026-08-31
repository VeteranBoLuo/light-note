<template>
  <BCard
    as="article"
    variant="card"
    interactive
    padding="0"
    class="tag-space-resource-row"
    :class="`tag-space-resource-row--${item.type}`"
    role="button"
    tabindex="0"
    :aria-label="
      t('tagSpace.openResourceAria', {
        type: resourceTypeLabel,
        title: item.title || t('tagSpace.untitledResource'),
      })
    "
    @click="emit('open', item)"
    @keydown.enter="emit('open', item)"
    @keydown.space.prevent="emit('open', item)"
  >
    <span class="resource-row-icon">
      <BookmarkFavicon
        v-if="item.type === 'bookmark'"
        :bookmark-id="item.id"
        :src="item.iconUrl"
        :size="20"
        :tile-size="38"
      />
      <SvgIcon v-else :src="resourceIcon" size="20" />
    </span>

    <div class="resource-row-identity">
      <strong>{{ item.title || t('tagSpace.untitledResource') }}</strong>
      <span>{{ resourceMeta }}</span>
    </div>

    <p>{{ item.description || resourceTypeLabel }}</p>

    <div class="resource-row-tags">
      <span v-for="resourceTag in visibleOtherTags" :key="resourceTag.id">#{{ resourceTag.name }}</span>
    </div>

    <time>{{ timeLabel }}</time>
    <span class="resource-row-open" aria-hidden="true">→</span>
  </BCard>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon';
  import type { TagSpaceResourceItem, TagSpaceResourceSort } from '@/api/tagSpace';
  import BookmarkFavicon from '@/components/base/BookmarkFavicon.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';

  const props = defineProps<{
    item: TagSpaceResourceItem;
    currentTagId: string;
    sort: TagSpaceResourceSort;
  }>();
  const emit = defineEmits<{ open: [item: TagSpaceResourceItem] }>();
  const { t, locale } = useI18n();

  const resourceIcon = computed(() => {
    if (props.item.type === 'note') return icon.resource.note;
    if (props.item.type === 'file') return icon.resource.file;
    return icon.resource.bookmark;
  });
  const resourceTypeLabel = computed(() => {
    if (props.item.type === 'note') return t('tagSpace.note');
    if (props.item.type === 'file') return t('tagSpace.file');
    return t('tagSpace.bookmark');
  });
  const visibleOtherTags = computed(() =>
    (props.item.tags || []).filter((tag) => String(tag.id) !== props.currentTagId).slice(0, 2),
  );
  const resourceMeta = computed(() => {
    if (props.item.type === 'bookmark') {
      try {
        return new URL(props.item.url).hostname.replace(/^www\./, '');
      } catch {
        return props.item.url || resourceTypeLabel.value;
      }
    }
    if (props.item.type === 'file') {
      const fileType = String(props.item.fileType || t('tagSpace.file')).toUpperCase();
      return props.item.fileSize > 0 ? `${fileType} · ${formatFileSize(props.item.fileSize)}` : fileType;
    }
    return props.item.folderName || resourceTypeLabel.value;
  });
  const timeLabel = computed(() => {
    const raw = props.sort === 'added' ? props.item.addedTime : props.item.updateTime;
    if (!raw) return props.sort === 'added' ? t('tagSpace.addedUnknown') : t('tagSpace.updatedUnknown');
    const date = new Date(String(raw).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(raw);
    return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(date);
  });

  function formatFileSize(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** index;
    return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
  }
</script>

<style scoped lang="less">
  .tag-space-resource-row {
    --resource-row-accent: var(--resource-bookmark-color, #615ced);
    min-height: 68px;
    padding: 10px 12px !important;
    display: grid;
    grid-template-columns: auto minmax(190px, 0.9fr) minmax(230px, 1.3fr) minmax(90px, auto) auto auto;
    align-items: center;
    gap: 12px;
    cursor: pointer;
  }

  .tag-space-resource-row--note {
    --resource-row-accent: var(--resource-note-color, #00a884);
  }

  .tag-space-resource-row--file {
    --resource-row-accent: var(--resource-file-color, #ff8a00);
  }

  .tag-space-resource-row:hover,
  .tag-space-resource-row:focus-visible {
    border-color: var(--resource-row-accent);
  }

  .resource-row-icon {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--resource-row-accent) 55%, var(--surface-border-color));
    border-radius: 11px;
    color: var(--resource-row-accent);
    background: var(--workspace-panel-bg-color);
  }

  .resource-row-identity {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .resource-row-identity strong,
  .resource-row-identity span,
  .tag-space-resource-row > p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-row-identity strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .resource-row-identity span,
  .tag-space-resource-row > p,
  .tag-space-resource-row > time {
    color: var(--desc-color);
    font-size: 11px;
  }

  .tag-space-resource-row > p {
    margin: 0;
  }

  .resource-row-tags {
    min-width: 0;
    display: flex;
    gap: 5px;
    overflow: hidden;
  }

  .resource-row-tags span {
    max-width: 92px;
    overflow: hidden;
    color: var(--resource-tag-color, #ec4899);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-space-resource-row > time {
    white-space: nowrap;
  }

  .resource-row-open {
    color: var(--desc-color);
    font-size: 16px;
  }

  @media (max-width: 1180px) {
    .tag-space-resource-row {
      grid-template-columns: auto minmax(190px, 0.9fr) minmax(180px, 1.2fr) auto auto;
    }

    .resource-row-tags {
      display: none;
    }
  }

  @media (max-width: 767px) {
    .tag-space-resource-row {
      min-height: 76px;
      padding: 10px !important;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 9px;
    }

    .tag-space-resource-row > p,
    .tag-space-resource-row > time,
    .resource-row-tags {
      display: none;
    }

    .resource-row-icon {
      width: 38px;
      height: 38px;
    }

    .resource-row-identity strong {
      font-size: 14px;
    }
  }

  html.light-note-mobile-rendering .tag-space-resource-row:focus-visible {
    border-color: var(--resource-row-accent);
    box-shadow: none;
  }
</style>
