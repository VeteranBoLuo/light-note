<template>
  <article
    class="board-card"
    :class="{ 'is-hovered': hovered, 'is-complete': item.lane === 'action' && item.status === 'done' }"
    :data-item-id="item.id"
    tabindex="0"
    @click="open"
    @keydown.enter.self.prevent="$emit('edit')"
    @keydown.space.self.prevent="$emit('edit')"
  >
    <div class="board-card__heading">
      <BButton
        v-if="!readonly"
        class="board-drag"
        :disabled="disabled"
        :aria-label="t('toolbox.board.sort')"
        @click.stop
        ><SvgIcon :src="icon.todo.drag" size="16"
      /></BButton>
      <div class="board-card__identity">
        <span class="board-card__type"
          ><SvgIcon
            v-if="item.lane !== 'inbox'"
            :src="item.lane === 'knowledge' ? icon.organize.bulb : icon.todoWorkspace.checkSquare"
            size="14"
          />{{ typeLabel }}</span
        >
        <strong>{{ item.title }}</strong>
      </div>
      <BActionMenu
        v-if="!readonly"
        :items="menu"
        :disabled="disabled"
        @select="(key) => $emit('action', key)"
        @click.stop
      >
        <BButton class="board-card__menu" :aria-label="t('toolbox.board.actions')"
          ><SvgIcon :src="icon.common.more" size="18"
        /></BButton>
      </BActionMenu>
    </div>
    <div v-if="item.lane !== 'knowledge'" class="board-card__meta">
      <BChip
        :tone="
          item.status === 'done' && item.lane === 'action' ? 'success' : item.status === 'open' ? 'neutral' : 'pending'
        "
        >{{ state || t('toolbox.board.notStarted') }}</BChip
      >
    </div>
    <div v-if="item.content" class="board-card__description">
      <p>{{ item.content }}</p>
    </div>
    <small v-if="item.lane === 'inbox' && item.status === 'done'">{{ t('toolbox.board.legacyHint') }}</small>
    <BButton v-if="item.sourceItemId || item.sourceTitle" class="board-card__source" @click.stop="$emit('source')">{{
      t('toolbox.board.from', { title: item.sourceTitle })
    }}</BButton>
    <div class="board-card__footer">
      <span v-if="item.dueOn" class="board-card__date"
        ><SvgIcon :src="icon.todoWorkspace.calendar" size="14" /><span
          ><span class="board-card__label">{{ t('toolbox.board.dateLabel') }}</span
          ><time :datetime="item.dueOn">{{ item.dueOn }}</time></span
        ></span
      >
      <BButton v-if="!readonly" size="small" :disabled="disabled" @click.stop="$emit('action', primary.key)">{{
        primary.label
      }}</BButton></div
    >
  </article>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { ToolboxWorkspaceItem } from '@/api/toolbox';
  import type { BActionMenuItem } from '@/components/base/BasicComponents/actionMenu';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  defineProps<{
    item: ToolboxWorkspaceItem;
    disabled: boolean;
    readonly?: boolean;
    hovered: boolean;
    typeLabel: string;
    menu: BActionMenuItem[];
    state: string;
    primary: { key: string; label: string };
  }>();
  const emit = defineEmits<{ edit: []; action: [key: string]; source: [] }>();
  const { t } = useI18n();
  function open(e: MouseEvent) {
    if (!(e.target as Element).closest('button,[role="menu"],.b-action-menu-anchor')) emit('edit');
  }
</script>
<style scoped lang="less">
  .board-card {
    padding: var(--ui-space-14, 14px);
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
    display: grid;
    gap: var(--ui-space-10, 10px);
    cursor: pointer;
    min-width: 0;
  }
  .board-card:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .board-card__heading {
    display: flex;
    gap: var(--ui-space-8, 8px);
    align-items: flex-start;
    min-width: 0;
  }
  .board-card__identity {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: var(--ui-space-5, 5px);
  }
  .board-card__type {
    display: flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-11, 11px);
    font-weight: 600;
    line-height: 1.4;
  }
  .board-card__heading strong {
    min-width: 0;
    font-size: var(--ui-font-16, 16px);
    line-height: 1.5;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .board-drag.b_btn,
  .board-card__menu.b_btn {
    width: var(--ui-layout-24, 24px);
    height: var(--ui-layout-26, 26px);
    padding: 0;
    background: transparent;
    color: var(--desc-color);
    flex-shrink: 0;
  }
  .board-drag {
    cursor: grab;
    touch-action: none;
  }
  .board-card__meta {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    flex-wrap: wrap;
    font-size: var(--ui-font-11, 11px);
    color: var(--desc-color);
  }
  .board-card__description {
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border-radius: 8px;
    background: var(--workspace-panel-bg-color);
    display: grid;
    gap: var(--ui-space-4, 4px);
  }
  .board-card__label {
    display: block;
    font-size: var(--ui-font-10, 10px);
    line-height: 1.4;
    color: var(--desc-color);
  }
  .board-card__date {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    color: var(--desc-color);
    margin-right: auto;
  }
  .board-card__date time {
    display: block;
    color: var(--text-color);
    font-size: var(--ui-font-11, 11px);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    line-height: 1.5;
  }
  .board-card p {
    margin: 0;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
    color: var(--desc-color);
  }
  .board-card small {
    font-size: var(--ui-font-11, 11px);
    color: var(--desc-color);
  }
  .board-card__source.b_btn {
    height: auto;
    min-height: var(--ui-layout-24, 24px);
    width: 100%;
    padding: 0;
    background: transparent;
    text-align: left;
    justify-content: flex-start;
    line-height: 1.4;
    white-space: normal;
    color: var(--workspace-purple-text, var(--primary-color));
    font-size: var(--ui-font-11, 11px);
    overflow-wrap: anywhere;
  }
  .board-card__footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  .board-card__footer .b_btn {
    background: transparent;
    border: 1px solid var(--surface-border-color);
    color: var(--workspace-purple-text, var(--primary-color));
  }
  .is-complete .board-card__heading strong {
    color: var(--desc-color);
  }
  @media (hover: hover) {
    .board-card.is-hovered {
      border-color: var(--workspace-purple-text, var(--primary-color));
    }
  }
  @media (max-width: 767px) {
    .board-card__footer .b_btn,
    .board-card__menu.b_btn,
    .board-drag.b_btn {
      min-height: var(--ui-layout-36, 36px);
    }
    .board-card__menu.b_btn,
    .board-drag.b_btn {
      width: var(--ui-layout-28, 28px);
    }
  }
</style>
