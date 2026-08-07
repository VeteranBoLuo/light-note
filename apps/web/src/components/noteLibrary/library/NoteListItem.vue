<template>
  <div
    class="note-list-item"
    :class="{ 'is-selected': note.isCheck, 'is-batch-mode': batchMode, 'is-mobile': bookmark.isMobile }"
    @click="handleItemClick"
    v-click-log="{ module: '笔记库', operation: `打开笔记【${note.title}】` }"
  >
    <div v-if="!bookmark.isMobile" class="note-select-column">
      <b-checkbox v-model:checked="note.isCheck" @click.stop />
    </div>
    <div class="note-info">
      <div class="note-title-row">
        <div class="note-title">{{ note.title }}</div>
        <!--
          手机上徽章下移到底部 chip 行。实测 375px 下「置顶 + 待整理」占掉约 120px，
          标题只剩 142px 且被截断；挪走后标题能拿到整行。
        -->
        <template v-if="!bookmark.isMobile">
          <PinBadge v-if="note.isTop" />
          <InboxPendingBadge v-if="note.isPending" />
          <!-- 桌面放标题行：摘要与标签本来就在下面一行抢空间(实测摘要被压到 35px 过)，不能再往那行塞 -->
          <NoteFormatBadge :type="note.type" />
        </template>
        <!-- 手机:时间跟着标题走。放在下面的 chip 行时，chip 一换行时间就被挤成单独一行 -->
        <span v-if="bookmark.isMobile" class="note-time is-inline">{{ listTime }}</span>
      </div>
      <!--
        桌面:摘要与标签同占一行,有无标签行高都一致,30 行同屏时不会忽高忽低。
        手机:改为纵向堆叠(见 .is-mobile 样式)。实测同行时标签占 194px、
        摘要被压到 35px 完全读不出内容,而手机一屏只有 8 条,行高不齐不影响观感。
      -->
      <div class="note-meta-row">
        <div v-if="parentPathText" class="note-parent-path" :title="parentPathText">
          <SvgIcon class="note-parent-path__icon" :src="icon.resource.note" size="12" aria-hidden="true" />
          <span class="note-parent-path__label">{{ $t('note.parentPage') }}</span>
          <span class="note-parent-path__separator" aria-hidden="true">·</span>
          <span class="note-parent-path__text">{{ parentPathText }}</span>
        </div>
        <div class="note-description" v-if="!bookmark.isMobile || description">{{ description }}</div>
        <!--
          手机上这一块承担整个底行：徽章 + 标签 + 时间凑一行(需要时换行)。
          它们同为 chip 形态，放在一个容器里既省一行高度，也比拆成两行整齐。
        -->
        <div class="note-tags" v-if="bookmark.isMobile || visibleTags.length">
          <template v-if="bookmark.isMobile">
            <PinBadge v-if="note.isTop" />
            <InboxPendingBadge v-if="note.isPending" />
            <!-- 手机的标题行只剩标题 + 时间 + ⋯，没有余量；格式标识跟徽章一起进 chip 行 -->
            <NoteFormatBadge :type="note.type" />
            <BButton v-if="childCount" class="note-child-count" @click.stop="emit('action', 'enterDirectory')">
              {{ $t('note.childPages', { count: childCount }) }}
              <SvgIcon :src="icon.arrow_right" size="12" aria-hidden="true" />
            </BButton>
          </template>
          <ResourceTagChip
            v-for="tag in visibleTags"
            :key="tag.id || tag.name"
            :tag="tag"
            show-detail-corner
            max-width="120px"
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
      </div>
    </div>
    <BButton
      v-if="!bookmark.isMobile && childCount"
      class="note-child-count note-child-count-column"
      @click.stop="emit('action', 'enterDirectory')"
    >
      {{ $t('note.childPages', { count: childCount }) }}
      <SvgIcon :src="icon.arrow_right" size="12" aria-hidden="true" />
    </BButton>
    <!-- 桌面时间独占一列;手机让位给操作入口，时间挪到底行 -->
    <div v-if="!bookmark.isMobile" class="note-time">{{ listTime }}</div>
    <!--
      手机端的每条操作入口。桌面靠外层 RightMenu 的右键菜单，但 RightMenu 只绑
      contextmenu、没有长按，手机上置顶/关联标签/收件箱/删除全都够不到。
      这里复用卡片视图那套 emit('action') 契约，父组件的处理函数与渲染器无关。
    -->
    <div v-else class="note-mobile-actions" @click.stop>
      <b-checkbox v-if="batchMode" v-model:checked="note.isCheck" />
      <BButton v-else class="note-more-button" :aria-label="$t('common.more')" @click="emit('action', 'more')">
        <SvgIcon :src="icon.common.more" size="18" />
      </BButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import router from '@/router';
  import { bookmarkStore } from '@/store';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import InboxPendingBadge from '@/components/inbox/InboxPendingBadge.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import PinBadge from '@/components/base/PinBadge.vue';
  import NoteFormatBadge from '@/components/noteLibrary/library/NoteFormatBadge.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { useNoteSummary } from '@/composables/useNoteSummary';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';
  import { getNoteParentPathText } from '@/utils/noteTree';

  const props = withDefaults(
    defineProps<{ note: any; batchMode?: boolean; treeReadEnabled?: boolean; treeWriteEnabled?: boolean }>(),
    {
      batchMode: false,
      treeReadEnabled: true,
      treeWriteEnabled: true,
    },
  );
  const bookmark = bookmarkStore();

  // 与 NoteCard 保持同一套标签折叠规则
  const MAX_VISIBLE_TAGS = 3;
  const tagList = computed<any[]>(() => (Array.isArray(props.note?.tags) ? props.note.tags : []));
  const visibleTags = computed(() => tagList.value.slice(0, MAX_VISIBLE_TAGS));
  const hiddenTagCount = computed(() => Math.max(0, tagList.value.length - MAX_VISIBLE_TAGS));
  const hiddenTagsLabel = computed(() =>
    tagList.value
      .slice(MAX_VISIBLE_TAGS)
      .map((t: any) => t.name)
      .join('、'),
  );

  // 摘要按纯文本插值渲染,不再走 v-html:
  // HTML 分支取的是 textContent,`&lt;img onerror=...&gt;` 会被解码成真实标签再被 v-html 执行。
  // 口径与卡片视图共用 noteSummaryText:只信 note.type,不再用 content.includes('<') 猜格式
  const description = useNoteSummary(() => props.note, { maxLength: 150, singleLine: true });

  // 后端已按本地时区格式化为 'YYYY-MM-DD HH:mm:ss',这里只截日期段。
  // 不用 new Date() 二次解析:空格分隔格式在部分浏览器解析不稳,还会引入时区偏移
  const listTime = computed(() => String(props.note?.updateTime ?? props.note?.createTime ?? '').slice(0, 10));

  const emit = defineEmits<{
    open: [];
    nodeTypeChange: [tag: any];
    // 与 NoteCard 同一套契约:父组件的 handleNoteCardAction(action, note) 与渲染器无关
    action: [
      action:
        | 'more'
        | 'toggleTop'
        | 'relateTags'
        | 'toggleInbox'
        | 'enterDirectory'
        | 'createChild'
        | 'attach'
        | 'move'
        | 'delete',
    ];
  }>();
  const childCount = computed(() => (props.treeReadEnabled ? Math.max(0, Number(props.note?.childCount || 0)) : 0));
  const parentPathText = computed(() => getNoteParentPathText(props.note || {}));
  const noteTypeChange = function (tag) {
    emit('nodeTypeChange', tag);
  };

  function openTagDetail(tag) {
    if (!tag?.id) return;
    router.push(`/tag/${tag.id}`);
  }

  function handleItemClick() {
    if (props.batchMode) {
      props.note.isCheck = !props.note.isCheck;
      return;
    }
    emit('open');
  }
