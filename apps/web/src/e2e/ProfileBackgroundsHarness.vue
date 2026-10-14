<template>
  <main class="profile-backgrounds-harness">
    <h1>个人背景 · 本地验收</h1>
    <p>此页面使用隔离内存数据，不连接后端或改变真实积分。</p>
    <section class="profile-backgrounds-harness__card"
      ><ChatUserProfileContent :profile="profile" :community-actions="false" :chat-actions="false" authenticated
    /></section>
    <section class="profile-backgrounds-harness__page">
      <ChatUserProfileContent :profile="profile" :community-actions="false" :chat-actions="false" authenticated>
        <template #identityDescription
          ><p>{{ profile.bio }}</p
          ><span>12 关注 · 28 关注者</span></template
        >
        <template #identityActions><BButton size="small">编辑社区资料</BButton></template>
      </ChatUserProfileContent>
    </section>
    <PointsShop :show-goal="false" :read-only="readOnly" />
  </main>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import ChatUserProfileContent from '@/components/communityChat/ChatUserProfileContent.vue';
  import PointsShop from '@/components/growth/PointsShop.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { useGrowth } from '@/composables/useGrowth';
  import type { CommunityChatAuthorProfile } from '@/api/communityChatApi';
  const { shop } = useGrowth();
  const readOnly = new URLSearchParams(location.search).get('state') === 'readonly';
  const profile = computed<CommunityChatAuthorProfile>(() => ({
    name: '山间拾光',
    role: 'member',
    avatar: '',
    frameId: 'frame_mint',
    level: 7,
    levelName: '探花',
    title: null,
    communityId: 'ln_DEMO01',
    backgroundId: shop.value?.equippedBackground || null,
    bio: '记录生活的细碎光芒，让每一个灵感都有安放之处。',
    communityTenureLabel: '加入轻笺约 1 年',
    achievements: [
      { key: 'bookmark_10', group: 'create' },
      { key: 'streak_7', group: 'checkin' },
    ],
    achievementCount: 2,
    hasMoreAchievements: false,
  }));
</script>
<style lang="less">
  html,
  body,
  #app {
    min-height: 100%;
    height: auto;
    margin: 0;
    overflow: auto;
  }
  body {
    display: block;
    background: var(--background-color);
    color: var(--text-color);
    font-family: var(--app-font-family);
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  .profile-backgrounds-harness {
    width: min(var(--ui-layout-1000, 1000px), 100%);
    margin: 0 auto;
    padding: var(--ui-space-24, 24px);
    display: grid;
    gap: var(--ui-space-24, 24px);
  }
  .profile-backgrounds-harness h1 {
    font-size: var(--ui-font-24, 24px);
    margin: 0;
  }
  .profile-backgrounds-harness > p {
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }
  .profile-backgrounds-harness__card {
    max-width: var(--ui-layout-560, 560px);
  }
  .profile-backgrounds-harness__page .chat-profile-content__hero {
    display: flex;
    flex-wrap: wrap;
    padding: var(--ui-space-24, 24px);
    gap: var(--ui-space-16, 16px);
  }
  .profile-backgrounds-harness__page .chat-profile-content__identity {
    padding: 0;
    border: 0;
    flex: 1;
    align-items: flex-start;
    background: transparent;
  }
  .profile-backgrounds-harness__page .chat-profile-content__identity-copy p {
    font-size: var(--ui-font-14, 14px);
    color: var(--desc-color);
    line-height: 1.7;
    margin: 0;
  }
  @media (max-width: 600px) {
    .profile-backgrounds-harness__page .chat-profile-content__identity {
      flex-basis: 100%;
    }
  }
</style>
