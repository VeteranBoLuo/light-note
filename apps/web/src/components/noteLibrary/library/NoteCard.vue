<template>
  <div
    @click="handleCardClick"
    @keydown.enter.self="handleCardClick"
    class="note-card"
    :class="{ 'is-selected': note.isCheck, 'is-batch-mode': batchMode }"
    role="button"
    tabindex="0"
    v-click-log="{ module: '笔记库', operation: `打开笔记【${note.title}】` }"
  >
    <div class="note-title-row">
      <div class="note-title" :title="note.title">{{ note.title }}</div>
      <PinBadge v-if="note.isTop" />
      <InboxPendingBadge v-if="note.isPending" />
      <!-- 格式标识排在状态徽章之后：置顶/待整理是「要不要现在处理」，格式只是「打开后长什么样」 -->
      <NoteFormatBadge :type="note.type" />
    </div>
    <!-- 摘要按纯文本插值渲染:v-html 会把笔记里写的标签当真执行,块级换行改由 white-space 保留 -->
    <div class="note-content">{{ summary }}</div>
    <div class="note-footer">
      <div class="note-tags" v-if="note.tags && note.tags.length">
        <ResourceTagChip
          :key="tag.id || tag.name"
          v-for="tag in visibleTags"
          :tag="tag"
          show-detail-corner
          max-width="96px"
          @click.stop="noteTypeChange(tag)"
          @detail="openTagDetail(tag)"
          v-click-log="{ module: '笔记库', operation: `筛选标签【${tag.name}】` }"
        />
        <BChip
          v-if="hiddenTagCount > 0"
          class="tag-more"
          tone="neutral"
          size="small"
          :title="hiddenTagsLabel"
          @click.stop
        >
          +{{ hiddenTagCount }}
        </BChip>
      </div>
      <div v-else class="note-tags note-tags--empty"></div>
      <div class="note-time">{{ note['updateTime'] ?? note['createTime'] }}</div>
    </div>
    <div v-if="!bookmark.isMobile || batchMode" class="note-select-control">
      <b-checkbox v-model:checked="note.isCheck" @click.stop />
    </div>
    <div v-else-if="!batchMode" class="note-mobile-actions" @click.stop>
      <BDropdown :trigger="'click'" :align="'right'" :menu-options="mobileMenuOptions">
        <BButton class="note-more-button" :aria-label="$t('common.more')">
          <SvgIcon :src="icon.common.more" size="18" />
        </BButton>
      </BDropdown>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import { bookmarkStore } from '@/store';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import InboxPendingBadge from '@/components/inbox/InboxPendingBadge.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import PinBadge from '@/components/base/PinBadge.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import NoteFormatBadge from '@/components/noteLibrary/library/NoteFormatBadge.vue';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';
  import { useNoteSummary } from '@/composables/useNoteSummary';
  const props = withDefaults(defineProps<{ note: any; batchMode?: boolean }>(), {
    batchMode: false,
  });

  // 摘要统一走 noteSummaryText(只信 note.type,Markdown 过 marked 再取纯文本)
  const summary = useNoteSummary(() => props.note, { maxLength: 300 });

  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const emit = defineEmits<{
    nodeTypeChange: [tag: any];
    action: [action: 'toggleTop' | 'relateTags' | 'toggleInbox' | 'delete'];
  }>();

  const mobileMenuOptions = computed(() => [
    {
      label: props.note.isTop ? t('common.unpin') : t('common.pin'),
      icon: props.note.isTop ? icon.contextMenu.unpin : icon.contextMenu.pin,
      function: () => emit('action', 'toggleTop'),
    },
    {
      label: t('note.relateTags'),
      icon: icon.manage_categoryBtn_tag,
      function: () => emit('action', 'relateTags'),
    },
    {
      label: props.note.isPending ? t('inbox.removeExisting') : t('inbox.addExisting'),
      icon: icon.contextMenu.inbox,
      function: () => emit('action', 'toggleInbox'),
    },
    { divider: true },
    {
      label: t('common.delete'),
      icon: icon.table_delete,
      danger: true,
      function: () => emit('action', 'delete'),
    },
  ]);

  const MAX_VISIBLE_TAGS = 3;
  const visibleTags = computed(() => (props.note.tags || []).slice(0, MAX_VISIBLE_TAGS));
  const hiddenTagCount = computed(() => Math.max(0, (props.note.tags || []).length - MAX_VISIBLE_TAGS));
  const hiddenTagsLabel = computed(() =>
    (props.note.tags || [])
      .slice(MAX_VISIBLE_TAGS)
      .map((t: any) => t.name)
      .join('、'),
  );

  const noteTypeChange = function (tag) {
    emit('nodeTypeChange', tag);
  };

  function openTagDetail(tag) {
    if (!tag?.id) return;
    router.push(`/tag/${tag.id}`);
  }

  function handleCardClick() {
    if (props.batchMode) {
      props.note.isCheck = !props.note.isCheck;
      return;
    }
    router.push(`/noteLibrary/${props.note.id}`);
  }
