<template>
  <section
    v-if="topic.reward"
    class="task-reward"
    :class="{ 'is-claimed': state === 'claimed', 'is-compact': compact }"
  >
    <div class="task-reward-copy">
      <span class="task-reward-eyebrow">{{ t('community.feed.activityReward') }}</span>
      <div class="task-reward-amount"
        ><strong v-if="topic.reward.exp">{{ topic.reward.exp }} <small>EXP</small></strong
        ><strong v-if="topic.reward.points"
          >{{ topic.reward.points }} <small>{{ t('community.feed.rewardPoints') }}</small></strong
        ></div
      >
      <p>{{ t('community.feed.reward_' + state) }}</p>
      <small v-if="!compact" class="task-reward-date">{{ period }} · {{ t('community.feed.rewardOnce') }}</small>
    </div>
    <div class="task-reward-action">
      <BButton v-if="state === 'claimable'" type="primary" :loading="busy" @click="claim">{{
        t('community.feed.claimReward')
      }}</BButton>
      <span v-else-if="state === 'claimed'" class="task-reward-done">✓ {{ t('community.feed.rewardClaimed') }}</span>
      <BButton v-else-if="state === 'active'" @click="$emit('participate')"
        >{{ t('community.feed.joinTopic') }} →</BButton
      >
      <small v-if="state === 'claimable' && !compact">{{ t('community.feed.rewardSharedClaim') }}</small>
      <p v-if="error" role="alert">{{ t('community.feed.rewardClaimFailed') }}</p>
    </div>
  </section>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { FeedTopic } from '@/api/communityFeedApi';
  import { useUserStore } from '@/store';
  import { useGrowth } from '@/composables/useGrowth';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  const props = defineProps<{ topic: FeedTopic; compact?: boolean }>();
  const emit = defineEmits<{ claimed: []; participate: [] }>();
  const { t, locale } = useI18n();
  const growth = useGrowth();
  const user = useUserStore();
  let generation = 0;
  watch(
    () => [user.id, props.topic.slug],
    () => {
      generation++;
      claimed.value = false;
      busy.value = false;
      error.value = false;
    },
  );
  onBeforeUnmount(() => generation++);
  const busy = ref(false),
    error = ref(false),
    claimed = ref(false);
  const state = computed(() => (claimed.value ? 'claimed' : props.topic.reward?.state || 'active'));
  const period = computed(() =>
    [props.topic.reward?.startsAt, props.topic.reward?.endsAt]
      .map((value) =>
        value
          ? new Date(value).toLocaleDateString(locale.value, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '',
      )
      .join(' — '),
  );
  async function claim() {
    if (busy.value) return;
    const current = generation;
    busy.value = true;
    error.value = false;
    try {
      const result = await growth.claimAllRewards(['community'], [props.topic.slug]);
      if (current !== generation) return;
      if (
        result?.status !== 200 ||
        !result.data?.ok ||
        !result.data.receipts?.some((r) => r.key === props.topic.slug && ['claimed', 'already'].includes(r.status))
      )
        throw new Error('claim');
      claimed.value = true;
      emit('claimed');
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) busy.value = false;
    }
  }
</script>
<style scoped>
  .task-reward {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 22px 0;
    border-top: 1px solid var(--surface-border-color);
    margin-top: 16px;
  }
  .task-reward-copy {
    min-width: 0;
  }
  .task-reward-eyebrow,
  .task-reward-date,
  .task-reward-action small {
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.6;
  }
  .task-reward-amount {
    display: flex;
    gap: 22px;
    align-items: baseline;
    margin: 7px 0;
  }
  .task-reward-amount strong {
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.5px;
    color: var(--text-color);
  }
  .task-reward-amount small {
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0;
    color: var(--desc-color);
  }
  .task-reward-copy p {
    margin: 4px 0;
    font-size: 13px;
    color: var(--text-color);
    line-height: 1.6;
  }
  .task-reward-action {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    max-width: 220px;
  }
  .task-reward-action small {
    text-align: right;
  }
  .task-reward-done {
    color: var(--primary-color);
    font-size: 13px;
    white-space: nowrap;
  }
  .task-reward-action p {
    color: var(--danger-color);
    font-size: 12px;
  }
  .task-reward.is-compact {
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }
  .is-compact .task-reward-amount {
    gap: 16px;
  }
  .is-compact .task-reward-amount strong {
    font-size: 22px;
  }
  .is-compact .task-reward-copy p {
    font-size: 12px;
  }
  @media (max-width: 767px) {
    .task-reward {
      align-items: flex-start;
      flex-direction: column;
      gap: 14px;
      padding: 18px 0;
    }
    .task-reward-action {
      align-items: flex-start;
      max-width: 100%;
    }
    .task-reward-action small {
      text-align: left;
    }
    .task-reward-amount strong {
      font-size: 24px;
    }
  }
</style>
