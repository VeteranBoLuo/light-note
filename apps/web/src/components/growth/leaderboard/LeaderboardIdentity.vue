<template>
  <div class="leaderboard-identity">
    <span class="identity-avatar" aria-hidden="true">
      <img
        v-if="entry.avatar && failedAvatar !== entry.avatar"
        :src="entry.avatar"
        alt=""
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        @error="failedAvatar = entry.avatar"
      />
      <SvgIcon v-else :src="icon.communityChat.defaultAvatar" size="32" />
    </span>
    <div class="identity-copy">
      <div class="identity-name">
        <strong :title="entry.nickname">{{ entry.nickname || t('growth.leaderboard.member') }}</strong>
        <BChip v-if="entry.isMe" tone="pin">{{ t('growth.leaderboard.you') }}</BChip>
        <BChip v-else-if="entry.champion" tone="pending">{{ t('growth.leaderboard.champion') }}</BChip>
      </div>
      <div class="identity-details">
        <span v-if="entry.communityId" class="identity-id">@{{ entry.communityId }}</span>
        <span v-else>{{ t('growth.leaderboard.identityPending') }}</span>
        <slot />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { LeaderboardEntry } from '@/api/pointsLeaderboardApi';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  defineProps<{ entry: LeaderboardEntry }>();
  const { t } = useI18n();
  const failedAvatar = ref<string | null>(null);
</script>

<style scoped lang="less">
  .leaderboard-identity {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    width: 100%;
    min-width: 0;
  }

  .identity-avatar {
    width: var(--ui-layout-32, 32px);
    height: var(--ui-layout-32, 32px);
    flex: none;
    overflow: hidden;
    border-radius: 50%;
    background: var(--workspace-purple-selected);
    display: grid;
    place-items: center;

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .identity-copy {
    display: grid;
    flex: 1;
    gap: var(--ui-space-2, 2px);
    min-width: 0;
  }

  .identity-name {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    min-width: 0;

    strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .identity-details {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--ui-space-2, 2px) var(--ui-space-8, 8px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.35;
    white-space: normal;
  }

  .identity-id {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    white-space: nowrap;
  }
</style>
