<template>
  <!--
    移动端用底部抽屉、桌面端用居中弹框 —— 与 QuickCaptureModal 同一套外壳切换模式。
    居中弹框在手机上撑满屏幕仍是桌面味道；bottom sheet 才有从底部升起、下滑关闭的手感。
    BDrawer 没有内置 footer，所以移动端的「确定/取消」由下面那条固定操作条承担。
  -->
  <component
    :is="shellComponent"
    v-bind="shellProps"
    @ok="handleOk"
    @close="handleShellClose"
    @update:visible="syncVisible"
  >
    <!--
      内容与操作条同属一个 shell：内容不足时靠 margin-top:auto 把操作条压到底，
      内容超出时靠它自己的 sticky 吸附。少了这层，空状态下 sticky 不生效，
      按钮会停在内容末尾，等接口返回后再跳到底部。
    -->
    <div class="tag-config-shell" :class="{ 'is-sheet': bookmark.isMobile }">
      <div class="tag-config" :class="{ mobile: bookmark.isMobile }">
        <div class="panel selected-panel">
          <div class="panel-header">
            <div class="title">
              {{ $t('note.tagConfig.selectedTags') }}
              <span class="selected-count-badge">{{ noteTags.length }}</span>
            </div>
            <b-button
              size="small"
              @click="resetTags"
              v-click-log="{ module: '笔记-标签配置', operation: '重置标签' }"
              >{{ $t('note.tagConfig.reset') }}</b-button
            >
          </div>
          <div class="panel-subtitle">{{ $t('note.tagConfig.selectedDesc') }}</div>
          <div class="selected-overview">
            <div class="overview-count">{{ noteTags.length }}</div>
            <div class="overview-text">{{ $t('note.tagConfig.selectedCountText', { count: noteTags.length }) }}</div>
          </div>
          <div class="chip-list" v-if="noteTags.length">
            <BChip v-for="tag in noteTags" :key="tag.id" class="chip" tone="tag" size="medium">
              <span class="color-dot" />
              <span class="chip-text">{{ tag.name }}</span>
              <BButton
                class="chip-close"
                :title="t('common.delete')"
                :aria-label="t('common.delete')"
                @click.stop="unbindTag(tag)"
                v-click-log="{ module: '笔记-标签配置', operation: `解绑标签【${tag.name}】` }"
              >
                <SvgIcon :src="icon.common.close" size="13" aria-hidden="true" />
              </BButton>
            </BChip>
          </div>
          <div class="empty" v-else>{{ $t('note.tagConfig.noTags') }}</div>
        </div>

        <div class="panel library-panel">
          <div class="panel-header panel-header--library">
            <div>
              <!--
              「刷新」与「标签管理」都已移除：
              新建、改名都在弹框内就地完成，列表由操作本身即时更新，没有「去别处改完
              回来同步」的场景了，刷新按钮失去了用途。而「标签管理」是一次跳页 ——
              在这个「给笔记绑标签」的流程里点它意味着放弃当前未保存的绑定改动；
              标签管理在桌面顶部导航和移动端「资料」区都有独立入口，不必在这里重复。
            -->
              <div class="title flex-align-center-gap">{{ $t('note.tagConfig.tagLibrary') }}</div>
              <div class="panel-subtitle panel-subtitle--tight">{{ $t('note.tagConfig.sharedDesc') }}</div>
            </div>
            <div class="tag-actions">
              <!--
              就地新建：原来 window.open 到标签编辑页，用户要离开当前上下文、
              建完自己切回来、手动刷新标签库、再手动点绑定。这里建完即绑。
            -->
              <InlineTagCreate
                :existing-tags="allTags"
                guard-scene="create-note-tag"
                @created="handleTagCreated"
                @reused="handleTagReused"
                @stale="fetchAllTags"
              />
            </div>
          </div>

          <div class="tag-toolbar">
            <b-input v-model:value="searchValue" :maxlength="20" :placeholder="t('note.tagConfig.tagSearch')" />
          </div>

          <div v-auto-scrollbar class="tag-list">
            <div
              v-for="tag in filteredTags"
              :key="tag.id"
              class="tag-row"
              :class="{ active: isTagBound(tag.id), 'is-renaming': renamingTagId === tag.id }"
              @click="renamingTagId === tag.id ? undefined : toggleTag(tag)"
              v-click-log="{ module: '笔记-标签配置', operation: `切换标签绑定【${tag.name}】` }"
            >
              <!-- 改名就地进行：整行换成输入行，不再跳到标签编辑页 -->
              <InlineTagRename
                v-if="renamingTagId === tag.id"
                :tag="tag"
                :existing-tags="allTags"
                guard-scene="rename-note-tag"
                @renamed="handleTagRenamed"
                @cancel="renamingTagId = ''"
              />
              <template v-else>
                <div class="tag-left">
                  <span class="color-dot" />
                  <div class="tag-text">
                    <div class="tag-name">{{ tag.name }}</div>
                    <div class="tag-state">
                      <SvgIcon
                        v-if="bookmark.isMobile && isTagBound(tag.id)"
                        :src="icon.filterPanel.check"
                        size="13"
                        aria-hidden="true"
                      />
                      {{ isTagBound(tag.id) ? $t('note.tagConfig.bound') : $t('note.tagConfig.unbound') }}
                    </div>
                  </div>
                </div>
                <div class="tag-meta">
                  <b-button
                    size="small"
                    @click.stop="renamingTagId = tag.id"
                    v-click-log="{ module: '笔记-标签配置', operation: `改名标签【${tag.name}】` }"
                    >{{ t('tagInlineRename.entry') }}</b-button
                  >
                </div>
              </template>
            </div>
            <div v-if="!filteredTags.length" class="empty">{{ $t('note.tagConfig.noTagsCreate') }}</div>
          </div>
        </div>
      </div>

      <!-- 抽屉没有内置 footer：移动端自己给一条贴底的操作条，滚动内容时它不跟着走 -->
      <div v-if="bookmark.isMobile" class="tag-config-footer">
        <b-button type="primary" @click="handleOk">{{ $t('common.confirm') }}</b-button>
        <b-button @click="visible = false">{{ $t('common.cancel') }}</b-button>
      </div>
    </div>
  </component>