</script>

<style lang="less" scoped>
  .note-list-item {
    // 标题与右侧时间共用同一行高,时间不再靠写死的 line-height 去凑基线
    --note-row-line: 22px;

    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) auto auto;
    column-gap: 12px;
    align-items: flex-start;
    padding: 11px 14px;
    margin-bottom: 8px;
    background: var(--card-background);
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    cursor: pointer;
    box-shadow: var(--surface-card-shadow);
    transition:
      box-shadow 0.2s ease,
      border-color 0.2s ease,
      background 0.2s ease;

    &:hover {
      box-shadow: var(--surface-hover-shadow);
      border-color: color-mix(in srgb, var(--resource-note-color, #00a884) 34%, var(--surface-border-color));
    }

    &.is-selected {
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 4%, var(--card-background));
      border-color: color-mix(in srgb, var(--resource-note-color, #00a884) 62%, var(--surface-border-color));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--resource-note-color, #00a884) 18%, transparent);
    }

    /*
     * 手机布局：三行 + 右侧操作列。
     *   标题 ————————————————————— [⋯]
     *   摘要
     *   [置顶][待整理][标签][标签]      08-05
     *
     * 桌面是「标题|摘要+标签|时间」的横向争抢，在 375px 下实测的结果是标题 142px、
     * 摘要 35px，两个都读不出内容。手机改成纵向让每种信息各拿整行宽度。
     */
    &.is-mobile {
      grid-template-columns: minmax(0, 1fr) 44px;
      column-gap: 2px;
      // 操作按钮对齐标题行，而不是整条居中：居中时它会掉到标题下方 36px，看着没有归属
      align-items: start;
      // 触控端不跟着桌面一起压扁
      padding: 11px 8px 11px 14px;

      // 下面这些覆盖必须写到 .note-info 里层。原规则是
      // `.note-list-item .note-info .note-description`(3 个 class)，
      // 只写 `&.is-mobile .note-description` 权重相同而源码在前，会被静默覆盖。
      .note-info {
        .note-title-row {
          margin-bottom: 1px;
        }

        // 摘要与 chip 行上下堆叠，各自拿满整行宽
        .note-meta-row {
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          // 桌面靠 min-height 保证行高一致；手机没有摘要就该更矮，不留空行
          min-height: 0;
        }

        .note-description {
          width: 100%;
          // 摘要给两行：单行在 375px 下只能看约 18 个字，判断不出是哪篇笔记
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          white-space: normal;
          line-height: 19px;
        }

        .note-parent-path {
          max-width: 100%;
        }

        // 底行：徽章 + 标签靠左，时间被推到行尾
        .note-tags {
          order: 0;
          width: 100%;
          flex-wrap: wrap;
          row-gap: 4px;
        }

        .note-title-row .note-time.is-inline {
          flex: 0 0 auto;
          margin-left: auto;
          padding-left: 8px;
          line-height: var(--note-row-line);
        }
      }
    }

    // 44px 触控区：与卡片视图一致，窄屏下也保留可安全点击的菜单入口。
    .note-mobile-actions {
      --primary-color: var(--resource-note-color, #00a884);
      display: flex;
      align-items: center;
      justify-content: center;
      // 与标题行同高并居中于其中，视觉上「⋯」属于这条笔记的标题
      height: 44px;

      .note-more-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        min-width: 44px;
        height: 44px;
        padding: 0;
        border: none;
        border-radius: 8px;
        background: none;
        color: var(--desc-color);
      }
    }

    .note-select-column {
      --primary-color: var(--resource-note-color, #00a884);
      width: 26px;
      min-width: 26px;
      height: var(--note-row-line);
      display: flex;
      align-items: center;
      justify-content: flex-start;
    }

    .note-info {
      min-width: 0;
      .note-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        margin-bottom: 3px;
      }
      .note-title {
        font-size: 15px;
        font-weight: 500;
        color: var(--text-color);
        margin-bottom: 0;
        line-height: var(--note-row-line);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 0 1 auto;
        min-width: 0;
      }
      .note-meta-row {
        display: flex;
        align-items: center;
        gap: 12px;
        // 无摘要也无标签时保持同样的行高
        min-height: 20px;
      }
      .note-parent-path {
        order: -2;
        flex: 0 1 auto;
        min-width: 0;
        max-width: 46%;
        height: 22px;
        padding: 0 7px;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        overflow: hidden;
        color: var(--chip-neutral-fg, var(--desc-color));
        background: var(--chip-neutral-bg);
        border: 1px solid var(--chip-neutral-border);
        border-radius: 6px;
        font-size: 11px;
        line-height: 20px;
        white-space: nowrap;

        &__icon {
          flex: 0 0 auto;
          color: var(--resource-note-color, #00a884);
        }

        &__label {
          flex: 0 0 auto;
          font-weight: 600;
        }

        &__separator {
          flex: 0 0 auto;
          opacity: 0.55;
        }

        &__text {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }
      .note-description {
        flex: 1 1 auto;
        min-width: 0;
        font-size: 13px;
        color: var(--desc-color);
        line-height: 20px;
        // break-all 会把英文单词从中间劈开
        overflow-wrap: anywhere;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .note-tags {
        order: -1;
        flex: 0 0 auto;
        display: flex;
        gap: 6px;
        align-items: center;
      }
    }

    .note-child-count {
      height: 24px;
      padding: 0 6px;
      gap: 3px;
      border: 1px solid var(--surface-border-color);
      border-radius: 7px;
      color: var(--resource-note-color, #00a884);
      background: transparent;
      font-size: 11px;
    }

    .note-child-count-column {
      align-self: center;
      white-space: nowrap;
    }
    .note-time {
      font-size: 12px;
      color: var(--desc-color);
      white-space: nowrap;
      align-self: flex-start;
      line-height: var(--note-row-line);
      font-variant-numeric: tabular-nums;
    }
  }
</style>
