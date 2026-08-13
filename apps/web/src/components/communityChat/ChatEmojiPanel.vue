<template>
  <section class="chat-emoji-panel" :class="{ 'is-embedded': embedded }" :aria-label="t('communityChat.emoji.title')">
    <nav class="chat-emoji-panel__categories" :aria-label="t('communityChat.emoji.categories')">
      <BButton
        v-for="category in categories"
        :key="category.key"
        size="small"
        :class="{ 'is-active': activeCategory === category.key }"
        :aria-label="t(`communityChat.emoji.category.${category.key}`)"
        :title="t(`communityChat.emoji.category.${category.key}`)"
        @click="activeCategory = category.key"
      >
        {{ category.icon }}
      </BButton>
    </nav>
    <div class="chat-emoji-panel__heading">
      <strong>{{ t(`communityChat.emoji.category.${activeCategory}`) }}</strong>
    </div>
    <div v-if="activeEmojis.length" class="chat-emoji-panel__grid">
      <BButton
        v-for="emoji in activeEmojis"
        :key="emoji"
        :aria-label="emoji"
        :title="emoji"
        @click="emit('select', emoji)"
      >
        {{ emoji }}
      </BButton>
    </div>
    <p v-else class="chat-emoji-panel__empty">{{ t('communityChat.emoji.recentEmpty') }}</p>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { COMMUNITY_CHAT_EMOJI_CATEGORIES, type CommunityChatEmojiCategory } from '@/config/communityChatEmoji';

  const props = withDefaults(defineProps<{ recent?: string[]; embedded?: boolean }>(), {
    recent: () => [],
    embedded: false,
  });
  const emit = defineEmits<{ select: [emoji: string] }>();
  const { t } = useI18n();
  const activeCategory = ref<CommunityChatEmojiCategory['key']>(props.recent.length ? 'recent' : 'smileys');
  const categories = computed<CommunityChatEmojiCategory[]>(() => [
    { key: 'recent', icon: '🕘', emojis: props.recent },
    ...COMMUNITY_CHAT_EMOJI_CATEGORIES,
  ]);
  const activeEmojis = computed(
    () => categories.value.find((category) => category.key === activeCategory.value)?.emojis || [],
  );

  watch(
    () => props.recent.length,
    (length) => {
      if (!length && activeCategory.value === 'recent') activeCategory.value = 'smileys';
    },
  );
</script>

<style scoped lang="less">
  .chat-emoji-panel {
    width: min(360px, 100%);
    height: min(380px, 42vh);
    min-height: 260px;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
    box-shadow: var(--workspace-panel-shadow);
  }

  .chat-emoji-panel__categories {
    display: flex;
    gap: 2px;
    padding: 7px;
    overflow-x: auto;
    border-bottom: 1px solid var(--surface-border-color);
  }

  .chat-emoji-panel__categories .b_btn {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    font-size: 17px;
    border-radius: 8px;
    transition: background-color 120ms ease;
  }

  .chat-emoji-panel__categories .b_btn:not(.is-active):hover {
    border-color: transparent;
    background: var(--hover-background);
  }

  .chat-emoji-panel__categories .b_btn.is-active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .chat-emoji-panel__heading {
    padding: 8px 11px 3px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .chat-emoji-panel__grid {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    align-content: start;
    gap: 4px 2px;
    padding: 6px 10px 10px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .chat-emoji-panel__grid .b_btn {
    width: 100%;
    min-width: 0;
    height: 42px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    font-size: 22px;
    line-height: 1;
    transition: background-color 120ms ease;
  }

  .chat-emoji-panel__grid .b_btn:hover {
    border-color: transparent;
    background: var(--hover-background);
  }

  .chat-emoji-panel__grid .b_btn:focus-visible {
    border-color: var(--primary-color);
    background: var(--hover-background);
    outline: none;
  }

  .chat-emoji-panel__empty {
    margin: 0;
    display: grid;
    place-items: center;
    color: var(--desc-color);
    font-size: 12px;
  }

  html.light-note-mobile-rendering .chat-emoji-panel {
    width: 100%;
    height: min(300px, 38vh);
    min-height: 220px;
    border-radius: 12px;
    box-shadow: none;
  }

  html.light-note-mobile-rendering .chat-emoji-panel__grid {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }

  .chat-emoji-panel.is-embedded,
  html.light-note-mobile-rendering .chat-emoji-panel.is-embedded {
    width: 100%;
    height: 100%;
    min-height: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
</style>
