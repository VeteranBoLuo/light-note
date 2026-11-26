<template>
  <div class="leaderboard-identity">
    <component
      :is="entry.communityId ? BButton : 'div'"
      :type="entry.communityId ? 'text' : undefined"
      :aria-label="entry.communityId ? t('communityChat.profile.view', { name: displayName }) : undefined"
      :aria-haspopup="entry.communityId ? 'dialog' : undefined"
      class="identity-main"
      @click="openProfile"
    >
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
      <span class="identity-copy">
        <span class="identity-name">
          <strong :title="displayName">{{ displayName }}</strong>
          <BChip v-if="entry.isMe" tone="pin">{{ t('growth.leaderboard.you') }}</BChip>
          <BChip v-else-if="entry.champion" tone="pending">{{ t('growth.leaderboard.champion') }}</BChip>
        </span>
        <span v-if="entry.communityId" class="identity-id">@{{ entry.communityId }}</span>
        <span v-else class="identity-id-placeholder">{{ t('growth.leaderboard.identityPending') }}</span>
      </span>
    </component>
    <div v-if="$slots.default" class="identity-details"><slot /></div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { LeaderboardEntry } from '@/api/pointsLeaderboardApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = defineProps<{ entry: LeaderboardEntry }>();
  const emit = defineEmits<{ profile: [communityId: string, trigger: HTMLElement] }>();
  const { t } = useI18n();
  const failedAvatar = ref<string | null>(null);
  const displayName = computed(() => props.entry.nickname || t('growth.leaderboard.member'));

  function openProfile(event: MouseEvent) {
    if (props.entry.communityId && event.currentTarget instanceof HTMLElement) {
      emit('profile', props.entry.communityId, event.currentTarget);
    }
  }
</script>

<style scoped lang="less">
  .leaderboard-identity {
    width: 100%;
    min-width: 0;
  }

  .identity-main,
  .identity-main.b_btn {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--ui-space-8, 8px);
    max-width: 100%;
    min-width: 0;
    height: auto;
    padding: 0;
    line-height: 1.35;
    text-align: left;
    color: var(--text-color);
  }

  @media (hover: hover) and (pointer: fine) {
    .identity-main.b_btn:not(:disabled):hover {
      text-decoration: none;

      strong {
        color: var(--primary-color);
      }
    }
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

  .identity-id,
  .identity-id-placeholder,
  .identity-details {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.35;
  }

  .identity-details {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--ui-space-2, 2px) var(--ui-space-8, 8px);
    margin-inline-start: calc(var(--ui-layout-32, 32px) + var(--ui-space-8, 8px));
    white-space: normal;
  }

  .identity-id {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    white-space: nowrap;
  }
</style>
