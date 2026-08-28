<template>
  <span class="chat-inline-emoji-text">
    <template v-for="(segment, index) in segments" :key="index">
      <span v-if="segment.type === 'text'">{{ segment.value }}</span>
      <img
        v-else
        class="chat-inline-emoji-text__image"
        :src="segment.emoji.assetPath"
        :alt="emojiLabel(segment.emoji.id)"
        :title="emojiLabel(segment.emoji.id)"
        width="24"
        height="24"
        draggable="false"
        decoding="async"
      />
    </template>
  </span>
</template>

<script setup lang="ts">
  import { parseCommunityChatInlineEmojiContent } from '@lightnote/shared/community-chat-inline-emojis';
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';

  const props = withDefaults(defineProps<{ content?: string }>(), { content: '' });
  const { t } = useI18n();
  const segments = computed(() => parseCommunityChatInlineEmojiContent(props.content));

  function emojiLabel(id: string) {
    return t(`communityChat.emoji.jianTuanItems.${id}`);
  }
</script>

<style scoped lang="less">
  .chat-inline-emoji-text {
    display: inline;
  }

  .chat-inline-emoji-text__image {
    width: 1.62em;
    height: 1.62em;
    margin-inline: 0.04em;
    display: inline-block;
    vertical-align: -0.27em;
    object-fit: contain;
    user-select: none;
  }
</style>