</script>

<style lang="less" scoped>
  .note-card {
    --note-card-bg: var(--card-background);
    display: flex;
    flex-direction: column;
    height: 282px;
    position: relative;
    border-radius: 12px;
    border: 1px solid var(--surface-border-color);
    padding: 16px 20px 16px;
    box-sizing: border-box;
    cursor: pointer;
    background: var(--note-card-bg);
    box-shadow: var(--surface-card-shadow);
    transition:
      box-shadow 0.2s ease,
      border-color 0.2s ease,
      background 0.2s ease;

    &:hover,
    &:focus-visible {
      box-shadow: var(--surface-hover-shadow);
      border-color: color-mix(in srgb, var(--resource-note-color, #00a884) 34%, var(--surface-border-color));
    }

    &:hover,
    &:focus-visible,
    &.is-selected,
    &.is-batch-mode {
      .note-select-control {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }
    }

    &.is-selected {
      --note-card-bg: color-mix(in srgb, var(--resource-note-color, #00a884) 4%, var(--card-background));
      border-color: color-mix(in srgb, var(--resource-note-color, #00a884) 62%, var(--surface-border-color));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--resource-note-color, #00a884) 18%, transparent);
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--resource-note-color, #00a884) 56%, transparent);
      outline-offset: 2px;
    }
  }

  .note-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-right: 28px;
    min-width: 0;
  }

  .note-title {
    font-size: 16px;
    font-weight: 600;
    line-height: 24px;
    color: var(--text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
  }

  .note-content {
    position: relative;
    box-sizing: border-box;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.58;
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 10px;
    overflow: hidden;
    max-height: 154px;
    // 摘要是纯文本,块级换行靠 pre-line 还原;长英文/URL 不许撑破卡片
    white-space: pre-line;
    word-break: break-word;
    overflow-wrap: break-word;

    // 底部渐变淡出，避免硬截断
    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 42px;
      background: linear-gradient(to bottom, transparent, var(--note-card-bg));
      pointer-events: none;
    }
  }

  .note-footer {
    flex: 0 0 auto;
    margin-top: auto;
    padding-top: 12px;
    min-height: 54px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .note-tags {
    display: flex;
    gap: 6px;
    flex-wrap: nowrap;
    width: 100%;
    // padding-top 是给 hover 时上溢的角标留的(本行 overflow: hidden),
    // 原来用等量负 margin 抵消掉了,标签因此贴着正文;去掉负值让标签落到正文与日期中间。
    // 卡片是固定 282px,这里多占的高度由正文区吸收,不会撑大卡片或改变网格
    padding: 7px 7px 0 0;
    box-sizing: border-box;
    min-height: 24px;
    overflow: hidden;
    align-items: center;
    margin: 0 0 7px;

    &--empty {
      padding-top: 0;
      margin-top: 0;
      visibility: hidden;
    }

  }

  .note-time {
    font-size: 12px;
    color: var(--desc-color);
    white-space: nowrap;
    line-height: 18px;
    text-align: right;
  }

  .note-select-control {
    --primary-color: var(--resource-note-color, #00a884);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    position: absolute;
    right: 14px;
    z-index: 2;
    transition:
      opacity 0.16s ease,
      visibility 0.16s ease;
  }

  .note-mobile-actions {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 3;
  }

  .note-more-button {
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
    border-radius: 8px;
    color: var(--desc-color);
    background: color-mix(in srgb, var(--card-background) 88%, transparent);
  }

  @media (max-width: 1023px) {
    /* 触控目标按移动端最小热区处理。 */
    .note-more-button {
      width: 44px;
      min-width: 44px;
      height: 44px;
    }
    .note-card {
      border-color: var(--surface-border-color) !important;
      box-shadow: none;
      min-width: 0;
      overflow: hidden;

      &:hover {
        transform: none;
        box-shadow: none;
      }
    }

    .note-title-row {
      padding-right: 34px;
    }

    .note-content {
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .note-content::after {
      display: none;
    }
  }

  @media (max-width: 767px) {
    .note-card {
      width: 100%;
      max-width: 100%;
    }

    .note-content {
      min-width: 0;
    }

    .note-title {
      flex: 1 1 auto;
      min-width: 0;
    }
  }
</style>
