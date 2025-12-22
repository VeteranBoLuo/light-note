<template>
  <div class="category-panel">
    <template v-if="bookmark.type === 'normal' && bookmark.tagData">
      <div class="category-title">{{ bookmark.tagData?.name || $t('navigation.title') }}</div>
      <div class="category-content">
        {{ bookmark.tagData.relatedTagList?.length }} 个相关书签，{{ bookmark.tagData.bookmarkList?.length }}
        个关联标签
      </div>
      <div class="category-tag">
        <div
          class="category-tag-item dom-hover"
          @click="handleToTagPage(tag)"
          v-for="tag in bookmark.tagData?.relatedTagList"
          >{{ tag.name }}</div
        >
      </div>
      <div class="category-tag-item" style="opacity: 0; height: 1px">占位块</div>
    </template>
    <template v-else-if="bookmark.type === 'all'">
      <div class="category-title" style="font-size: 18px">{{ $t('navigation.title') }}</div>
      <div class="category-content">
        <div style="text-align: center">
          <div>{{ $t('home.allCard') }}</div>
          <div style="margin-top: 10px">
            <template v-if="bookmark.locale === 'zh-CN'">
              已收录 {{ user.tagTotal }} 个标签，共 {{ user.bookmarkTotal }} 个书签
            </template>
            <template v-else>
              Total {{ user.tagTotal }} tags, {{ user.bookmarkTotal }} bookmarks </template>
          </div>
        </div>
      </div>
      <div class="category-tag-item" style="opacity: 0; height: 1px">占位块</div>
    </template>
    <template v-else>
      <div class="category-title">搜索结果</div>
      <div class="category-content">
        <div style="text-align: center">
          <div
            >关键词：<b class="custom-underline">{{ bookmark.bookmarkSearch }}</b></div
          >
          <div style="margin-top: 10px">已获取 {{ bookmark.bookmarkList.length }} 个相关书签</div>
        </div>
      </div>
      <div class="category-tag-item" style="opacity: 0; height: 1px">占位块</div>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { bookmarkStore, useUserStore } from '@/store';
  import router from '@/router';
  const bookmark = bookmarkStore();
  const user = useUserStore();
  function handleToTagPage(tag) {
    router.push({ path: `/home/${tag.id}` });
    bookmark.type = 'normal';
    bookmark.refreshTag();
  }
</script>

<style lang="less">
  .category-panel {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;

    .category-title {
      font-size: 30px;
      font-weight: 550;
    }

    .category-content {
      color: var(--desc-color);
      font-size: 14px;
    }

    .category-tag {
      display: flex;
      gap: 10px;
    }

    .category-tag-item {
      border-radius: 30px;
      display: flex;
      font-size: 14px;
      justify-content: center;
      align-items: center;
      color: var(--desc-color);
      background-color: var(--common-tag-bg-color);
      padding: 4px 10px;
      &:hover {
        color: var(--common-tag-h-color);
      }
    }
  }
  .custom-underline {
    font-style: italic;
    text-decoration-line: underline;
    text-underline-offset: 3px;
    font-weight: 550;
  }
</style>
