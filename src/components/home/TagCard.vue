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
      <div class="common-tag" @click="handleToTagPage(tag)" v-for="tag in cardInfo.tagList" @click.stop>
        <span>{{ tag.name }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { bookmarkStore, useUserStore } from '@/store';
  import router from '@/router';
  import { onMounted } from 'vue';
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
    if (['https', 'http'].some((str) => !props.cardInfo.url.includes(str))) {
      props.cardInfo.url = 'https://' + props.cardInfo.url;
    }
    window.open(props.cardInfo.url, '_blank');
    recordOperation({ module: '首页', operation: `点击书签卡片${props.cardInfo.name}` });
  }

  function handleToTagPage(tag) {
    router.push(`/home/${tag.id}`);
    bookmark.type = 'normal';
    bookmark.refreshTag();
  }

  function getIcon(bookmark: any) {
    if (bookmark.iconUrl) {
      return bookmark.iconUrl;
    } else {
      return 'https://icon.bqb.cool?url=' + bookmark.url;
    }
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

<style lang="less">
  .card-body {
    border: 2px solid var(--card-border-color);
    height: 150px;
    border-radius: 1rem;
    padding: 14px;
    box-sizing: border-box;
    cursor: pointer;
    position: relative;
    transition: border-color 0.1s;
    @media (hover: hover) {
      &:hover {
        box-shadow: 0 6px 6px rgba(59, 130, 246, 0.5);
        border: 2px solid var(--primary-h-color);
      }
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
    background-color: rgb(255, 255, 255);
    border-radius: 0.5rem;
    flex-shrink: 0;
    cursor: move;
  }

  .card-description {
    word-break: break-all;
    overflow: hidden;
    width: 100%;
    font-size: 12px;
    color: var(--desc-color);
    margin-top: 8px;
    height: 50px;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3; /* 显示的行数，根据需要调整 */
    line-clamp: 3;
  }

  .footer-tag {
    position: absolute;
    bottom: 14px;
    display: flex;
    gap: 8px;
  }

  @media (max-width: 1000px) {
    .card-body {
      height: 140px;
    }

    .card-title {
      .card-title-text {
        width: 280px;
      }
    }

    .footer-tag {
      bottom: 12px;
    }
    .card-description {
      height: 2.4em;
      line-height: 1.2;
      -webkit-line-clamp: 2; /* 显示的行数，根据需要调整 */
      line-clamp: 2;
    }
  }
</style>