</template>

<script lang="ts" setup>
  import { computed, inject, onMounted, ref } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import InlineTagCreate from '@/components/tag/InlineTagCreate.vue';
  import InlineTagRename from '@/components/tag/InlineTagRename.vue';

  interface TagItem {
    id: string;
    name: string;
  }

  const { t } = useI18n();
  const props = defineProps<{ note?: any }>();
  const visible = defineModel('visible');
  const emit = defineEmits<{ saveTag: [tags: TagItem[]] }>();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const injectedNote: any = inject('note', null);
  const currentNote = computed(() => props.note ?? injectedNote);

  const allTags = ref<TagItem[]>([]);
  const noteTags = ref<TagItem[]>([]);
  const initialNoteTags = ref<TagItem[]>([]);
  const searchValue = ref('');
  /** 正在就地改名的标签 id，空串表示没有行处于编辑态 */
  const renamingTagId = ref('');

  /*
   * 移动端 bottom sheet、桌面端居中弹框。抽屉留出上下呼吸位，内容自己滚动；
   * 两端都不允许点遮罩关闭 —— 未点确定的绑定改动会丢，误触代价太大。
   */
  const shellComponent = computed(() => (bookmark.isMobile ? BDrawer : BModal));
  const shellProps = computed(() =>
    bookmark.isMobile
      ? {
          open: visible.value === true,
          title: t('note.tagConfig.title'),
          placement: 'bottom' as const,
          height: 'min(92dvh, 760px)',
          // 底部 padding 交给操作条自己承担：sticky 的 bottom:0 停在 padding box 内边缘，
          // 留着 12px 就会从操作条下方透出滚动内容
          bodyPadding: '12px 12px 0',
          maskClosable: false,
        }
      : {
          visible: visible.value === true,
          title: t('note.tagConfig.title'),
          maskClosable: false,
          wrapClassName: 'note-tag-modal',
        },
  );

  /** BDrawer 用 @close，BModal 用 v-model:visible —— 统一收敛成一处关闭。 */
  function handleShellClose() {
    visible.value = false;
  }
  function syncVisible(next: boolean) {
    visible.value = next;
  }

  const filteredTags = computed(() => {
    const keyword = searchValue.value.trim().toLowerCase();
    if (!keyword) return allTags.value;
    return allTags.value.filter((tag) => tag.name.toLowerCase().includes(keyword));
  });

  onMounted(() => {
    fetchAllTags();
    fetchNoteTags();
  });

  async function fetchAllTags() {
    const res = await apiQueryPost('/api/bookmark/queryTagList', {
      filters: { userId: user.id },
    });
    if (res.status === 200) {
      allTags.value = (res.data ?? []).map(normalizeTag);
    }
  }

  async function fetchNoteTags() {
    if (!currentNote.value?.id) return;
    try {
      const res = await apiBasePost('/api/note/getNoteTags', { id: currentNote.value.id });
      if (res.status === 200) {
        noteTags.value = (res.data ?? []).map(normalizeTag);
        initialNoteTags.value = [...noteTags.value];
        return;
      }
    } catch (error) {
      console.warn('fetchNoteTags fallback', error);
    }
    hydrateFromLocal();
  }

  function normalizeTag(raw: any): TagItem {
    return {
      id: String(raw.id),
      name: raw.name ?? '',
    };
  }

  function hydrateFromLocal() {
    if (!currentNote.value?.tags) return;
    try {
      const parsed =
        typeof currentNote.value.tags === 'string' ? JSON.parse(currentNote.value.tags) : currentNote.value.tags;
      if (Array.isArray(parsed)) {
        const ids = parsed.map((v) => String(v?.id ?? v)).filter(Boolean);
        noteTags.value = allTags.value.filter((t) => ids.includes(t.id));
        initialNoteTags.value = [...noteTags.value];
      }
    } catch (error) {
      console.warn('parse note.tags failed', error);
    }
  }

  function isTagBound(tagId: string) {
    return noteTags.value.some((t) => t.id === tagId);
  }

  /**
   * 就地新建成功：先刷新标签库让它出现在列表里，再绑定到当前笔记。
   * 笔记最多绑 3 个标签，已满时只提示「已创建」——标签本身是建好了的，
   * 不能让用户以为创建失败；也不走 bindTag 以免弹出第二条上限提示。
   */
  async function handleTagCreated(tag: { id: string; name: string }) {
    await fetchAllTags();
    // 刷新失败时列表里找不到新标签，退回最小对象：已选区只用 id 和 name 展示
    const created = allTags.value.find((item) => item.id === tag.id) ?? normalizeTag(tag);
    if (noteTags.value.length >= 3) {
      message.warning(t('tagInlineCreate.createdOnly', { name: tag.name }));
      return;
    }
    noteTags.value.push(created);
    message.success(t('tagInlineCreate.created', { name: tag.name }));
    recordOperation({ module: '笔记-标签配置', operation: `新建共享标签【${tag.name}】` });
  }

  /**
   * 就地改名成功：同步标签库与已选区里的名字，不重新拉列表。
   * 已选区是本地待保存状态，重拉会把用户还没点确定的绑定改动冲掉。
   */
  function handleTagRenamed(tag: { id: string; name: string }) {
    const apply = (list: TagItem[]) => {
      const target = list.find((item) => item.id === tag.id);
      if (target) target.name = tag.name;
    };
    apply(allTags.value);
    apply(noteTags.value);
    apply(initialNoteTags.value);
    renamingTagId.value = '';
    message.success(t('tagInlineRename.renamed', { name: tag.name }));
    recordOperation({ module: '笔记-标签配置', operation: `标签改名【${tag.name}】` });
  }

  /** 输入的名字已存在：直接复用，不报错也不重复创建。 */
  function handleTagReused(tag: { id: string; name: string }) {
    const existing = allTags.value.find((item) => item.id === tag.id) ?? normalizeTag(tag);
    if (isTagBound(existing.id)) {
      message.info(t('tagInlineCreate.reusedBound', { name: existing.name }));
      return;
    }
    if (noteTags.value.length >= 3) {
      message.warning(t('note.tagConfig.maxTags'));
      return;
    }
    noteTags.value.push(existing);
    message.info(t('tagInlineCreate.reused', { name: existing.name }));
  }

  function bindTag(tag: TagItem) {
    if (isTagBound(tag.id)) {
      message.warning(t('note.tagConfig.tagBound'));
      return;
    }
    if (noteTags.value.length >= 3) {
      message.warning(t('note.tagConfig.maxTags'));
      return;
    }
    noteTags.value.push(tag);
  }

  function unbindTag(tag: TagItem) {
    noteTags.value = noteTags.value.filter((t) => t.id !== tag.id);
  }

  function toggleTag(tag: TagItem) {
    if (isTagBound(tag.id)) {
      unbindTag(tag);
      return;
    }
    bindTag(tag);
  }

  function resetTags() {
    noteTags.value = [...initialNoteTags.value];
  }

  async function handleOk() {
    if (blockGuestWrite('update-note-tags')) return;
    if (!currentNote.value?.id) {
      message.warning(t('note.tagConfig.noteNotSaved'));
      return;
    }
    const newTagIds = noteTags.value.map((t) => t.id);
    const res = await apiBasePost('/api/note/updateNoteTags', { noteId: currentNote.value.id, tags: newTagIds });
    if (res.status === 200) {
      visible.value = false;
      emit('saveTag', [...noteTags.value]);
      message.success(t('note.tagConfig.saveSuccess'));
      recordOperation({ module: '笔记-标签配置', operation: `保存笔记标签成功【${noteTags.value.length}个】` });
    }
  }
