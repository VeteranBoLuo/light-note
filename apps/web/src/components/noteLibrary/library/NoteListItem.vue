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
        <span v-if="note.isTop" class="note-top-badge">{{ $t('common.pin') }}</span>
        <InboxPendingBadge v-if="note.isPending" />
      </div>
      <!-- 摘要与标签同占一行:有无标签行高都一致,列表不会忽高忽低 -->
      <div class="note-meta-row">
        <div class="note-description">{{ description }}</div>
        <div class="note-tags" v-if="visibleTags.length">
          <span
            class="b-tag tag-detail-chip"
            v-for="tag in visibleTags"
            :key="tag.id || tag.name"
            :title="tag.name"
            @click.stop="noteTypeChange(tag)"
            v-click-log="{ module: '笔记库', operation: `筛选标签【${tag.name}】` }"
          >
            <span class="tag-detail-label">{{ tag.name }}</span>
            <BButton class="tag-detail-corner" :title="$t('common.detail')" @click.stop="openTagDetail(tag)">
              <!-- 站内跳转到标签详情页,用"进入下一级"的箭头;share 是外链分享语义,不匹配 -->
              <SvgIcon :src="icon.arrow_right" size="13" />
            </BButton>
          </span>
          <span v-if="hiddenTagCount > 0" class="b-tag tag-more" :title="hiddenTagsLabel" @click.stop
            >+{{ hiddenTagCount }}</span
          >
        </div>
      </div>
    </div>
    <div class="note-time">{{ listTime }}</div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import router from '@/router';
  import { bookmarkStore } from '@/store';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import InboxPendingBadge from '@/components/inbox/InboxPendingBadge.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const props = withDefaults(defineProps<{ note: any; batchMode?: boolean }>(), {
    batchMode: false,
  });
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
  // HTML 分支取的是 textContent,`&lt;img onerror=...&gt;` 会被解码成真实标签再被 v-html 执行
  const description = computed(() => {
    const raw = props.note?.content || '';
    if (props.note?.type === 'markdown' && !raw.includes('<')) {
      return raw
        .replace(/[#*`~>\[\]()_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 150);
    }
    const tempElement = document.createElement('div');
    tempElement.innerHTML = raw;
    return (tempElement.textContent || tempElement.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 150);
  });

  // 后端已按本地时区格式化为 'YYYY-MM-DD HH:mm:ss',这里只截日期段。
  // 不用 new Date() 二次解析:空格分隔格式在部分浏览器解析不稳,还会引入时区偏移
  const listTime = computed(() => String(props.note?.updateTime ?? props.note?.createTime ?? '').slice(0, 10));

  const emit = defineEmits(['nodeTypeChange']);
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
    router.push(`/noteLibrary/${props.note.id}`);
  }
</script>

<style lang="less" scoped>
  .note-list-item {
    // 标题与右侧时间共用同一行高,时间不再靠写死的 line-height 去凑基线
    --note-row-line: 22px;

    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) auto;
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

    &.is-mobile {
      grid-template-columns: minmax(0, 1fr) auto;
      // 触控端不跟着桌面一起压扁
      padding: 14px;
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
      .note-top-badge {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        padding: 2px 7px;
        border-radius: 999px;
        color: var(--resource-note-color, #00a884);
        background: color-mix(in srgb, var(--resource-note-color, #00a884) 12%, transparent);
        font-size: 11px;
        font-weight: 600;
        line-height: 18px;
      }
      .note-meta-row {
        display: flex;
        align-items: center;
        gap: 12px;
        // 无摘要也无标签时保持同样的行高
        min-height: 20px;
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
        flex: 0 0 auto;
        display: flex;
        gap: 6px;
        align-items: center;
        .b-tag {
          background-color: var(--tag-bg-color, #eeedff);
          color: var(--tag-color, #8b88f2);
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 500;
          line-height: 16px;
          cursor: pointer;
          transition:
            background-color 0.2s ease,
            color 0.2s ease;
          max-width: 120px;
          // 只加深底色,不做实心反白:列表里标签是次要信息,hover 不该抢焦点,
          // 也避免原来写死的 #605ce5 / white 在两套主题下都是同一个色
          &:hover {
            background-color: color-mix(in srgb, var(--tag-color, #8b88f2) 20%, var(--tag-bg-color, #eeedff));
          }
        }
        .tag-more {
          background-color: var(--common-tag-bg-color, #f0f0f0);
          color: var(--desc-color);
          cursor: default;

          &:hover {
            background-color: var(--common-tag-bg-color, #f0f0f0);
          }
        }
      }
      // 详情角标统一由 assets/css/common.less 负责,这里不做局部覆盖
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
