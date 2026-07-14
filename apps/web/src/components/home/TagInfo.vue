<template>
  <div class="category-panel">
    <template v-if="bookmark.type === 'normal' && bookmark.tagData">
      <div class="category-title">{{ bookmark.tagData?.name || $t('navigation.title') }}</div>
      <div class="category-content">
        {{ $t('home.relatedInfo', { bookmarks: bookmark.tagData.relatedTagList?.length || 0, tags: bookmark.tagData.bookmarkList?.length || 0 }) }}
      </div>
      <div class="category-tag">
        <div
          class="category-tag-item dom-hover"
          @click="handleToTagPage(tag)"
          v-for="tag in bookmark.tagData?.relatedTagList"
          v-click-log="{ module: '首页', operation: `点击相关标签【${tag.name}】` }"
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
            {{ $t('home.recorded', { tags: user.tagTotal, bookmarks: user.bookmarkTotal }) }}
          </div>
          <div v-if="isGuest" class="guest-own-hint">
            {{ $t('home.guestDemoPre') }}<span class="guest-own-link" @click="guestRegister">{{ $t('home.guestDemoLink') }}</span>{{ $t('home.guestDemoPost') }}
          </div>
        </div>
      </div>
      <div class="category-tag-item" style="opacity: 0; height: 1px">占位块</div>
    </template>
    <template v-else>
      <div class="category-title">{{ $t('home.searchResult') }}</div>
      <div class="category-content">
        <div style="text-align: center">
          <div
            >{{ $t('home.keyword') }}<b class="custom-underline">{{ bookmark.bookmarkSearch }}</b></div
          >
          <div style="margin-top: 10px">{{ $t('home.gotBookmarks', { n: bookmark.bookmarkList.length }) }}</div>
        </div>
      </div>
      <div class="category-tag-item" style="opacity: 0; height: 1px">占位块</div>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import router from '@/router';
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const isGuest = computed(() => !user.visitorWorkspace && (!user.id || user.role === 'visitor'));
  // 游客点首页「注册拥有」:打开注册弹窗(openAuthModal 内部记 signup_open,source=home_demo_hint)
  function guestRegister() {
    bookmark.openAuthModal('注册', 'home_demo_hint');
  }
  function handleToTagPage(tag) {
    bookmark.type = 'normal';
    router.push({ path: `/home/${tag.id}` }).then(() => {
      bookmark.refreshData();
    });
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
  .guest-own-hint {
    margin-top: 8px;
    font-size: 13px;
    color: var(--desc-color);
  }
  .guest-own-link {
    color: #615ced;
    cursor: pointer;
    font-weight: 500;
  }
  .guest-own-link:hover {
    text-decoration: underline;
  }
</style>
