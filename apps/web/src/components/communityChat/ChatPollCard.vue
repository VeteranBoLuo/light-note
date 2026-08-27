<template>
  <section
    class="chat-poll-card"
    :class="{ 'is-closed': effectiveClosed, 'is-paused': participationPaused && !effectiveClosed }"
    :aria-label="t('communityChat.poll.cardLabel')"
  >
    <header class="chat-poll-card__header">
      <span class="chat-poll-card__mark" aria-hidden="true">
        <SvgIcon :src="icon.communityChat.poll" size="17" />
      </span>
      <span class="chat-poll-card__kind">{{ t('communityChat.poll.singleChoice') }}</span>
      <span class="chat-poll-card__state" :class="{ 'is-active': !effectiveClosed && !participationPaused }">
        {{ t(stateKey) }}
      </span>
    </header>

    <h3>{{ question }}</h3>

    <div class="chat-poll-card__options" role="group" :aria-label="t('communityChat.poll.optionsLabel')">
      <BButton
        v-for="option in poll.options"
        :key="option.publicId"
        class="chat-poll-card__option"
        :class="{ 'is-selected': option.publicId === poll.selectedOptionPublicId }"
        :disabled="!canChooseOption || option.publicId === poll.selectedOptionPublicId"
        :loading="busyOptionPublicId === option.publicId"
        :aria-pressed="option.publicId === poll.selectedOptionPublicId"
        @click="emit('vote', option.publicId)"
      >
        <span
          class="chat-poll-card__choice"
          :class="{ 'is-selected': option.publicId === poll.selectedOptionPublicId }"
          aria-hidden="true"
        >
          <SvgIcon v-if="option.publicId === poll.selectedOptionPublicId" :src="icon.filterPanel.check" size="12" />
        </span>
        <span class="chat-poll-card__option-copy">
          <span>{{ option.label }}</span>
          <span v-if="poll.resultsVisible" class="chat-poll-card__bar" aria-hidden="true">
            <i :style="{ width: `${optionPercentage(option)}%` }"></i>
          </span>
        </span>
        <span v-if="poll.resultsVisible" class="chat-poll-card__count">
          {{
            t('communityChat.poll.optionResult', { percent: optionPercentage(option), count: option.voteCount || 0 })
          }}
        </span>
      </BButton>
    </div>

    <footer class="chat-poll-card__footer">
      <div>
        <span>{{ deadlineLabel }}</span>
        <span v-if="participationPaused && !effectiveClosed">{{ t('communityChat.poll.participationPaused') }}</span>
        <span v-else-if="poll.canVote && !effectiveClosed">
          {{ t(poll.selectedOptionPublicId ? 'communityChat.poll.changeVoteHint' : 'communityChat.poll.voteHint') }}
        </span>
        <span v-if="poll.resultsVisible">
          {{ t('communityChat.poll.totalVotes', { count: poll.totalVoterCount || 0 }) }}
        </span>
        <span v-else>{{ t('communityChat.poll.resultsAfterClose') }}</span>
      </div>
      <BTooltip v-if="poll.canClose && !effectiveClosed" :title="t('communityChat.poll.closeHint')" :delay="80">
        <BButton size="small" :loading="closing" :disabled="Boolean(busyOptionPublicId)" @click="emit('close')">
          {{ t('communityChat.poll.closeAction') }}
        </BButton>
      </BTooltip>
    </footer>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatPoll, CommunityChatPollOption } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = withDefaults(
    defineProps<{
      question: string;
      poll: CommunityChatPoll;
      now?: number;
      busyOptionPublicId?: string;
      closing?: boolean;
      participationPaused?: boolean;
    }>(),
    {
      now: 0,
      busyOptionPublicId: '',
      closing: false,
      participationPaused: false,
    },
  );
  const emit = defineEmits<{
    vote: [optionPublicId: string];
    close: [];
  }>();
  const { t, locale } = useI18n();

  const deadlineTimestamp = computed(() => new Date(props.poll.endsAt).getTime());
  const effectiveClosed = computed(
    () => props.poll.closed || (Number.isFinite(deadlineTimestamp.value) && props.now >= deadlineTimestamp.value),
  );
  const stateKey = computed(() =>
    effectiveClosed.value
      ? 'communityChat.poll.closed'
      : props.participationPaused
        ? 'communityChat.poll.paused'
        : 'communityChat.poll.active',
  );
  const canChooseOption = computed(
    () =>
      props.poll.canVote &&
      !props.participationPaused &&
      !effectiveClosed.value &&
      !props.busyOptionPublicId &&
      !props.closing,
  );
  const deadlineLabel = computed(() => {
    const formatted = Number.isFinite(deadlineTimestamp.value)
      ? new Intl.DateTimeFormat(locale.value, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(deadlineTimestamp.value))
      : '';
    if (effectiveClosed.value) {
      const reason = props.poll.closeReason === 'manual' ? 'manual' : 'deadline';
      return t(`communityChat.poll.closedAt.${reason}`, { time: formatted });
    }
    return t('communityChat.poll.endsAt', { time: formatted });
  });

  function optionPercentage(option: CommunityChatPollOption) {
    const total = Math.max(0, Number(props.poll.totalVoterCount || 0));
    if (!total) return 0;
    return Math.round((Math.max(0, Number(option.voteCount || 0)) / total) * 100);
  }
