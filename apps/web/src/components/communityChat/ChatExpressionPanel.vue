<template>
  <section class="chat-expression-panel" :aria-label="t('communityChat.expression.title')">
    <div class="chat-expression-panel__body">
      <ChatEmojiPanel v-if="tab === 'emoji'" embedded :recent="recent" @select="emit('selectEmoji', $event)" />
      <ChatCustomStickerPanel v-else embedded @select="emit('selectSticker', $event)" />
    </div>

    <nav class="chat-expression-panel__tabs" :aria-label="t('communityChat.expression.tabs')">
      <BButton
        class="chat-expression-panel__tab"
        :class="{ 'is-active': tab === 'emoji' }"
        :aria-label="t('communityChat.expression.emojiTab')"
        :title="t('communityChat.expression.emojiTab')"
        @click="selectTab('emoji')"
      >
        <SvgIcon :src="icon.noteDetail.toolbar.emoji" size="22" aria-hidden="true" />
        <small>{{ t('communityChat.expression.emojiTab') }}</small>
      </BButton>
      <BButton
        class="chat-expression-panel__tab"
        :class="{ 'is-active': tab === 'custom' }"
        :aria-label="t('communityChat.expression.customTab')"
        :title="t('communityChat.expression.customTab')"
        @click="selectTab('custom')"
      >
        <SvgIcon :src="icon.support.heart" size="22" aria-hidden="true" />
        <small>{{ t('communityChat.expression.customTab') }}</small>
      </BButton>
    </nav>
  </section>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import ChatCustomStickerPanel from '@/components/communityChat/ChatCustomStickerPanel.vue';
  import ChatEmojiPanel from '@/components/communityChat/ChatEmojiPanel.vue';
  import icon from '@/config/icon';

  type ChatExpressionPanelTab = 'emoji' | 'custom';

  const props = withDefaults(
    defineProps<{
      tab?: ChatExpressionPanelTab;
      recent?: string[];
    }>(),
    {
      tab: 'emoji',
      recent: () => [],
    },
  );
  const emit = defineEmits<{
    'update:tab': [tab: ChatExpressionPanelTab];
    selectEmoji: [emoji: string];
    selectSticker: [publicId: string];
  }>();
  const { t } = useI18n();

  function selectTab(tab: ChatExpressionPanelTab) {
    if (tab !== props.tab) emit('update:tab', tab);
  }
</script>

<style scoped lang="less">
  .chat-expression-panel {
    width: 360px;
    max-width: 100%;
    height: min(420px, 46vh);
    min-height: 300px;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
    border: 0;
    border-radius: 11px;
    background: var(--card-background);
    box-shadow: none;
  }

  .chat-expression-panel__body {
    min-height: 0;
    overflow: hidden;
  }

  .chat-expression-panel__tabs {
    min-height: 52px;
    display: flex;
    align-items: stretch;
    gap: 4px;
    padding: 5px 8px;
    border-top: 1px solid var(--surface-border-color);
    background: var(--card-background);
  }

  .chat-expression-panel__tab.b_btn {
    min-width: 72px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid transparent;
    color: var(--desc-color);
    background: transparent;
  }

  .chat-expression-panel__tab > small {
    font-size: 12px;
  }

  .chat-expression-panel__tab.b_btn.is-active {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  :global(html.light-note-mobile-rendering) .chat-expression-panel {
    width: 100%;
    height: min(350px, 42vh);
    min-height: 260px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    box-shadow: none;
  }

  :global(html.light-note-mobile-rendering) .chat-expression-panel__tab.b_btn.is-active {
    border-width: 1px;
    border-style: solid;
  }
</style>
