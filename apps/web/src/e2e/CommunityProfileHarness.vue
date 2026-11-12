<template>
  <main class="community-profile-harness">
    <h1>社区名片 · 隔离验收</h1>
    <p>仅使用内存示例数据，所有操作均不连接真实后端。</p>
    <BButton @click="visible = true">重新打开名片</BButton>
    <output>{{ events.join(' | ') }}</output>
    <ChatUserProfileModal
      v-model:visible="visible"
      :profile="profile"
      :actions-profile="{ isOwn, following: false }"
      :authenticated="state !== 'visitor'"
      :is-own="isOwn"
      :loading="loading"
      :error="error"
      :all-achievements="allAchievements"
      :all-achievements-loading="allLoading"
      :all-achievements-error="allError"
      :session-key="sessionKey"
      @retry="retry"
      @navigate="navigate"
      @login="finish('login')"
      @block="finish('block')"
      @report="finish('report')"
      @load-all-achievements="loadAll"
    />
  </main>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatAuthorProfile, CommunityChatPublicAchievement } from '@/api/communityChatApi';
  import ChatUserProfileModal from '@/components/communityChat/ChatUserProfileModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  const params = new URLSearchParams(location.search);
  const state = params.get('state') || 'member';
  const { locale } = useI18n();
  const english = locale.value === 'en-US';
  const isOwn = state === 'own';
  const decorated = isOwn || state === 'decorated';
  const framed = decorated || ['framed', 'long', 'moderator'].includes(state);
  const visible = ref(true);
  const loading = ref(state === 'loading');
  const error = ref(state === 'error');
  const events = ref<string[]>([]);
  const sessionKey = ref(1);
  const allAchievements = ref<CommunityChatPublicAchievement[] | null>(null);
  const allLoading = ref(false);
  const allError = ref(false);
  const achievements = [
    { key: 'join_365', group: 'tenure' },
    { key: 'level_15', group: 'level' },
    { key: 'note_500', group: 'create' },
    { key: 'join_7', group: 'tenure' },
  ];
  const profile: CommunityChatAuthorProfile = {
    name:
      state === 'long'
        ? english
          ? 'A very long community nickname for layout review'
          : '认真记录每天新想法与生活片段的社区成员'
        : isOwn
          ? '菠萝'
          : '理可 LIKO',
    userPublicId: 'profile-fixture',
    communityId: isOwn ? 'ln_WC84UR' : 'ln_4NP592',
    role: isOwn || state === 'official' ? 'official' : state === 'moderator' ? 'moderator' : 'member',
    avatar: '',
    frameId: framed ? 'frame_celestial' : null,
    frameRarity: framed ? 'legendary' : null,
    level: framed ? 15 : 2,
    levelName: framed ? (english ? 'Literary Sage' : '文圣') : english ? 'Scholar' : '书生',
    title: null,
    backgroundId: decorated ? params.get('art') || 'background_coast' : null,
    bio:
      state === 'member' || state === 'empty'
        ? ''
        : english
          ? 'Building Light Note and improving its experience. Ideas and suggestions are welcome.'
          : '轻笺开发者，持续完善产品体验，欢迎交流问题、建议和新想法。',
    communityTenureLabel: english ? 'Joined Light Note about 3 months ago' : '加入轻笺约 3 个月',
    achievements: state === 'empty' ? [] : achievements.slice(0, framed ? 3 : 2),
    achievementCount: state === 'empty' ? 0 : framed ? 34 : 10,
    hasMoreAchievements: state !== 'empty',
  };

  function finish(event: string) {
    events.value.push(event);
    visible.value = false;
  }
  function navigate(path: string) {
    finish(`navigate:${path}`);
  }
  function retry() {
    error.value = false;
    events.value.push('retry');
  }
  function loadAll() {
    events.value.push('achievements');
    allLoading.value = state === 'achievements-loading';
    allError.value = state === 'achievements-error';
    allAchievements.value = achievements;
  }
  watch(visible, (open) => {
    if (open) sessionKey.value += 1;
  });
</script>

<style lang="less">
  html,
  body,
  #app {
    margin: 0;
    min-height: 100%;
  }
  body {
    background: var(--background-color);
    color: var(--text-color);
    font-family: var(--app-font-family);
  }
  .community-profile-harness {
    padding: var(--ui-space-24, 24px);
    display: grid;
    justify-items: start;
    gap: var(--ui-space-16, 16px);
  }
</style>
