<template>
  <div class="card-body" @click="toNewPage">
    <div class="card-title">
      <div style="display: flex; align-items: center; gap: 10px">
        <div class="card-img-container">
          <img :id="cardInfo.id" :src="getIcon(cardInfo)" width="22" height="22" alt=" " />
        </div>
        <span class="card-title-text">{{ cardInfo.name }}</span></div
      >
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
  import { bookmarkStore, useUserStore } from '@/store';
  import router from '@/router';
  import { onMounted } from 'vue';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import icon from '@/config/icon.ts';

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

  const user = useUserStore();
  onMounted(() => {
    const imgElement = document.getElementById(props.cardInfo.id);
    if (imgElement) {
      // 监听图片加载错误事件
      imgElement.onerror = function () {
        // 设置默认图片
        this.src = icon.nullImg;
      };
    }
  });
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

  .card-title {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .card-title-text {
      width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
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

    .card-title {
      .card-title-text {
        width: calc(100% - 44px);
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
