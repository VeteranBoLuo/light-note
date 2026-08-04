<template>
  <div
    class="card-body"
    :class="{
      'has-top-badge': isTop,
      'has-pending-badge': cardInfo.isPending,
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
    <div v-if="!selectionMode && (isTop || cardInfo.isPending)" class="card-status-badges">
      <span v-if="isTop" class="card-top-badge">{{ $t('common.pin') }}</span>
      <InboxPendingBadge v-if="cardInfo.isPending" />
    </div>
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
    <div class="card-description">{{ cardInfo.description }}</div>
    <div v-if="!selectionMode" class="footer-tag">
      <div
        class="common-tag tag-detail-chip"
        @click.stop="handleToTagPage(tag)"
        v-for="tag in cardInfo.tagList"
        :key="tag.id || tag.name"
      >
        <span class="tag-detail-label">{{ tag.name }}</span>
        <BButton class="tag-detail-corner" :title="$t('common.detail')" @click.stop="openTagDetail(tag)">
          <!-- 站内跳转到标签详情页,用"进入下一级"的箭头;share 是外链分享语义,不匹配 -->
          <SvgIcon :src="icon.arrow_right" size="13" />
        </BButton>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { bookmarkStore } from '@/store';
  import router from '@/router';
  import { computed } from 'vue';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import icon from '@/config/icon.ts';
  import InboxPendingBadge from '@/components/inbox/InboxPendingBadge.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BookmarkFavicon from '@/components/base/BookmarkFavicon.vue';

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
  const displayDomain = computed(() => {
    try {
      return new URL(props.cardInfo.url).hostname.replace(/^www\./, '');
    } catch {
      return props.cardInfo.url || '';
    }
  });

  function toNewPage() {
    if (props.selectionMode) {
      emit('select');
      return;
    }
    openBookmarkUrl(props.cardInfo.url);
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
  .card-body {
    border: 1px solid color-mix(in srgb, var(--card-border-color) 78%, transparent);
    height: 164px;
    border-radius: 13px;
    padding: 14px 15px;
    box-sizing: border-box;
    cursor: pointer;
    position: relative;
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--resource-bookmark-color, #615ced) 2.5%, var(--card-background)),
      var(--card-background) 52%
    );
    box-shadow: 0 10px 24px -24px color-mix(in srgb, var(--text-color) 38%, transparent);
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
    &:hover {
      border-color: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 38%, var(--card-border-color));
      box-shadow: 0 16px 30px -24px color-mix(in srgb, var(--resource-bookmark-color, #615ced) 70%, transparent);
    }
  }
  /* 置顶:仅右上角徽章标识,不加描边(保持卡片干净) */
  .card-status-badges {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .card-top-badge {
    display: inline-flex;
    padding: 1px 7px;
    font-size: 10px;
    line-height: 1.6;
    border-radius: 6px;
    color: #fff;
    background: var(--primary-color);
    font-weight: 600;
    letter-spacing: 1px;
  }

  .card-title {
    display: flex;
    align-items: center;
    gap: 11px;

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
      font-size: 15px;
      font-weight: 650;
      line-height: 20px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .card-domain {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 置顶徽章浮在右上角(absolute 不占宽),给标题右侧留出空间,避免长标题被徽章遮住 */
  .card-body.has-top-badge .card-title {
    padding-right: 46px;
  }

  .card-body.has-pending-badge .card-title {
    padding-right: 66px;
  }

  .card-body.has-top-badge.has-pending-badge .card-title {
    padding-right: 104px;
  }

  .card-img-container {
    cursor: move;
  }

  .card-description {
    word-break: break-word;
    overflow: hidden;
    width: 100%;
    font-size: 12px;
    line-height: 18px;
    color: var(--desc-color);
    margin-top: 12px;
    height: 54px;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .footer-tag {
    position: absolute;
    bottom: 9px;
    display: flex;
    gap: 8px;
    max-width: calc(100% - 21px);
    padding: 7px 7px 5px 0;
    overflow: hidden;

    .common-tag {
      max-width: 120px;
      cursor: pointer;
    }
  }

  /* 详情角标统一由 assets/css/common.less 负责:浮在标签右上角外侧、hover 淡入的小圆钮。
     这里不要覆写它的 background —— 圆钮跨在标签边界上,一旦变成 transparent,
     上下两半会分别透出卡片底色和标签底色,看起来就像被切掉一半。
     .footer-tag 的 padding: 7px 7px 5px 0 是给这个外溢圆钮留的裁切余量,不要收掉。 */

  @media (max-width: 1023px) {
    .card-body {
      height: 154px;
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
      -webkit-line-clamp: 3;
      line-clamp: 3;
    }
  }
</style>
