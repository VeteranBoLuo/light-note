<template>
  <main class="inline-emoji-harness">
    <header>
      <span>COMMUNITY CHAT · INLINE EMOJI</span>
      <h1>{{ t('communityChat.emoji.category.jianTuan') }}</h1>
      <p>{{ t('communityChat.emoji.count', { count: emojis.length }) }}</p>
    </header>

    <section class="inline-emoji-harness__layout">
      <article class="inline-emoji-harness__panel">
        <ChatExpressionPanel v-model:tab="tab" :recent="recentEmojis" @select-emoji="insertEmoji" />
      </article>

      <article class="inline-emoji-harness__conversation">
        <div class="inline-emoji-harness__messages">
          <div class="inline-emoji-harness__message">
            <small>纸页</small>
            <p><ChatInlineEmojiText :content="receivedMessage" /></p>
          </div>
          <div class="inline-emoji-harness__message is-own">
            <small>我</small>
            <p><ChatInlineEmojiText :content="ownMessage" /></p>
          </div>
        </div>

        <div class="inline-emoji-harness__composer">
          <ChatComposerInput
            ref="composerInput"
            v-model:value="draft"
            :rows="1"
            :maxlength="2000"
            :placeholder="t('communityChat.messagePlaceholder')"
          />
          <small>{{ logicalLength }}/2000</small>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
  import {
    COMMUNITY_CHAT_INLINE_EMOJIS,
    communityChatInlineEmojiLogicalLength,
  } from '@lightnote/shared/community-chat-inline-emojis';
  import { computed, nextTick, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import ChatComposerInput from '@/components/communityChat/ChatComposerInput.vue';
  import ChatExpressionPanel from '@/components/communityChat/ChatExpressionPanel.vue';
  import ChatInlineEmojiText from '@/components/communityChat/ChatInlineEmojiText.vue';

  const { t } = useI18n();
  const emojis = COMMUNITY_CHAT_INLINE_EMOJIS;
  const recentEmojis = ['😀', emojis[0].token];
  const tab = ref<'emoji' | 'official' | 'custom'>('emoji');
  const composerInput = ref<InstanceType<typeof ChatComposerInput> | null>(null);
  const draft = ref(`${emojis[0].token}12123112331😀`);
  const receivedMessage = `${emojis[0].token}12123112331😀`;
  const ownMessage = `好呀，等我一下${emojis[44].token}`;
  const logicalLength = computed(() => communityChatInlineEmojiLogicalLength(draft.value));

  function insertEmoji(token: string) {
    const selection = composerInput.value?.getSelectionRange() || {
      start: draft.value.length,
      end: draft.value.length,
    };
    draft.value = `${draft.value.slice(0, selection.start)}${token}${draft.value.slice(selection.end)}`;
    const caret = selection.start + token.length;
    void nextTick(() => {
      composerInput.value?.focus();
      composerInput.value?.setSelectionRange(caret, caret);
    });
  }
</script>

<style scoped lang="less">
  :global(#app) {
    width: 100%;
  }

  .inline-emoji-harness {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 32px;
    color: var(--text-color);
    background: var(--background-color);
  }

  .inline-emoji-harness > header {
    width: min(920px, 100%);
    margin: 0 auto 22px;
  }

  .inline-emoji-harness > header span,
  .inline-emoji-harness > header p {
    color: var(--desc-color);
    font-size: 12px;
  }

  .inline-emoji-harness > header h1 {
    margin: 6px 0 2px;
    font-size: 28px;
  }

  .inline-emoji-harness > header p {
    margin: 0;
  }

  .inline-emoji-harness__layout {
    width: min(920px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    align-items: start;
    gap: 22px;
  }

  .inline-emoji-harness__panel,
  .inline-emoji-harness__conversation {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
    box-shadow: var(--workspace-panel-shadow);
  }

  .inline-emoji-harness__conversation {
    min-height: 420px;
    padding: 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 24px;
  }

  .inline-emoji-harness__messages {
    display: grid;
    gap: 18px;
  }

  .inline-emoji-harness__message {
    max-width: 82%;
  }

  .inline-emoji-harness__message small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .inline-emoji-harness__message p {
    margin: 4px 0 0;
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 5px 15px 15px;
    background: var(--card-background);
    font-size: 14px;
    line-height: 1.65;
  }

  .inline-emoji-harness__message.is-own {
    margin-inline-start: auto;
    text-align: end;
  }

  .inline-emoji-harness__message.is-own p {
    border-color: var(--primary-color);
    border-radius: 15px 5px 15px 15px;
    color: #fff;
    background: var(--primary-color);
    text-align: start;
  }

  .inline-emoji-harness__composer {
    padding: 5px 8px;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--surface-page-bg, var(--background-color));
  }

  .inline-emoji-harness__composer :deep(.chat-composer-input__rich),
  .inline-emoji-harness__composer :deep(.b-textarea) {
    min-height: 42px;
    max-height: 96px;
    padding: 8px 4px 3px !important;
    border: 0 !important;
    outline: 0;
    background: transparent !important;
    line-height: 1.45;
  }

  .inline-emoji-harness__composer > small {
    padding-block-end: 5px;
    color: var(--desc-color);
    font-size: 10px;
    white-space: nowrap;
  }

  html.light-note-mobile-rendering .inline-emoji-harness {
    padding: 14px 10px;
  }

  html.light-note-mobile-rendering .inline-emoji-harness > header {
    margin-bottom: 14px;
  }

  html.light-note-mobile-rendering .inline-emoji-harness > header h1 {
    font-size: 22px;
  }

  html.light-note-mobile-rendering .inline-emoji-harness__layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  html.light-note-mobile-rendering .inline-emoji-harness__panel,
  html.light-note-mobile-rendering .inline-emoji-harness__conversation {
    border-radius: 13px;
    box-shadow: none;
  }

  html.light-note-mobile-rendering .inline-emoji-harness__conversation {
    min-height: 300px;
    padding: 14px;
  }
</style>
