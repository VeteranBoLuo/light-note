<template>
  <div class="community-context">
    <section v-if="topics?.length">
      <h2>{{ t('community.feed.topicBrowse') }}</h2>
      <BSelect
        v-if="(topics?.length || 0) > 6"
        :value="selectedTopic || ''"
        :options="[{ value: '', label: t('community.feed.allTopics') }, ...(topics || [])]"
        show-search
        :aria-label="t('community.feed.topicBrowse')"
        :placeholder="t('community.feed.topicSearch')"
        @update:value="$emit('topic', String($event || ''))"
      />
      <template v-else
        ><BButton class="context-topic" :aria-pressed="!selectedTopic" @click="$emit('topic', '')">{{
          t('community.feed.allTopics')
        }}</BButton>
        <BButton
          v-for="topic in topics"
          :key="topic.value"
          class="context-topic"
          :aria-pressed="selectedTopic === topic.value"
          @click="$emit('topic', selectedTopic === topic.value ? '' : topic.value)"
          ><span aria-hidden="true">#</span>{{ topic.label }}</BButton
        >
      </template>
    </section>
    <section>
      <h2>{{ t('community.feed.communityWelcome') }}</h2>
      <p>{{ t('community.feed.communityWelcomeHint') }}</p>
      <BButton type="text" class="context-link" @click="router.push(chat ? '/community/feed' : '/community/chat')"
        >{{ t(chat ? 'community.feed.title' : 'community.feed.visitChat') }} →</BButton
      >
    </section>
    <section
      ><h2>{{ t('community.feed.communityNote') }}</h2
      ><p>{{ t('community.feed.communityNoteHint') }}</p></section
    >
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  defineProps<{ chat?: boolean; topics?: { value: string; label: string }[]; selectedTopic?: string }>();
  defineEmits<{ topic: [value: string] }>();
  const { t } = useI18n();
  const router = useRouter();
</script>
<style scoped>
  .community-context section {
    padding-bottom: var(--ui-space-28, 28px);
    margin-bottom: var(--ui-space-28, 28px);
    border-bottom: 1px solid var(--workspace-divider);
  }
  .community-context section:last-child {
    border-bottom: 0;
  }
  .community-context h2 {
    margin: 0 0 var(--ui-space-18, 18px);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.6;
  }
  .community-context p {
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.9;
  }
  .context-topic {
    width: 100%;
    justify-content: flex-start;
    gap: var(--ui-space-10, 10px);
    background: transparent;
    margin: var(--ui-space-4, 4px) 0;
    outline: 1px solid transparent;
    outline-offset: 0;
    transition:
      color 0.2s,
      background-color 0.2s;
  }
  .context-topic:focus-visible {
    outline: 1px solid var(--workspace-purple-text);
    outline-offset: 2px;
  }
  .context-topic span,
  .context-link {
    color: var(--workspace-purple-text);
  }
  .context-topic[aria-pressed='true'] {
    color: var(--workspace-purple-text);
    background: var(--workspace-hover);
    outline: 1px solid var(--workspace-purple-text);
  }
  .context-link {
    background: transparent;
    padding-left: 0;
  }
</style>
