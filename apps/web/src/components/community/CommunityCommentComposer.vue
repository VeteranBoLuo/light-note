<template>
  <section class="comment-composer" @keydown.esc.stop="emojiOpen = false">
    <div v-if="replying" class="comment-reply-quote">
      <div
        ><strong>{{ t('community.feed.reply') }} {{ replying }}</strong
        ><ChatInlineEmojiText :content="quote || ''"
      /></div>
      <BButton :disabled="busy" :aria-label="t('community.feed.cancelReply')" @click="$emit('cancel-reply')">×</BButton>
    </div>
    <ChatComposerInput
      ref="input"
      :value="modelValue"
      :submit-on-enter="false"
      :maxlength="1200"
      :rows="3"
      :disabled="busy"
      :aria-label="placeholder"
      :placeholder="placeholder"
      @update:value="updateBody"
    />
    <div class="comment-composer-tools">
      <BPopover
        v-model:open="emojiOpen"
        :disabled="busy"
        placement="top-left"
        overlay-class-name="comment-emoji-popover"
      >
        <BButton
          class="comment-emoji-trigger"
          :disabled="busy"
          :aria-label="t('communityChat.emoji.title')"
          :aria-expanded="emojiOpen"
        >
          <SvgIcon :src="icon.noteDetail.toolbar.emoji" size="20" />
        </BButton>
        <template #content>
          <div class="comment-emoji-panel">
            <ChatEmojiPanel :recent="recent" embedded @select="insertEmoji" />
          </div>
        </template>
      </BPopover>
      <small>{{ Array.from(modelValue).length }} / 1200</small>
      <BButton
        type="primary"
        :loading="busy"
        :disabled="!modelValue.trim() || Array.from(modelValue.trim()).length > 1200"
        @click="$emit('submit')"
        >{{ t(replying ? 'community.feed.reply' : 'community.feed.comment') }}</BButton
      >
    </div>
  </section>
</template>
<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import ChatComposerInput from '@/components/communityChat/ChatComposerInput.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import ChatEmojiPanel from '@/components/communityChat/ChatEmojiPanel.vue';
  import ChatInlineEmojiText from '@/components/communityChat/ChatInlineEmojiText.vue';
  import { useCommunityChatEmojiRecent } from '@/composables/useCommunityChatEmojiRecent';
  const props = defineProps<{ modelValue: string; busy: boolean; replying?: string; quote?: string }>();
  const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: []; 'cancel-reply': [] }>();
  const { t } = useI18n();
  const user = useUserStore();
  const { recent, remember } = useCommunityChatEmojiRecent(computed(() => String(user.id || '')));
  const input = ref<InstanceType<typeof ChatComposerInput>>();
  const emojiOpen = ref(false);
  const placeholder = computed(() =>
    props.replying ? `${t('community.feed.reply')} ${props.replying}…` : t('community.feed.replyPlaceholder'),
  );
  function updateBody(value: string) {
    emit('update:modelValue', value);
  }
  async function insertEmoji(emoji: string) {
    const selection = input.value?.getSelectionRange();
    const start = selection?.start ?? props.modelValue.length;
    const end = selection?.end ?? start;
    const value = props.modelValue.slice(0, start) + emoji + props.modelValue.slice(end);
    if (Array.from(value).length > 1200 || !input.value?.replaceSelection(emoji)) return;
    remember(emoji);
    emojiOpen.value = false;
    await nextTick();
    input.value?.focus();
  }
  watch(
    () => props.replying,
    async (replying) => {
      if (replying) {
        await nextTick();
        input.value?.focus();
      }
    },
  );
</script>
<style scoped lang="less">
  .comment-composer {
    margin: var(--ui-space-12, 12px) 0;
    padding: var(--ui-space-12, 12px);
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
  }
  .comment-composer:focus-within {
    border-color: var(--primary-color);
  }
  .comment-composer :deep(.chat-composer-input__plain .b-textarea),
  .comment-composer :deep(.b-textarea),
  .comment-composer :deep(.b-textarea:focus),
  .comment-composer :deep(.b-textarea:hover) {
    border: 0;
    box-shadow: none;
    background: transparent;
    outline: none;
    resize: none;
    height: var(--ui-layout-84, 84px);
    min-height: var(--ui-layout-84, 84px);
    max-height: var(--ui-layout-84, 84px);
    overflow-y: auto;
    word-break: break-all;
    padding: var(--ui-space-4, 4px) var(--ui-space-11, 11px) !important;
    font-size: 14px;
    line-height: 1.6;
  }
  .comment-composer-tools {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    margin-top: var(--ui-space-8, 8px);
  }
  .comment-composer-tools .comment-emoji-trigger {
    background: transparent;
    border: 0;
    padding: var(--ui-space-4, 4px);
    color: var(--desc-color);
  }
  .comment-composer-tools small {
    margin-left: auto;
    color: var(--desc-color);
  }
  .comment-emoji-panel {
    width: min(var(--ui-layout-360, 360px), calc(100vw - var(--ui-layout-24, 24px)));
    height: min(var(--ui-layout-320, 320px), calc(100vh - var(--ui-layout-32, 32px)));
    overflow: hidden;
    border-radius: 12px;
  }
</style>

<style scoped>
  .comment-reply-quote {
    display: flex;
    gap: var(--ui-space-12, 12px);
    align-items: flex-start;
    padding: var(--ui-space-8, 8px) var(--ui-space-10, 10px);
    margin-bottom: var(--ui-space-8, 8px);
    border-left: 2px solid var(--workspace-purple-text);
    background: var(--workspace-hover);
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .comment-reply-quote > div {
    flex: 1;
    min-width: 0;
  }
  .comment-reply-quote strong {
    display: block;
    margin-bottom: var(--ui-space-4, 4px);
    color: var(--text-color);
  }
  .comment-reply-quote :deep(.chat-inline-emoji-text) {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .comment-reply-quote .b_btn {
    background: transparent;
    border: 0;
    padding: 0 var(--ui-space-4, 4px);
  }
</style>
