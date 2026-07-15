<template>
  <div
    class="card-body"
    :class="{ 'has-top-badge': isTop, 'has-pending-badge': cardInfo.isPending }"
    @click="toNewPage"
  >
    <div v-if="isTop || cardInfo.isPending" class="card-status-badges">
      <span v-if="isTop" class="card-top-badge">{{ $t('common.pin') }}</span>
      <InboxPendingBadge v-if="cardInfo.isPending" />
    </div>
    <div class="card-title">
      <div class="card-img-container">
        <span v-if="cardInfo.iconLoading" class="card-icon-loading" aria-hidden="true"></span>
        <img v-else :src="getIcon(cardInfo)" width="22" height="22" alt="" @error="handleIconError" />
      </div>
      <span class="card-title-text">{{ cardInfo.name }}</span>
    </div>
    <div class="card-description">{{ cardInfo.description }}</div>
    <div class="footer-tag">
      <div
        class="common-tag tag-detail-chip"
        @click.stop="handleToTagPage(tag)"
        v-for="tag in cardInfo.tagList"
        :key="tag.id || tag.name"
      >
        <span class="tag-detail-label">{{ tag.name }}</span>
        <button class="tag-detail-corner" type="button" :title="$t('common.detail')" @click.stop="openTagDetail(tag)">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 4h6v6M12 4 5 11" />
          </svg>
        </button>
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

  const bookmark = bookmarkStore();
  const props = defineProps({
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

  const isTop = computed(() => !!(props.cardInfo as any).isTop);

  function toNewPage() {
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

  function getIcon(bookmark: any) {
    // 无图标时用站内默认图(地球),不再实时直连第三方 ico.kucat.cn:
    // 本地网络访问它不稳会破图,线上也不该押注第三方的实时可用性。
    // 真实 favicon 由后端异步抓取(analyzeImgUrl)存到站内并写回 iconUrl,抓到后自动显示。
    return bookmark.iconUrl || icon.nullImg;
  }

  function handleIconError(event: Event) {
    const image = event.currentTarget as HTMLImageElement;
    if (image.src !== icon.nullImg) image.src = icon.nullImg;
  }
</script>

<style lang="less" scoped>
  .card-body {
    border: 1px solid var(--card-border-color);
    height: 150px;
    border-radius: 1rem;
    padding: 14px;
    box-sizing: border-box;
    cursor: pointer;
    position: relative;
    background-color: var(--background-color);
    transition:
      border-color 0.2s,
      box-shadow 0.2s,
      transform 0.2s;
    &:hover {
      border-color: var(--primary-h-color);
      box-shadow: var(--ant-table-boxShadow);
      transform: translateY(-2px);
    }
    &:active {
      transform: translateY(0);
    }
  }
  .card-icon-loading {
    display: block;
    width: 22px;
    height: 22px;
    border-radius: 7px;
    background: linear-gradient(
      100deg,
      color-mix(in srgb, var(--primary-color) 7%, var(--card-border-color)) 20%,
      color-mix(in srgb, var(--primary-color) 18%, var(--background-color)) 45%,
      color-mix(in srgb, var(--primary-color) 7%, var(--card-border-color)) 70%
    );
    background-size: 220% 100%;
    animation: bookmark-icon-loading 1.1s ease-in-out infinite;
  }

  @keyframes bookmark-icon-loading {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
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
    gap: 10px;

    .card-title-text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
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
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem;
    border-radius: 0.5rem;
    flex-shrink: 0;
    cursor: move;
  }

  .card-description {
    word-break: break-all;
    overflow: hidden;
    width: 100%;
    font-size: 12px;
    line-height: 1.5;
    color: var(--desc-color);
    margin-top: 10px;
    height: 54px;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3; /* 显示的行数，根据需要调整 */
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

  @media (max-width: 1023px) {
    .card-body {
      height: 140px;
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
      height: 2.4em;
      line-height: 1.2;
      -webkit-line-clamp: 2; /* 显示的行数，根据需要调整 */
      line-clamp: 2;
    }
  }
</style>
