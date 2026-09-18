<template>
  <span ref="root" class="chat-inline-emoji-text" @dblclick="selectInlineEmoji" @click="selectInlineEmojiParagraph">
    <template v-for="(segment, index) in segments" :key="index">
      <span v-if="segment.type === 'text'">{{ segment.value }}</span>
      <span
        v-else
        data-emoji-atom
        class="chat-inline-emoji-text__atom"
        :style="{ width: `${bounds(segment.emoji.id)[1] * 2}em` }"
      >
        <img
          class="chat-inline-emoji-text__image"
          :src="segment.emoji.assetPath"
          :alt="emojiLabel(segment.emoji.id)"
          :title="emojiLabel(segment.emoji.id)"
          :data-inline-emoji-token="segment.emoji.token"
          width="24"
          height="24"
          draggable="false"
          decoding="async"
          :style="{
            left: `${-bounds(segment.emoji.id)[0] * 2}em`,
            clipPath: `inset(0 ${(1 - bounds(segment.emoji.id)[0] - bounds(segment.emoji.id)[1]) * 100}% 0 ${bounds(segment.emoji.id)[0] * 100}%)`,
          }"
        />
      </span>
    </template>
  </span>
</template>

<script setup lang="ts">
  import { parseCommunityChatInlineEmojiContent } from '@lightnote/shared/community-chat-inline-emojis';
  import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { inlineEmojiBounds } from './inlineEmojiBounds';
  import { selectInlineEmoji, selectInlineEmojiParagraph, syncInlineEmojiSelection } from './inlineEmojiSelection';

  const props = withDefaults(defineProps<{ content?: string }>(), { content: '' });
  const { t } = useI18n();
  const segments = computed(() => parseCommunityChatInlineEmojiContent(props.content));
  const root = ref<HTMLElement | null>(null);
  const bounds = (id: string) => inlineEmojiBounds[id] || [0, 1];
  const syncSelection = () => {
    if (root.value) syncInlineEmojiSelection(root.value);
  };
  onMounted(() => document.addEventListener('selectionchange', syncSelection));
  onBeforeUnmount(() => document.removeEventListener('selectionchange', syncSelection));

  function emojiLabel(id: string) {
    return t(`communityChat.emoji.jianTuanItems.${id}`);
  }
</script>

<style scoped lang="less">
  @import './inlineEmoji.less';

  .chat-inline-emoji-text {
    display: inline;
  }

  .chat-inline-emoji-text__image {
    position: absolute;
    top: -0.5em;
    width: 2em;
    height: 2em;
    max-width: none;
    margin: 0;
    object-fit: contain;
    pointer-events: auto;
    user-select: none;
  }
  .chat-inline-emoji-text__atom {
    .chat-emoji-selection();
    position: relative;
    display: inline-block;
    height: 1em;
    vertical-align: -0.12em;
  }
  .chat-inline-emoji-text::selection,
  .chat-inline-emoji-text :deep(::selection) {
    background: rgba(144, 198, 255, 0.55);
  }
</style>
