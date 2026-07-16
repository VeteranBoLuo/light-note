<template>
  <section
    class="category-panel"
    :class="{
      'category-panel--all': bookmark.type === 'all',
      'category-panel--filtered': bookmark.type !== 'all',
    }"
  >
    <template v-if="bookmark.type === 'normal' && currentTag">
      <div class="category-copy">
        <span class="category-kicker">{{ $t('home.currentTag') }}</span>
        <h2 class="category-title">{{ currentTag.name || $t('navigation.tag') }}</h2>
        <p class="category-content">
          {{
            $t('home.relatedInfo', {
              bookmarks: currentTag.bookmarkList?.length || bookmark.bookmarkList.length,
              tags: currentTag.relatedTagList?.length || 0,
            })
          }}
        </p>
      </div>
      <div v-if="currentTag.relatedTagList?.length" class="category-tag">
        <BButton
          class="category-tag-item"
          @click="handleToTagPage(tag)"
          v-for="tag in currentTag.relatedTagList"
          :key="tag.id || tag.name"
          v-click-log="{ module: '首页', operation: `点击相关标签【${tag.name}】` }"
        >
          {{ tag.name }}
        </BButton>
      </div>
    </template>
    <template v-else-if="bookmark.type === 'all'">
      <div class="category-copy">
        <span class="category-kicker">{{ $t('home.collection') }}</span>
        <h2 class="category-title">{{ $t('home.allBookmarks') }}</h2>
        <p class="category-content">
          {{ $t('home.recorded', { tags: user.tagTotal, bookmarks: user.bookmarkTotal }) }}
        </p>
        <p v-if="isGuest" class="guest-own-hint">
          {{ $t('home.guestDemoPre') }}<span class="guest-own-link" @click="guestRegister">{{
            $t('home.guestDemoLink')
          }}</span
          >{{ $t('home.guestDemoPost') }}
        </p>
      </div>
    </template>
    <template v-else>
      <div class="category-copy">
        <span class="category-kicker">{{ $t('home.keyword') }}{{ bookmark.bookmarkSearch }}</span>
        <h2 class="category-title">{{ $t('home.searchResult') }}</h2>
        <p class="category-content">{{ $t('home.gotBookmarks', { n: bookmark.bookmarkList.length }) }}</p>
      </div>
    </template>
    <BButton v-if="bookmark.isMobile && bookmark.type !== 'all'" class="category-reset" @click="handleViewAll">
      {{ $t('home.viewAll') }}
    </BButton>
  </section>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import router from '@/router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import type { TagInterface } from '@/config/bookmarkCfg.ts';
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const currentTag = computed(() => bookmark.tagData as Partial<TagInterface>);
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

  function handleViewAll() {
    bookmark.type = 'all';
    bookmark.tagData = null;
    bookmark.bookmarkSearch = '';
    router.replace('/home').then(() => bookmark.refreshData());
  }
</script>

<style lang="less" scoped>
  .category-panel {
    width: 100%;
    min-height: 88px;
    padding: 16px 18px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 70%, transparent);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--resource-bookmark-color, #615ced) 5%, var(--menu-body-bg-color)),
      var(--menu-body-bg-color) 58%
    );

    .category-copy {
      min-width: 0;
    }

    .category-kicker {
      display: block;
      margin-bottom: 4px;
      color: var(--resource-bookmark-color, #615ced);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .category-title {
      margin: 0;
      color: var(--text-color);
      font-size: 20px;
      font-weight: 720;
      line-height: 1.25;
    }

    .category-content {
      margin: 5px 0 0;
      color: var(--desc-color);
      font-size: 12px;
    }

    .category-tag {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      flex-wrap: wrap;
    }

    .category-tag-item {
      height: 28px;
      padding: 0 10px;
      border-radius: 999px;
      color: var(--resource-bookmark-color, #615ced);
      background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 8%, var(--menu-body-bg-color));
      font-size: 12px;

      &:hover {
        color: var(--resource-bookmark-color, #615ced);
        background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 14%, var(--menu-body-bg-color));
      }
    }
  }

  .guest-own-hint {
    margin-top: 5px !important;
    font-size: 11px !important;
    color: var(--desc-color);
  }

  .guest-own-link {
    color: var(--resource-bookmark-color, #615ced);
    cursor: pointer;
    font-weight: 500;
  }

  .guest-own-link:hover {
    text-decoration: underline;
  }

  @media (max-width: 767px) {
    .category-panel--all {
      display: none;
    }

    .category-panel {
      min-height: 0;
      padding: 9px 10px;
      align-items: center;
      gap: 10px;
      border: 1px solid color-mix(in srgb, var(--card-border-color) 70%, transparent);
      border-radius: 10px;
      background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 4%, var(--menu-body-bg-color));

      .category-copy {
        flex: 1;
      }

      .category-kicker {
        display: none;
      }

      .category-title {
        font-size: 14px;
        line-height: 20px;
      }

      .category-content {
        margin-top: 1px;
        font-size: 11px;
        line-height: 16px;
      }

      .category-tag {
        width: 100%;
        order: 3;
        justify-content: flex-start;
        flex-wrap: nowrap;
        overflow-x: auto;
      }
    }

    .category-panel--filtered {
      flex-wrap: wrap;
    }

    .category-reset {
      height: 30px;
      padding: 0 9px;
      flex: 0 0 auto;
      border-radius: 8px;
      color: var(--resource-bookmark-color, #615ced);
      background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 8%, transparent);
      font-size: 11px;
    }
  }
</style>
