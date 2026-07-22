<template>
  <aside class="ai-conv-sidebar" :aria-label="t('ai.conversations.title')">
    <div class="ai-conv-sidebar__head">
      <BButton class="ai-conv-sidebar__new" type="primary" @click="emit('new')">
        <SvgIcon :src="icon.common.add" size="14" aria-hidden="true" />
        {{ t('ai.newConversation') }}
      </BButton>
      <BButton
        class="ai-conv-sidebar__manage"
        size="small"
        :title="t('ai.conversations.title')"
        :aria-label="t('ai.conversations.title')"
        @click="emit('manage')"
      >
        <SvgIcon :src="icon.ai.conversations" size="15" aria-hidden="true" />
      </BButton>
    </div>
    <div class="ai-conv-sidebar__list" role="list">
      <BLoading v-if="loading && !items.length" inline loading :title="t('common.loading')" />
      <p v-else-if="!items.length" class="ai-conv-sidebar__empty">{{ t('ai.conversations.empty') }}</p>
      <!-- role=listitem 放在外层 div,button 保留原生 button 语义(读屏正确识别为可操作按钮)。
           这里刻意用原生 button 而非 BButton:BButton 的 .b_btn(定高/居中/max-content)会把多行标题挤没,见下方样式注释 -->
      <div v-for="conv in items" :key="conv.id" role="listitem" class="ai-conv-sidebar__item-wrap">
        <button
          type="button"
          class="ai-conv-sidebar__item"
          :class="{ 'is-active': conv.id === currentId }"
          :aria-current="conv.id === currentId ? 'true' : undefined"
          :title="conv.title || t('ai.conversations.untitled')"
          @click="emit('open', conv.id)"
        >
          <span class="ai-conv-sidebar__item-title">{{ conv.title || t('ai.conversations.untitled') }}</span>
          <time class="ai-conv-sidebar__item-time" :datetime="conv.lastMessageAt">{{
            relativeTime(conv.lastMessageAt)
          }}</time>
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
  import { onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { listAiConversations, type AiConversationSummary } from '@/api/aiWorkspaceApi';

  const props = defineProps<{ currentId: string; refreshToken?: number }>();
  const emit = defineEmits<{ open: [id: string]; new: []; manage: [] }>();
  const { t, locale } = useI18n();
  const items = ref<AiConversationSummary[]>([]);
  const loading = ref(false);
  let loadSeq = 0;

  async function load() {
    const seq = ++loadSeq;
    loading.value = true;
    try {
      const result = await listAiConversations({ status: 'active', limit: 40 });
      if (seq !== loadSeq) return;
      items.value = result.items;
    } catch {
      if (seq === loadSeq) items.value = [];
    } finally {
      if (seq === loadSeq) loading.value = false;
    }
  }

  function relativeTime(value: string) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '';
    const delta = timestamp - Date.now();
    const formatter = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
    const minutes = Math.round(delta / 60_000);
    if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
    const hours = Math.round(delta / 3_600_000);
    if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
    return formatter.format(Math.round(delta / 86_400_000), 'day');
  }

  // 会话有变动(新建/切换/发消息改名/删除/清空)时父级 bump refreshToken,列表随之刷新。
  watch(() => props.refreshToken, () => void load());
  onMounted(() => void load());
</script>

<style scoped lang="less">
  .ai-conv-sidebar {
    display: flex;
    flex-direction: column;
    width: 248px;
    flex-shrink: 0;
    height: 100%;
    box-sizing: border-box;
    border-right: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color, var(--background-color));
  }

  .ai-conv-sidebar__head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    flex-shrink: 0;
  }

  .ai-conv-sidebar__new {
    flex: 1;
    justify-content: center;
    gap: 6px;
  }

  .ai-conv-sidebar__manage {
    flex: 0 0 auto;
    width: 32px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .ai-conv-sidebar__list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .ai-conv-sidebar__empty {
    padding: 20px 8px;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  .ai-conv-sidebar__item {
    width: 100%;
    min-height: 46px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    padding: 7px 10px;
    /* 原生 button 复位:此前用 BButton,.b_btn 的居中横向布局把标题挤没了 */
    border: none;
    background: none;
    cursor: pointer;
    font: inherit;
    appearance: none;
    -webkit-appearance: none;
    border-radius: 9px;
    text-align: left;
    color: var(--text-color);
  }

  .ai-conv-sidebar__item:hover {
    background: color-mix(in srgb, var(--primary-color) 7%, transparent);
  }

  .ai-conv-sidebar__item.is-active {
    background: color-mix(in srgb, var(--primary-color) 13%, var(--card-background));
    color: var(--primary-color);
  }

  .ai-conv-sidebar__item-title {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .ai-conv-sidebar__item-time {
    font-size: 11px;
    color: var(--desc-color);
  }

  .ai-conv-sidebar__item.is-active .ai-conv-sidebar__item-time {
    color: color-mix(in srgb, var(--primary-color) 70%, var(--desc-color));
  }
</style>
