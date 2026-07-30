<template>
  <aside class="ai-conv-sidebar" :aria-label="t('ai.conversations.title')">
    <div class="ai-conv-sidebar__head">
      <BButton class="ai-conv-sidebar__new" type="primary" @click="emit('new')">
        <SvgIcon :src="icon.common.add" size="14" aria-hidden="true" />
        {{ t('ai.newConversation') }}
      </BButton>
      <BInput
        v-model:value="keyword"
        clearable
        :placeholder="t('ai.conversations.searchPlaceholder')"
        @input="scheduleLoad"
        @enter="load"
      />
      <div class="ai-conv-sidebar__filters">
        <BSelect
          v-model:value="status"
          :options="statusOptions"
          :aria-label="t('ai.conversations.statusFilter')"
          @change="load"
        />
        <BSelect
          v-model:value="folderFilter"
          :options="folderOptions"
          :aria-label="t('ai.conversations.folderFilter')"
          @change="load"
        />
      </div>
    </div>

    <div class="ai-conv-sidebar__list" role="list">
      <BLoading v-if="loading && !items.length" inline loading :title="t('common.loading')" />
      <p v-else-if="!items.length" class="ai-conv-sidebar__empty">
        {{ keyword.trim() || folderFilter ? t('ai.conversations.noMatch') : t('ai.conversations.empty') }}
      </p>
      <section v-for="group in groupedItems" :key="group.key" class="ai-conv-sidebar__group">
        <h3>{{ group.label }}</h3>
        <div v-for="conv in group.items" :key="conv.id" role="listitem" class="ai-conv-sidebar__item-wrap">
          <BButton
            class="ai-conv-sidebar__item"
            :class="{ 'is-active': conv.id === currentId }"
            :aria-current="conv.id === currentId ? 'true' : undefined"
            :title="conv.title || t('ai.conversations.untitled')"
            @click="emit('open', conv.id)"
          >
            <span class="ai-conv-sidebar__item-title">
              <SvgIcon v-if="conv.isPinned" :src="icon.contextMenu.pin" size="12" aria-hidden="true" />
              {{ conv.title || t('ai.conversations.untitled') }}
            </span>
            <time class="ai-conv-sidebar__item-time" :datetime="conv.lastMessageAt">
              {{ relativeTime(conv.lastMessageAt) }}
            </time>
          </BButton>

          <BPopover
            :open="menuOpenId === conv.id"
            trigger="click"
            placement="bottom-right"
            overlay-class-name="ai-conv-sidebar-menu"
            @update:open="(value) => (menuOpenId = value ? conv.id : '')"
          >
            <BButton
              class="ai-conv-sidebar__more"
              :aria-label="t('ai.conversations.moreActions')"
              :title="t('ai.conversations.moreActions')"
              @click.stop
            >
              <SvgIcon :src="icon.common.more" size="16" aria-hidden="true" />
            </BButton>
            <template #content>
              <div class="ai-conv-sidebar-menu__content">
                <BButton :loading="mutatingId === conv.id" @click="togglePinned(conv)">
                  <SvgIcon
                    :src="conv.isPinned ? icon.contextMenu.unpin : icon.contextMenu.pin"
                    size="14"
                    aria-hidden="true"
                  />
                  {{ t(conv.isPinned ? 'ai.conversations.unpin' : 'ai.conversations.pin') }}
                </BButton>
                <BButton :loading="mutatingId === conv.id" @click="toggleArchived(conv)">
                  <SvgIcon :src="icon.common.folder" size="14" aria-hidden="true" />
                  {{ t(conv.status === 'archived' ? 'ai.conversations.restore' : 'ai.conversations.archive') }}
                </BButton>
                <div class="ai-conv-sidebar-menu__folder">
                  <BInput
                    v-model:value="folderDraft[conv.id]"
                    :maxlength="64"
                    clearable
                    :placeholder="t('ai.conversations.folderPlaceholder')"
                    @enter="saveFolder(conv)"
                  />
                  <BButton type="primary" :loading="mutatingId === conv.id" @click="saveFolder(conv)">
                    {{ t('common.save') }}
                  </BButton>
                </div>
              </div>
            </template>
          </BPopover>
        </div>
      </section>
      <BButton v-if="nextCursor" class="ai-conv-sidebar__load-more" :loading="loadingMore" @click="loadMore">
        {{ t('common.loadMore') }}
      </BButton>
    </div>
  </aside>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon.ts';
  import {
    listAiConversations,
    updateAiConversation,
    type AiConversationStatus,
    type AiConversationSummary,
  } from '@/api/aiWorkspaceApi';

  const props = defineProps<{ currentId: string; refreshToken?: number }>();
  const emit = defineEmits<{ open: [id: string]; new: [] }>();
  const { t, locale } = useI18n();
  const items = ref<AiConversationSummary[]>([]);
  const folders = ref<string[]>([]);
  const status = ref<AiConversationStatus>('active');
  const folderFilter = ref('');
  const keyword = ref('');
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const mutatingId = ref('');
  const menuOpenId = ref('');
  const folderDraft = reactive<Record<string, string>>({});
  let loadSeq = 0;
  let searchTimer = 0;

  const statusOptions = computed(() => [
    { value: 'active', label: t('ai.conversations.active') },
    { value: 'archived', label: t('ai.conversations.archived') },
  ]);
  const folderOptions = computed(() => [
    { value: '', label: t('ai.conversations.allFolders') },
    { value: '__unfiled__', label: t('ai.conversations.unfiled') },
    ...folders.value.map((folder) => ({ value: folder, label: folder })),
  ]);
  const groupedItems = computed(() => {
    if (folderFilter.value && folderFilter.value !== '__unfiled__') {
      return [{ key: `folder:${folderFilter.value}`, label: folderFilter.value, items: items.value }];
    }
    const groups: Array<{ key: string; label: string; items: AiConversationSummary[] }> = [];
    const pinned = items.value.filter((item) => item.isPinned);
    if (pinned.length) groups.push({ key: 'pinned', label: t('ai.conversations.pinned'), items: pinned });
    const regular = items.value.filter((item) => !item.isPinned);
    const byFolder = new Map<string, AiConversationSummary[]>();
    regular.forEach((item) => {
      const key = item.folderName || '';
      const list = byFolder.get(key) || [];
      list.push(item);
      byFolder.set(key, list);
    });
    for (const [folder, groupItems] of byFolder) {
      groups.push({
        key: folder ? `folder:${folder}` : 'unfiled',
        label: folder || t('ai.conversations.unfiled'),
        items: groupItems,
      });
    }
    return groups;
  });

  async function load(reset = true) {
    const seq = ++loadSeq;
    if (reset) loading.value = true;
    else loadingMore.value = true;
    try {
      const result = await listAiConversations({
        status: status.value,
        keyword: keyword.value.trim() || undefined,
        folderName: folderFilter.value || undefined,
        cursor: reset ? undefined : nextCursor.value || undefined,
        limit: 40,
      });
      if (seq !== loadSeq) return;
      items.value = reset ? result.items : [...items.value, ...result.items];
      folders.value = result.folders || [];
      nextCursor.value = result.nextCursor;
      result.items.forEach((item) => {
        folderDraft[item.id] = item.folderName || '';
      });
    } catch {
      if (seq === loadSeq && reset) items.value = [];
      message.warning(t('ai.conversations.loadFailed'));
    } finally {
      if (seq === loadSeq) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  function scheduleLoad() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void load(), 220);
  }

  function loadMore() {
    if (nextCursor.value && !loadingMore.value) void load(false);
  }

  async function updateConversation(conv: AiConversationSummary, patch: Record<string, unknown>) {
    if (mutatingId.value) return;
    mutatingId.value = conv.id;
    try {
      const updated = await updateAiConversation(conv.id, patch);
      if (patch.status && patch.status !== status.value) {
        items.value = items.value.filter((item) => item.id !== conv.id);
      } else {
        Object.assign(conv, updated);
      }
      folders.value = Array.from(new Set([...folders.value, updated.folderName].filter(Boolean))).sort();
      menuOpenId.value = '';
    } catch {
      message.warning(t('ai.conversations.updateFailed'));
    } finally {
      mutatingId.value = '';
    }
  }

  function togglePinned(conv: AiConversationSummary) {
    void updateConversation(conv, { isPinned: !conv.isPinned });
  }

  function toggleArchived(conv: AiConversationSummary) {
    void updateConversation(conv, { status: conv.status === 'archived' ? 'active' : 'archived' });
  }

  function saveFolder(conv: AiConversationSummary) {
    void updateConversation(conv, { folderName: String(folderDraft[conv.id] || '').trim() });
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

  watch(
    () => props.refreshToken,
    () => void load(),
  );
  onMounted(() => void load());
  onBeforeUnmount(() => window.clearTimeout(searchTimer));
</script>

<style scoped lang="less">
  .ai-conv-sidebar {
    display: flex;
    flex-direction: column;
    width: 268px;
    flex-shrink: 0;
    height: 100%;
    box-sizing: border-box;
    border-right: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color, var(--background-color));
  }
  .ai-conv-sidebar__head {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 10px 8px;
    flex-shrink: 0;
  }
  .ai-conv-sidebar__new {
    width: 100%;
    justify-content: center;
    gap: 6px;
  }
  .ai-conv-sidebar__filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .ai-conv-sidebar__list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 7px 12px;
  }
  .ai-conv-sidebar__empty {
    padding: 20px 8px;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }
  .ai-conv-sidebar__group h3 {
    margin: 8px 8px 4px;
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 650;
  }
  .ai-conv-sidebar__item-wrap {
    position: relative;
    display: flex;
    min-width: 0;
    align-items: center;
    border-radius: 9px;
  }
  .ai-conv-sidebar__item.b_btn {
    width: 100%;
    min-width: 0;
    height: 48px;
    padding: 6px 36px 6px 10px;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    border-radius: 9px;
    background: transparent;
    line-height: 1.25;
    text-align: left;
  }
  .ai-conv-sidebar__item:hover,
  .ai-conv-sidebar__item.is-active {
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }
  .ai-conv-sidebar__item.is-active {
    color: var(--primary-color);
  }
  .ai-conv-sidebar__item-title {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .ai-conv-sidebar__item-time {
    color: var(--desc-color);
    font-size: 11px;
  }
  .ai-conv-sidebar__more.b_btn {
    position: absolute;
    right: 4px;
    top: 8px;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 8px;
    opacity: 0;
  }
  .ai-conv-sidebar__item-wrap:hover .ai-conv-sidebar__more,
  .ai-conv-sidebar__more:focus-visible {
    opacity: 1;
  }
  .ai-conv-sidebar__load-more {
    width: calc(100% - 12px);
    margin: 8px 6px 0;
  }
</style>

<style lang="less">
  .ai-conv-sidebar-menu {
    width: 240px;
    padding: 7px;
  }
  .ai-conv-sidebar-menu__content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ai-conv-sidebar-menu__content > .b_btn {
    width: 100%;
    justify-content: flex-start;
    gap: 7px;
  }
  .ai-conv-sidebar-menu__folder {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    padding-top: 5px;
    border-top: 1px solid var(--surface-divider-color);
  }
  @media (hover: none) {
    .ai-conv-sidebar__more.b_btn {
      opacity: 1;
    }
  }
</style>
