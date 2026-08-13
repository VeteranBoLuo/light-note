<template>
  <section
    class="chat-mention-suggestions"
    :class="{ 'is-embedded': embedded }"
    :aria-label="t('communityChat.mentionSearch.title')"
  >
    <header>
      <strong>{{
        query ? t('communityChat.mentionSearch.results') : t('communityChat.mentionSearch.recommended')
      }}</strong>
      <small>{{ t('communityChat.mentionSearch.keyboardHint') }}</small>
    </header>
    <div class="chat-mention-suggestions__body">
      <div v-if="showEveryone || items.length" class="chat-mention-suggestions__list" role="listbox">
        <BButton
          v-if="showEveryone"
          class="chat-mention-suggestions__item chat-mention-suggestions__everyone"
          :class="{ 'is-active': activeIndex === 0 }"
          role="option"
          :aria-selected="activeIndex === 0"
          @pointerdown.prevent
          @click="emit('selectEveryone')"
        >
          <span class="chat-mention-suggestions__everyone-mark" aria-hidden="true">@</span>
          <span class="chat-mention-suggestions__copy">
            <strong>{{ t('communityChat.mentionSearch.everyone') }}</strong>
            <small>{{ t('communityChat.mentionSearch.everyoneHint') }}</small>
          </span>
          <em>{{ t('communityChat.mentionSearch.rootOnly') }}</em>
        </BButton>
        <BButton
          v-for="(item, index) in items"
          :key="item.userPublicId"
          class="chat-mention-suggestions__item"
          :class="{ 'is-active': index + (showEveryone ? 1 : 0) === activeIndex }"
          role="option"
          :aria-selected="index + (showEveryone ? 1 : 0) === activeIndex"
          @pointerdown.prevent
          @click="emit('select', item)"
        >
          <SvgIcon :src="item.avatar || icon.communityChat.defaultAvatar" size="30" aria-hidden="true" />
          <span class="chat-mention-suggestions__copy">
            <strong>{{ item.displayName }}</strong>
            <small>@{{ item.communityId }}</small>
          </span>
          <em>Lv.{{ item.level }} {{ item.levelName }}</em>
        </BButton>
      </div>
      <div
        v-if="loading"
        class="chat-mention-suggestions__loading"
        :class="{ 'is-standalone': !showEveryone && !items.length }"
      >
        <BLoading inline loading :title="t('communityChat.mentionSearch.loading')" />
      </div>
      <p v-else-if="!showEveryone && !items.length" class="chat-mention-suggestions__state">
        {{ t('communityChat.mentionSearch.empty') }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatMemberSearchItem } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  withDefaults(
    defineProps<{
      query?: string;
      items?: CommunityChatMemberSearchItem[];
      loading?: boolean;
      activeIndex?: number;
      showEveryone?: boolean;
      embedded?: boolean;
    }>(),
    { query: '', items: () => [], loading: false, activeIndex: -1, showEveryone: false, embedded: false },
  );
  const emit = defineEmits<{
    select: [item: CommunityChatMemberSearchItem];
    selectEveryone: [];
  }>();
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .chat-mention-suggestions {
    width: 100%;
    max-height: min(360px, 42vh);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
    box-shadow: var(--workspace-panel-shadow);
  }

  .chat-mention-suggestions.is-embedded {
    border: 0;
    border-radius: inherit;
    box-shadow: none;
  }

  .chat-mention-suggestions > header {
    padding: 9px 11px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--surface-border-color);
  }

  .chat-mention-suggestions > header strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .chat-mention-suggestions > header small {
    color: var(--desc-color);
    font-size: 9px;
  }

  .chat-mention-suggestions__body {
    // Root 推荐行 + 紧凑 loading 与普通搜索空态共用稳定首屏高度，避免 BPopover
    // 因防抖/快速响应连续改变高度并触发顶部定位闪动。
    min-height: 105px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .chat-mention-suggestions__list {
    min-height: 0;
    padding: 5px;
    display: grid;
    grid-auto-rows: max-content;
    align-content: start;
    gap: 2px;
    flex: 1 1 auto;
    overflow-y: auto;
  }

  .chat-mention-suggestions__item {
    width: 100%;
    height: auto !important;
    min-height: 54px;
    padding: 7px 9px;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    border: 1px solid transparent !important;
    border-radius: 9px;
    background: transparent !important;
    line-height: 1.35 !important;
    white-space: normal;
    text-align: left;
  }

  @media (hover: hover) and (pointer: fine) {
    .chat-mention-suggestions__item:hover {
      background: var(--hover-background) !important;
    }
  }

  .chat-mention-suggestions__item.is-active {
    border-left-color: var(--primary-color) !important;
    background: var(--hover-background) !important;
  }

  .chat-mention-suggestions__everyone {
    min-height: 58px;
  }

  .chat-mention-suggestions__everyone-mark {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: var(--primary-color);
    font-size: 18px;
    font-weight: 700;
  }

  .chat-mention-suggestions__item > :deep(.svg-icon) {
    overflow: hidden;
    border-radius: 50%;
  }

  .chat-mention-suggestions__copy {
    min-width: 0;
    display: grid;
    gap: 2px;
    line-height: 1.35;
  }

  .chat-mention-suggestions__item strong,
  .chat-mention-suggestions__item small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-mention-suggestions__item strong {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
  }

  .chat-mention-suggestions__item small,
  .chat-mention-suggestions__item em {
    color: var(--desc-color);
    font-size: 10px;
    font-style: normal;
    line-height: 1.35;
  }

  .chat-mention-suggestions__item em {
    max-width: 88px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-mention-suggestions__state {
    min-height: 96px;
    margin: 0;
    display: grid;
    place-items: center;
    color: var(--desc-color);
    font-size: 11px;
  }

  .chat-mention-suggestions__loading {
    min-height: 32px;
    padding: 0 10px 5px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .chat-mention-suggestions__loading.is-standalone {
    min-height: 88px;
    padding: 8px;
  }

  .chat-mention-suggestions__loading :deep(.b-loading-inline) {
    min-height: 28px;
    gap: 7px;
    font-size: 10px;
  }

  .chat-mention-suggestions__loading :deep(.b-loading-inline__indicator i) {
    width: 4px;
    height: 4px;
  }

  :global(html.light-note-mobile-rendering) .chat-mention-suggestions {
    width: 100%;
    max-height: min(300px, calc(var(--mobile-visible-viewport-height, 100vh) * 0.38));
    box-shadow: none;
  }
</style>