</script>

<style scoped lang="less">
  .chat-poll-card {
    width: min(430px, 72vw);
    min-width: min(330px, 72vw);
    padding: 13px;
    box-sizing: border-box;
    display: grid;
    gap: 11px;
    border: 1px solid var(--primary-color);
    border-radius: 15px;
    color: var(--text-color);
    background: var(--card-background);
  }

  .chat-poll-card.is-closed,
  .chat-poll-card.is-paused {
    border-color: var(--surface-border-color);
  }

  .chat-poll-card__header,
  .chat-poll-card__footer,
  .chat-poll-card__footer > div {
    display: flex;
    align-items: center;
  }

  .chat-poll-card__header {
    gap: 7px;
  }

  .chat-poll-card__mark {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 9px;
    color: var(--primary-color);
  }

  .chat-poll-card__kind,
  .chat-poll-card__state {
    font-size: 10px;
    font-weight: 700;
  }

  .chat-poll-card__kind {
    color: var(--desc-color);
  }

  .chat-poll-card__state {
    margin-left: auto;
    padding: 2px 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--desc-color);
  }

  .chat-poll-card__state.is-active {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  .chat-poll-card h3 {
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  .chat-poll-card__options {
    display: grid;
    gap: 7px;
  }

  .chat-poll-card__option {
    width: 100%;
    min-height: 42px;
    height: auto;
    padding: 7px 9px !important;
    display: flex;
    justify-content: flex-start;
    gap: 8px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 11px;
    color: var(--text-color) !important;
    background: var(--workspace-panel-bg-color) !important;
    line-height: 1.35;
    text-align: left;
    white-space: normal;
  }

  .chat-poll-card__option.is-selected {
    border-color: var(--primary-color) !important;
    color: var(--primary-color) !important;
  }

  .chat-poll-card__option:disabled {
    opacity: 1;
    cursor: default;
  }

  .chat-poll-card__choice {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    color: #fff;
    background: var(--card-background);
  }

  .chat-poll-card__choice.is-selected {
    border-color: var(--primary-color);
    background: var(--primary-color);
  }

  .chat-poll-card__option-copy {
    min-width: 0;
    flex: 1 1 auto;
    display: grid;
    gap: 5px;
    overflow-wrap: anywhere;
  }

  .chat-poll-card__bar {
    width: 100%;
    height: 3px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-border-color);
  }

  .chat-poll-card__bar i {
    height: 100%;
    display: block;
    border-radius: inherit;
    background: var(--primary-color);
    transition: width 0.2s ease;
  }

  .chat-poll-card__count {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 9px;
  }

  .chat-poll-card__footer {
    justify-content: space-between;
    gap: 10px;
    color: var(--desc-color);
  }

  .chat-poll-card__footer > div {
    min-width: 0;
    flex-wrap: wrap;
    gap: 3px 9px;
    font-size: 9px;
  }

  @media (max-width: 767px) {
    .chat-poll-card {
      width: min(100%, 320px);
      min-width: min(280px, 75vw);
      padding: 11px;
    }

    .chat-poll-card__option {
      min-height: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chat-poll-card__bar i {
      transition: none;
    }
  }
</style>