</script>

<style lang="less" scoped>
  .tag-config {
    width: min(74vw, 980px);
    /*
     * 桌面端由内容区统一决定弹框高度，标签数量和搜索结果只改变列表内部滚动。
     * 与 FileTagConfig 使用同一高度模型：常规视口固定 460px，较矮视口按可用空间收缩。
     */
    height: min(460px, calc(100vh - 190px));
    min-height: 360px;
    display: grid;
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
    gap: 18px;
    color: var(--text-color);

    &.mobile {
      width: 100%;
      height: auto;
      min-height: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: hidden;
    }
  }

  /*
   * 移动端抽屉里的贴底操作条：抽屉高度固定、内容自己滚动，操作条不能跟着滚走。
   * 用 sticky 而不是 fixed —— fixed 会脱离抽屉、在软键盘弹起时错位。
   */
  /*
   * sticky 只在「内容超出容器」时才吸附：空状态内容矮，按钮会停在内容末尾，
   * 等接口返回、列表变高后才跳到底部 —— 就是打开抽屉时看到的那次高度跳动。
   * 让 shell 至少撑满 body 高度，再用 margin-top:auto 把操作条压到底，
   * 空状态与有数据时按钮位置一致；内容超出时仍由 sticky 接管。
   */
  .tag-config-shell.is-sheet {
    display: flex;
    height: 100%;
    min-height: 100%;
    flex-direction: column;
    overflow: hidden;
  }
  .tag-config-shell.is-sheet .tag-config-footer {
    margin-top: auto;
  }

  .tag-config-footer {
    position: sticky;
    bottom: 0;
    flex: 0 0 auto;
    display: flex;
    gap: 10px;
    /* 抽屉 body 底部 padding 已归零，这里补齐呼吸位与安全区 */
    padding: 10px 0 calc(12px + env(safe-area-inset-bottom, 0px));
    margin-top: 8px;
    background: var(--background-color);
    /* 内容滚到底之前，操作条与列表之间要有一条可见分界 */
    border-top: 1px solid var(--card-border-color);
  }
  .tag-config-footer :deep(.b_btn) {
    flex: 1 1 0;
    /* 触控高度不低于 44px（design.md 的移动端要求） */
    min-height: 44px;
  }

  .panel {
    min-width: 0;
    min-height: 0;
    background: var(--background-color);
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    padding: 16px;
    box-shadow: var(--ant-table-boxShadow);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }

  .panel-header--library {
    align-items: flex-start;
  }

  .library-panel {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .title {
    font-weight: 600;
    font-size: 16px;
    color: var(--text-color);
  }

  .selected-count-badge {
    display: none;
  }

  .panel-subtitle {
    font-size: 12px;
    color: var(--desc-color);
    margin: 0 0 10px;
    line-height: 1.5;
  }

  .panel-subtitle--tight {
    margin: 6px 0 0;
  }

  .selected-overview {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    margin-bottom: 14px;
    background: color-mix(in srgb, var(--noteType-hover-color) 10%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--noteType-hover-color) 24%, var(--card-border-color));
  }

  .overview-count {
    min-width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 700;
    color: var(--noteType-hover-color);
    background: color-mix(in srgb, var(--noteType-hover-color) 14%, white);
  }

  .overview-text {
    font-size: 13px;
    line-height: 1.5;
    color: var(--desc-color);
  }

  /*
   * 已选标签横向排布：标签名多是「SSL」「证书」这种两三个字，
   * 原来每个 chip 独占一行，三个标签就吃掉半屏（移动端只有一栏时尤其浪费）。
   * 上限 3 个标签，横排通常一行就放完。
   */
  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 48px;
    align-items: flex-start;
  }

  .chip {
    max-width: 100%;
    min-width: 0;

    :deep(.b-chip__content) {
      width: 100%;
      gap: 6px;
    }
  }

  .color-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--chip-tag-fg);
    flex: 0 0 auto;
  }

  .chip-text {
    min-width: 0;
    /* 横排下 chip 取内容宽度：flex:1 会把每个 chip 拉成满宽，又变回一行一个 */
    flex: 0 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.chip-close.b_btn) {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    min-height: 18px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: inherit;
    background: transparent;

    &:hover {
      color: var(--chip-tag-hover-fg);
      background: var(--chip-tag-hover-bg);
    }
  }

  .tag-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }

  .tag-toolbar {
    margin-bottom: 12px;
  }

  .tag-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    max-height: 360px;
    overflow: auto;
    padding: 2px 2px 0;
  }

  .tag-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--background-color);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;
    cursor: pointer;

    &:hover {
      border-color: rgba(96, 92, 229, 0.4);
      transform: translateY(-1px);
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.12);
    }

    &.active {
      border-color: rgba(96, 92, 229, 0.75);
      box-shadow: 0 0 0 1px rgba(96, 92, 229, 0.18);
      background: color-mix(in srgb, var(--noteType-hover-color) 7%, var(--background-color));
    }
  }

  .tag-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .tag-text {
    min-width: 0;
  }

  .tag-name {
    font-weight: 600;
    color: var(--text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag-state {
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--desc-color);
  }

  .tag-meta {
    flex: 0 0 auto;
  }

  .empty {
    color: var(--desc-color);
    font-size: 13px;
    padding: 16px 0;
    text-align: center;
  }

  @media (max-width: 900px) {
    .panel-header--library {
      flex-direction: column;
      align-items: stretch;
    }

    .tag-actions {
      justify-content: flex-start;
    }

    .tag-config.mobile {
      .panel {
        padding: 10px;
        border-radius: var(--mobile-control-radius, 10px);
        box-shadow: none;
      }

      .selected-panel {
        display: grid;
        flex: 0 0 auto;
        gap: 8px;
      }

      .panel-header {
        align-items: center;
        margin: 0;
      }

      .panel-subtitle,
      .selected-overview {
        display: none;
      }

      .title {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 14px;
      }

      .selected-count-badge {
        min-width: 23px;
        height: 23px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 6px;
        box-sizing: border-box;
        border: 1px solid var(--resource-tag-color);
        border-radius: 999px;
        color: var(--resource-tag-color);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }

      .chip-list {
        min-height: 0;
        flex-wrap: nowrap;
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 2px;
        scrollbar-width: thin;
      }

      .chip {
        flex: 0 0 auto;
        max-width: min(72vw, 250px);
      }

      .selected-panel > .empty {
        padding: 4px 0;
        text-align: left;
      }

      .library-panel {
        flex: 1 1 auto;
        grid-template-rows: auto auto minmax(0, 1fr);
        overflow: hidden;
      }

      .panel-header--library {
        min-height: 34px;
        flex-direction: row;
      }

      .tag-actions {
        flex: 0 0 auto;
        justify-content: flex-end;
      }

      .tag-toolbar {
        margin: 8px 0;
      }

      .tag-list {
        max-height: none;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
      }

      .tag-row {
        min-height: 58px;
        padding: 8px 10px;

        &.active {
          border-color: var(--resource-tag-color);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--resource-tag-color) 18%, transparent);
          background: color-mix(in srgb, var(--resource-tag-color) 8%, var(--background-color));
        }
      }
    }
  }

  html.light-note-mobile-rendering .tag-config.mobile .tag-row.active,
  html.light-note-mobile-rendering .tag-config.mobile .selected-count-badge {
    border-color: var(--resource-tag-color);
  }
</style>
