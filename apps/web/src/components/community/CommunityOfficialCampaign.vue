<template>
  <section class="official-campaigns" v-if="entry || tasks.length"
    ><article v-if="entry" class="official-campaign">
      <BButton class="official-campaign-link" @click="router.push(path)">
        <img src="/brand-scenes/campaign.webp" alt="" />
        <span class="official-campaign-copy">
          <small>{{ t('community.feed.officialPinned') }} · {{ t('community.feed.rechargeActivity') }}</small>
          <strong>{{ entry.title }}</strong>
          <span>{{ entry.description }}</span>
        </span>
      </BButton>
      <div class="official-campaign-footer">
        <BButton class="official-campaign-action" @click="router.push(path)"
          >{{ t('community.feed.viewCampaign') }} →</BButton
        >
        <BButton v-if="user.role === 'root'" class="campaign-manage-action" @click="manager = true">{{
          t('community.feed.rechargeManagement')
        }}</BButton>
      </div>
    </article>
    <article
      v-for="topic in tasks"
      :key="topic.slug"
      class="official-campaign task-campaign"
      :class="{ 'has-reward': topic.reward }"
    >
      <BButton class="official-campaign-link" @click="router.push('/community/topics/' + topic.slug)">
        <img :src="communityTopicCover(topic.slug) || '/brand-scenes/autumn-vista.webp'" alt="" />
        <span class="official-campaign-copy"
          ><small
            >{{ t('community.feed.officialPinned') }} ·
            {{ t(topic.postTask ? 'community.feed.postTask' : 'community.feed.topicBrowse') }}</small
          >
          <strong>{{ locale.startsWith('en') ? topic.nameEn : topic.nameZh }}</strong>
          <span>{{ locale.startsWith('en') ? topic.descriptionEn : topic.descriptionZh }}</span>
        </span>
      </BButton>
      <CommunityTaskReward
        v-if="topic.reward"
        compact
        :topic="topic"
        @claimed="$emit('claimed')"
        @participate="$emit('participate', topic.slug)"
      />
      <BButton v-else class="official-campaign-action" @click="$emit('participate', topic.slug)"
        >{{ t(user.adminContext ? 'community.feed.topicBrowse' : 'community.feed.joinTopic') }} →</BButton
      >
    </article></section
  >
  <CommunityCampaignManager v-if="manager" @close="manager = false" />
</template>
<script setup lang="ts">
  import { communityTopicCover } from '@/config/communityTopicCovers';
  import CommunityTaskReward from './CommunityTaskReward.vue';
  defineEmits<{ claimed: []; participate: [topic: string] }>();
  import { computed, ref } from 'vue';
  import { useUserStore } from '@/store';
  import CommunityCampaignManager from './CommunityCampaignManager.vue';
  const user = useUserStore();
  const manager = ref(false);
  import type { FeedTopic } from '@/api/communityFeedApi';
  const props = defineProps<{ topics?: FeedTopic[] }>();
  const tasks = computed(() => (props.topics || []).filter((t) => t.officialPinned));
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { useCampaignEntry } from '@/composables/useCampaignEntry';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  const { entry, path } = useCampaignEntry();
  const router = useRouter();
  const { t, locale } = useI18n();
</script>
<style scoped>
  .official-campaigns {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-16, 16px);
    margin: var(--ui-space-4, 4px) 0 var(--ui-space-24, 24px);
  }
  .official-campaign {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: var(--ui-space-20, 20px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--background-color);
  }
  .official-campaign-link.b_btn {
    display: flex;
    flex-direction: row;
    flex: 1;
    align-items: stretch;
    gap: var(--ui-space-18, 18px);
    width: 100%;
    height: auto;
    padding: 0;
    border: 0;
    border-radius: 0;
    text-align: left;
    background: transparent;
    white-space: normal;
  }
  .official-campaign-link img {
    display: block;
    width: 34%;
    max-width: var(--ui-layout-300, 300px);
    height: auto;
    align-self: center;
    border-radius: 8px;
    flex-shrink: 0;
  }
  .official-campaign-copy {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-space-8, 8px);
    color: var(--text-color);
  }
  .official-campaign-copy small {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .official-campaign-copy strong {
    font-size: var(--ui-font-18, 18px);
    line-height: 1.5;
  }
  .official-campaign-copy > span {
    font-size: var(--ui-font-13, 13px);
    line-height: 1.65;
    color: var(--desc-color);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .official-campaign-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    flex-wrap: wrap;
  }
  .campaign-manage-action.b_btn {
    align-self: flex-end;
    margin-top: var(--ui-space-8, 8px);
    height: var(--ui-layout-28, 28px);
    font-size: var(--ui-font-12, 12px);
    color: var(--primary-color);
    background: transparent;
  }
  .official-campaign-action.b_btn {
    align-self: flex-start;
    margin-top: var(--ui-space-8, 8px);
    padding: var(--ui-space-4, 4px) 0;
    height: var(--ui-layout-36, 36px);
    background: transparent;
    color: var(--primary-color);
    font-size: var(--ui-font-13, 13px);
  }
  .task-campaign :deep(.task-reward) {
    margin-top: var(--ui-space-16, 16px);
    padding: var(--ui-space-14, 14px) 0 0;
    border-top: 1px solid var(--surface-border-color);
  }
  .task-campaign :deep(.task-reward-eyebrow) {
    display: none;
  }
  .task-campaign :deep(.task-reward-action) {
    max-width: none;
  }
  @media (max-width: 767px) {
    .official-campaigns {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }
    .official-campaign {
      padding: 16px;
    }
    .official-campaign-link.b_btn {
      flex-direction: column;
      gap: 12px;
    }
    .official-campaign-link img {
      width: 100%;
      max-width: none;
    }
    .official-campaign-copy strong {
      font-size: 17px;
    }
  }
</style>
