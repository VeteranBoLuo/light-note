<template>
  <section class="chat-official-sticker-panel" :aria-label="t('communityChat.sticker.officialTitle')">
    <header class="chat-official-sticker-panel__header">
      <span>
        <strong>{{ t('communityChat.sticker.paperSpiritTitle') }}</strong>
        <small>{{ t('communityChat.sticker.officialBadge') }}</small>
      </span>
      <small>{{ t('communityChat.sticker.officialCount', { count: stickers.length }) }}</small>
    </header>

    <div class="chat-official-sticker-panel__grid">
      <BButton
        v-for="sticker in stickers"
        :key="sticker.key"
        class="chat-official-sticker-panel__item"
        :aria-label="
          t('communityChat.sticker.sendOfficial', {
            name: t(`communityChat.sticker.officialItems.${sticker.id}`),
          })
        "
        @click="emit('select', sticker.key)"
      >
        <img
          :src="sticker.assetPath"
          :alt="t(`communityChat.sticker.officialItems.${sticker.id}`)"
          width="96"
          height="96"
          loading="lazy"
          decoding="async"
        />
      </BButton>
    </div>

    <p>{{ t('communityChat.sticker.officialHint') }}</p>
  </section>
</template>

<script setup lang="ts">
  import { COMMUNITY_CHAT_OFFICIAL_STICKERS } from '@lightnote/shared/community-chat-stickers';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  const emit = defineEmits<{ select: [key: string] }>();
  const { t } = useI18n();
  const stickers = COMMUNITY_CHAT_OFFICIAL_STICKERS;
</script>

<style scoped lang="less">
  .chat-official-sticker-panel {
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 10px;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 9px;
    overflow: hidden;
    background: var(--card-background);
  }

  .chat-official-sticker-panel__header,
  .chat-official-sticker-panel__header > span {
    display: flex;
    align-items: center;
  }

  .chat-official-sticker-panel__header {
    justify-content: space-between;
    gap: 10px;
  }

  .chat-official-sticker-panel__header > span {
    min-width: 0;
    gap: 6px;
  }

  .chat-official-sticker-panel__header strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .chat-official-sticker-panel__header small,
  .chat-official-sticker-panel > p {
    color: var(--desc-color);
    font-size: 10px;
  }

  .chat-official-sticker-panel__header > span small {
    padding: 2px 6px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    line-height: 1.2;
  }

  .chat-official-sticker-panel__grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: 76px;
    align-content: start;
    gap: 6px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .chat-official-sticker-panel__item.b_btn {
    width: 100%;
    height: 76px;
    min-width: 0;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
  }

  .chat-official-sticker-panel__item.b_btn:hover {
    border-color: transparent;
    background: var(--hover-background);
  }

  .chat-official-sticker-panel__item.b_btn:focus-visible {
    border-color: var(--primary-color);
    background: var(--hover-background);
    outline: none;
  }

  .chat-official-sticker-panel__item img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .chat-official-sticker-panel > p {
    margin: 0;
    line-height: 1.55;
  }

  html.light-note-mobile-rendering .chat-official-sticker-panel__grid {
    grid-auto-rows: 68px;
  }

  html.light-note-mobile-rendering .chat-official-sticker-panel__item.b_btn {
    height: 68px;
  }
</style>
