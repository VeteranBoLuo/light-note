<template>
  <div
    class="card-body"
    :class="{
      'is-selection-mode': selectionMode,
      'is-selected': selected,
    }"
    :role="selectionMode ? 'button' : 'link'"
    :aria-pressed="selectionMode ? selected : undefined"
    tabindex="0"
    @click="toNewPage"
    @keydown.enter="toNewPage"
    @keydown.space.prevent="toNewPage"
  >
    <div class="card-heading" :class="{ 'has-status-badges': !selectionMode && (isTop || cardInfo.isPending) }">
      <div class="card-title">
        <BookmarkFavicon
          class="card-img-container"
          :bookmark-id="cardInfo.id"
          :src="cardInfo.iconUrl"
          :loading="cardInfo.iconLoading"
          :size="22"
          :tile-size="34"
        />
        <div class="card-title-copy">
          <span class="card-title-text">{{ cardInfo.name }}</span>
          <span class="card-domain">{{ displayDomain }}</span>
        </div>
      </div>
      <div v-if="!selectionMode && (isTop || cardInfo.isPending)" class="card-status-badges">
        <PinBadge v-if="isTop" />
        <InboxPendingBadge v-if="cardInfo.isPending" />
      </div>
    </div>
    <div class="card-description">{{ cardInfo.description }}</div>
    <div v-if="!selectionMode" class="footer-tag">
      <ResourceTagChip
        v-for="tag in cardInfo.tagList"
        :key="tag.id || tag.name"
        :tag="tag"
        show-detail-corner
        max-width="var(--ui-layout-120, 120px)"
        @click="handleToTagPage(tag)"
        @detail="openTagDetail(tag)"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { bookmarkStore } from '@/store';
  import router from '@/router';
  import { computed } from 'vue';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { getBookmarkDisplayDomain } from '@/utils/bookmarkUrlDisplay.ts';
  import InboxPendingBadge from '@/components/inbox/InboxPendingBadge.vue';
  import PinBadge from '@/components/base/PinBadge.vue';
  import BookmarkFavicon from '@/components/base/BookmarkFavicon.vue';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';

  const bookmark = bookmarkStore();
  const props = defineProps({
    selectionMode: {
      type: Boolean,
      default: false,
    },
    selected: {
      type: Boolean,
      default: false,
    },
    cardInfo: {
      type: Object as () => {
        id?: string;
        name: string;
        description: string;
        url: string;
        tags: any;
        tagList?: any;
        isPending?: boolean;
        iconUrl?: string;
        iconLoading?: boolean;
      },
      default: () => ({
        id: '',
        name: '哔哩哔哩',
        description: '哔哩哔哩 (゜-゜)つロ 干杯~-bilibili',
        url: 'https://www.bilibili.com/',
        tags: [],
        tagList: undefined, // 你可以根据实际情况决定是否需要提供默认值
      }),
    },
  });
  const emit = defineEmits<{
    select: [];
  }>();

  const isTop = computed(() => !!(props.cardInfo as any).isTop);
  const displayDomain = computed(() => getBookmarkDisplayDomain(props.cardInfo.url));

  function toNewPage() {
    if (props.selectionMode) {
      emit('select');
      return;
    }
    openBookmarkUrl(props.cardInfo.url, { resourceId: props.cardInfo.id });
    recordOperation({ module: '首页', operation: `点击书签卡片【${props.cardInfo.name}】` });
  }

  function handleToTagPage(tag) {
    bookmark.type = 'normal';
    router.push(`/home/${tag.id}`).then(() => {
      bookmark.refreshData();
    });
  }

  function openTagDetail(tag) {
    if (!tag?.id) return;
    router.push(`/tag/${tag.id}`);
  }
</script>

<style lang="less" scoped>
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .card-body {
    border: 1px solid color-mix(in srgb, var(--card-border-color) 78%, transparent);
    height: var(--ui-card-164, 164px);
    border-radius: 13px;
    padding: var(--ui-space-14, 14px) var(--ui-space-15, 15px);
    box-sizing: border-box;
    cursor: pointer;
    position: relative;
    box-shadow: 0 10px 24px -24px color-mix(in srgb, var(--text-color) 38%, transparent);
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
    &:hover {
      border-color: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 38%, var(--card-border-color));
      box-shadow: 0 16px 30px -24px color-mix(in srgb, var(--resource-bookmark-color, #615ced) 70%, transparent);
    }
  }

  .card-heading {
    min-width: 0;

    &.has-status-badges {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: 8px;
      align-items: start;
    }
  }

  .card-status-badges {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    margin-top: -6px;
    margin-right: -7px;
  }

  .card-title {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: var(--ui-space-11, 11px);

    .card-title-copy {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .card-title-text {
      min-width: 0;
      overflow: hidden;
      color: var(--text-color);
      font-size: var(--ui-font-15, 15px);
      font-weight: 650;
      line-height: var(--ui-layout-20, 20px);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .card-domain {
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-10_5, 10.5px);
    line-height: var(--ui-layout-14, 14px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-img-container {
    cursor: move;
  }

  .card-description {
    word-break: break-word;
    overflow: hidden;
    width: 100%;
    font-size: var(--ui-font-12, 12px);
    line-height: var(--ui-layout-18, 18px);
    color: var(--desc-color);
    margin-top: var(--ui-space-12, 12px);
    height: calc(var(--ui-layout-18, 18px) * var(--bookmark-description-lines, 3));
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--bookmark-description-lines, 3);
    line-clamp: var(--bookmark-description-lines, 3);
  }

  .footer-tag {
    position: absolute;
    bottom: 9px;
    display: flex;
    gap: 8px;
    max-width: calc(100% - 21px);
    padding: 7px 7px 5px 0;
    overflow: hidden;

    .resource-tag-chip {
      cursor: pointer;
    }
  }

  /* padding 为 ResourceTagChip 的详情角标预留外溢空间，避免被 footer 的 overflow 裁切。 */

  // Keep the standard card's original positioning. Only compact cards need
  // a flow footer so shorter previews cannot collide with their tags.
  html[data-density='compact'] .card-body {
    display: flex;
    flex-direction: column;
    .card-heading {
      flex-shrink: 0;
    }
    .card-description {
      min-height: 0;
      flex-shrink: 1;
    }
    .footer-tag {
      position: static;
      flex-shrink: 0;
      margin-top: auto;
      padding-bottom: 0;
    }
  }

  @media (max-width: 1023px) {
    .card-body {
      height: var(--ui-card-154, 154px);
      &:hover {
        box-shadow: none; /* 移除 :hover 状态下的阴影 */
        border: 1px solid var(--card-border-color);
        transform: none;
      }
    }

    .footer-tag {
      bottom: 8px;
    }
    .card-description {
      height: 3.6em;
      line-height: 1.2;
      -webkit-line-clamp: var(--bookmark-description-lines, 3);
      line-clamp: var(--bookmark-description-lines, 3);
    }
  }

  // 共享工作区表面：仅改变颜色，布局与滚动由原组件负责。
  .card-body {
    .workspace-content-surface();
  }
</style>
