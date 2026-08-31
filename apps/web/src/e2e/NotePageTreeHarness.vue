<template>
  <div
    class="note-page-tree-harness"
    :class="{ 'is-mobile': isMobile, 'is-batch-mode': batchMode }"
    data-testid="note-page-tree-harness"
  >
    <header class="harness-topbar">
      <div class="harness-brand">
        <span class="harness-brand-icon" aria-hidden="true">
          <SvgIcon :src="icon.resource.note" size="20" />
        </span>
        <strong>轻笺</strong>
      </div>
      <nav v-if="!isMobile" class="harness-nav" aria-label="主导航">
        <span>书签</span>
        <strong>笔记库</strong>
        <span>云空间</span>
        <span>标签</span>
        <span>待办</span>
      </nav>
      <div class="harness-top-actions">
        <BButton v-if="!isMobile" size="small">搜索</BButton>
        <BButton size="small" :aria-label="isMobile ? '新建' : undefined">
          <SvgIcon :src="icon.common.plus" size="16" aria-hidden="true" />
          <span v-if="!isMobile">新建</span>
        </BButton>
      </div>
    </header>

    <section v-if="isMobile" class="harness-mobile-summary" data-testid="mobile-summary">
      <div>
        <small>笔记库 / 轻笺项目</small>
        <h1>轻笺项目</h1>
      </div>
      <BButton class="harness-directory-trigger" @click="drawerOpen = true">
        <SvgIcon :src="icon.noteTree.root" size="16" aria-hidden="true" />
        当前目录
      </BButton>
    </section>

    <div class="harness-workspace">
      <aside v-if="!isMobile" class="harness-sidebar" data-testid="desktop-tree-sidebar">
        <NoteLibrarySidebar
          v-model:mode="sidebarMode"
          :current-parent-id="currentParentId"
          :children-by-parent="childrenByParent"
          :expanded-ids="expandedIds"
          :loading-keys="loadingKeys"
          :search-value="searchValue"
          :search-active="Boolean(searchValue)"
          :search-match-count="searchValue ? 1 : 0"
          @toggle="toggleNode"
          @select="selectDirectory"
          @search="searchValue = $event"
        />
      </aside>

      <main class="harness-main" data-testid="directory-content">
        <header class="harness-directory-head">
          <div class="harness-directory-copy">
            <small>笔记库 / 轻笺项目</small>
            <h1>轻笺项目</h1>
            <p>3 个直接子页面 · 页面本身也可以编辑正文</p>
          </div>
          <div class="harness-directory-actions">
            <BButton>打开正文</BButton>
            <BButton type="primary">
              <SvgIcon :src="icon.common.plus" size="15" aria-hidden="true" />
              新建子页面
            </BButton>
            <BButton :aria-label="'更多操作'">
              <SvgIcon :src="icon.common.more" size="16" aria-hidden="true" />
            </BButton>
          </div>
        </header>

        <section v-if="batchMode" class="harness-batch-bar" data-testid="batch-actions">
          <strong>已选择 1 篇</strong>
          <span>内容引用与标签整理是两项不同操作</span>
          <div>
            <BButton size="small">分析所选笔记</BButton>
            <BButton size="small" type="primary">
              <SvgIcon :src="icon.common.magicWand" size="14" aria-hidden="true" />
              智能打标签
            </BButton>
            <BButton size="small" @click="batchMode = false">退出批量操作</BButton>
          </div>
        </section>

        <div class="harness-content-grid">
          <section class="harness-note-results" aria-label="当前目录的直接子页面">
            <div class="harness-view-toolbar">
              <span>在当前目录及子页面中搜索</span>
              <div>
                <BButton size="small" :class="{ 'is-active': viewMode === 'card' }" @click="viewMode = 'card'">
                  卡片
                </BButton>
                <BButton size="small" :class="{ 'is-active': viewMode === 'list' }" @click="viewMode = 'list'">
                  列表
                </BButton>
              </div>
              <small>3 个页面</small>
            </div>

            <div v-if="viewMode === 'card'" class="harness-card-grid" data-testid="note-card-grid">
              <NoteCard
                v-for="note in visibleNotes"
                :key="note.id"
                :note="note"
                :batch-mode="batchMode"
                @open="noop"
                @node-type-change="noop"
                @action="noop"
              />
            </div>
            <div v-else class="harness-list" data-testid="note-list">
              <NoteListItem
                v-for="note in visibleNotes"
                :key="note.id"
                :note="note"
                :batch-mode="batchMode"
                @open="noop"
                @node-type-change="noop"
                @action="noop"
              />
            </div>
          </section>
        </div>
      </main>
    </div>

    <NoteDirectoryDrawer
      v-if="isMobile"
      v-model:open="drawerOpen"
      :current-parent-id="currentParentId"
      :load-directory-level="loadDirectoryLevel"
      @select="selectDirectory"
      @open-page="noop"
      @create="noop"
      @move="noop"
      @delete="noop"
    />
  </div>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, reactive, ref } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import NoteCard from '@/components/noteLibrary/library/NoteCard.vue';
  import NoteListItem from '@/components/noteLibrary/library/NoteListItem.vue';
  import NoteDirectoryDrawer from '@/components/noteLibrary/tree/NoteDirectoryDrawer.vue';
  import NoteLibrarySidebar from '@/components/noteLibrary/tree/NoteLibrarySidebar.vue';
  import { NOTE_TREE_ROOT_KEY } from '@/composables/useNoteTree';
  import icon from '@/config/icon';
  import { ANDROID_WEBVIEW_CLASS, MOBILE_RENDERING_CLASS } from '@/config/renderingProfile';
  import { usesMobileDeviceLayout } from '@/config/responsive';
  import { bookmarkStore } from '@/store';
  import type { NoteBreadcrumbItem, NoteTreeItem } from '@/types/noteTree';

  const params = new URLSearchParams(window.location.search);
  const theme = params.get('theme') === 'night' ? 'night' : 'day';
  const apkMode = params.get('apk') === '1';
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle(ANDROID_WEBVIEW_CLASS, apkMode);

  const bookmark = bookmarkStore();
  function syncViewport() {
    bookmark.screenWidth = window.innerWidth;
    bookmark.screenHeight = window.innerHeight;
    document.documentElement.classList.toggle(
      MOBILE_RENDERING_CLASS,
      apkMode || usesMobileDeviceLayout(window.innerWidth, window.matchMedia('(pointer: coarse)').matches),
    );
  }
  syncViewport();
  window.addEventListener('resize', syncViewport);
  onBeforeUnmount(() => window.removeEventListener('resize', syncViewport));

  const isMobile = computed(() => bookmark.isMobile);
  const sidebarMode = ref<'directory' | 'outline'>('directory');
  const currentParentId = ref<string | null>('project');
  const searchValue = ref('');
  const loadingKeys = new Set<string>();
  const expandedIds = ref(new Set(['project', 'mobile', 'agent', 'frontend']));
  const drawerOpen = ref(isMobile.value && params.get('drawer') !== '0');
  const viewMode = ref<'card' | 'list'>(isMobile.value ? 'list' : 'card');
  const batchMode = ref(!isMobile.value && params.get('batch') !== '0');

  function node(id: string, parentId: string | null, title: string, childCount = 0, matched = false): NoteTreeItem {
    return {
      id,
      parentId,
      title,
      childCount,
      hasChildren: childCount > 0,
      isTop: false,
      sort: 0,
      matched,
      updateTime: '2026-08-06 10:30:00',
    };
  }

  const childrenByParent: Record<string, NoteTreeItem[]> = {
    [NOTE_TREE_ROOT_KEY]: [
      node('project', null, '轻笺项目', 3),
      node('frontend', null, '前端学习', 2),
      node('life', null, '生活记录'),
    ],
    project: [
      node('positioning', 'project', '产品定位'),
      node('mobile', 'project', '移动端设计', 3, true),
      node('agent', 'project', 'AI Agent 重构', 2),
    ],
    mobile: [
      node('today', 'mobile', '今日模块'),
      node('global-search', 'mobile', '全局搜索'),
      node('settings', 'mobile', '设置中心', 1),
    ],
    settings: [node('permissions', 'settings', '权限与隐私')],
    agent: [node('routing', 'agent', '语义路由'), node('retrieval', 'agent', '个人知识检索')],
    frontend: [node('vue', 'frontend', 'Vue 3'), node('typescript', 'frontend', 'TypeScript')],
  };

  const breadcrumbById: Record<string, NoteBreadcrumbItem[]> = {};
  function buildBreadcrumb(id: string): NoteBreadcrumbItem[] {
    if (breadcrumbById[id]) return breadcrumbById[id];
    const allNodes = Object.values(childrenByParent).flat();
    const current = allNodes.find((item) => item.id === id);
    if (!current) return [];
    const parentPath = current.parentId ? buildBreadcrumb(current.parentId) : [];
    const path = [...parentPath, { id: current.id, title: current.title }];
    breadcrumbById[id] = path;
    return path;
  }

  const tags = [
    { id: 'tag-product', name: '产品', count: 4 },
    { id: 'tag-mobile', name: '移动端', count: 3 },
    { id: 'tag-ai', name: 'AI', count: 5 },
  ];

  const notes = reactive([
    {
      id: 'positioning',
      parentId: 'project',
      title: '产品定位',
      content: '轻笺是一套以个人资源、行动与 AI 为中心的知识管理平台。',
      type: 'markdown',
      childCount: 0,
      pathText: '笔记库 / 轻笺项目 / 产品定位',
      tags: [{ id: 'tag-product', name: '产品' }],
      updateTime: '2026-08-06 10:30:00',
      createTime: '2026-08-01 09:00:00',
      isTop: false,
      isPending: false,
      isCheck: true,
    },
    {
      id: 'mobile',
      parentId: 'project',
      title: '移动端设计',
      content: '今日、资料、AI、待办与我的五个一级入口，以及 APK 专属交互规范。',
      type: 'markdown',
      childCount: 3,
      pathText: '笔记库 / 轻笺项目 / 移动端设计',
      tags: [
        { id: 'tag-mobile', name: '移动端' },
        { id: 'tag-product', name: '产品' },
      ],
      updateTime: '2026-08-05 18:12:00',
      createTime: '2026-07-29 08:30:00',
      isTop: true,
      isPending: false,
      isCheck: false,
    },
    {
      id: 'agent',
      parentId: 'project',
      title: 'AI Agent 重构',
      content: '确定性工作流、工具调用、个人知识检索与 Provider 容错。',
      type: 'markdown',
      childCount: 2,
      pathText: '笔记库 / 轻笺项目 / AI Agent 重构',
      tags: [{ id: 'tag-ai', name: 'AI' }],
      updateTime: '2026-08-04 15:45:00',
      createTime: '2026-07-25 11:15:00',
      isTop: false,
      isPending: true,
      isCheck: false,
    },
  ]);

  const visibleNotes = computed(() => notes);

  function toggleNode(item: NoteTreeItem) {
    const next = new Set(expandedIds.value);
    if (next.has(item.id)) next.delete(item.id);
    else next.add(item.id);
    expandedIds.value = next;
  }

  function selectDirectory(id: string | null) {
    currentParentId.value = id;
  }

  async function loadDirectoryLevel(parentId: string | null) {
    return {
      items: childrenByParent[parentId || NOTE_TREE_ROOT_KEY] || [],
      breadcrumb: parentId ? buildBreadcrumb(parentId) : [],
    };
  }

  function noop() {}
</script>

<style lang="less" scoped>
  :global(*) {
    box-sizing: border-box;
  }

  :global(html),
  :global(body),
  :global(#app) {
    width: 100%;
    min-width: 0;
    min-height: 100%;
    margin: 0;
  }

  :global(body) {
    overflow-x: hidden;
    background: var(--surface-page-bg);
    color: var(--text-color);
    font-family: var(--app-font-family);
  }

  .note-page-tree-harness {
    min-width: 0;
    min-height: 100dvh;
    background: var(--surface-page-bg);
    color: var(--text-color);
  }

  .harness-topbar {
    min-width: 0;
    height: 60px;
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 0 clamp(16px, 3vw, 46px);
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--card-background);
  }

  .harness-brand,
  .harness-nav,
  .harness-top-actions,
  .harness-directory-actions,
  .harness-batch-bar > div,
  .harness-view-toolbar > div {
    display: flex;
    align-items: center;
  }

  .harness-brand {
    flex: 0 0 auto;
    gap: 9px;
    font-size: 18px;
  }

  .harness-brand-icon {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 1px solid var(--resource-note-color, #00a884);
    border-radius: 10px;
    color: var(--resource-note-color, #00a884);
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, var(--card-background));
  }

  .harness-nav {
    min-width: 0;
    gap: 24px;
    color: var(--desc-color);
    font-size: 14px;
  }

  .harness-nav strong {
    color: var(--resource-note-color, #00a884);
  }

  .harness-top-actions {
    min-width: 0;
    margin-left: auto;
    gap: 8px;
  }

  .harness-top-actions :deep(.b_btn),
  .harness-directory-actions :deep(.b_btn) {
    gap: 6px;
  }

  .harness-workspace {
    min-width: 0;
    min-height: calc(100dvh - 60px);
    display: grid;
    grid-template-columns: 264px minmax(0, 1fr);
    gap: 14px;
    padding: 14px clamp(14px, 2vw, 32px) 24px;
  }

  .harness-sidebar,
  .harness-main,
  .harness-ai-panel {
    min-width: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }

  .harness-sidebar {
    height: calc(100dvh - 98px);
    min-height: 620px;
    padding: 12px 10px;
    overflow: hidden;
  }

  .harness-main {
    min-height: 620px;
    overflow: hidden;
  }

  .harness-directory-head {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 18px;
    border-bottom: 1px solid var(--surface-border-color);
  }

  .harness-directory-copy {
    min-width: 0;
  }

  .harness-directory-copy small,
  .harness-mobile-summary small,
  .harness-directory-copy p,
  .harness-ai-panel > p,
  .harness-view-toolbar,
  .harness-batch-bar > span {
    color: var(--desc-color);
  }

  .harness-directory-copy h1,
  .harness-mobile-summary h1 {
    margin: 5px 0 3px;
    font-size: 24px;
    line-height: 1.25;
  }

  .harness-directory-copy p,
  .harness-ai-panel > p {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
  }

  .harness-directory-actions {
    flex: 0 0 auto;
    margin-left: auto;
    gap: 8px;
  }

  .harness-batch-bar {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--resource-note-color, #00a884);
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 7%, var(--card-background));
    color: var(--resource-note-color, #00a884);
  }

  .harness-batch-bar > span {
    font-size: 12px;
  }

  .harness-batch-bar > div {
    gap: 7px;
  }

  .harness-content-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 318px);
    gap: 14px;
    padding: 14px;
  }

  .harness-note-results {
    min-width: 0;
  }

  .harness-view-toolbar {
    min-width: 0;
    min-height: 42px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    padding: 5px 8px 5px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
    font-size: 12px;
  }

  .harness-view-toolbar > div {
    gap: 4px;
  }

  .harness-view-toolbar :deep(.b_btn.is-active) {
    border: 1px solid var(--resource-note-color, #00a884) !important;
    color: var(--resource-note-color, #00a884);
    font-weight: 650;
  }

  .harness-card-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .harness-card-grid :deep(.note-card) {
    height: 250px;
    padding: 14px 16px;
  }

  .harness-list {
    min-width: 0;
  }

  .harness-ai-panel {
    align-self: start;
    padding: 14px;
  }

  .harness-ai-panel h2 {
    margin: 0 0 5px;
    font-size: 16px;
  }

  .harness-ai-panel > p {
    margin-bottom: 12px;
  }

  .harness-mobile-summary {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--card-background);
  }

  .harness-mobile-summary > div {
    min-width: 0;
  }

  .harness-mobile-summary h1 {
    margin-bottom: 0;
    font-size: 20px;
  }

  .harness-directory-trigger {
    flex: 0 0 auto;
    margin-left: auto;
    gap: 6px;
    border: 1px solid var(--resource-note-color, #00a884) !important;
    color: var(--resource-note-color, #00a884) !important;
    font-weight: 650;
  }

  @media (min-width: 1680px) {
    .harness-card-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 1199px) and (min-width: 768px) {
    .harness-workspace {
      grid-template-columns: 236px minmax(0, 1fr);
    }

    .harness-content-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .harness-ai-panel {
      display: none;
    }

    .harness-batch-bar {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .harness-batch-bar > div {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 767px) {
    .harness-topbar {
      height: 54px;
      padding: 0 12px;
    }

    .harness-brand-icon {
      width: 30px;
      height: 30px;
    }

    .harness-workspace {
      min-height: 0;
      display: block;
      padding: 10px 10px 24px;
    }

    .harness-main {
      min-height: calc(100dvh - 148px);
      border-radius: 12px;
    }

    .harness-directory-head,
    .harness-batch-bar,
    .harness-ai-panel {
      display: none;
    }

    .harness-content-grid {
      display: block;
      padding: 9px;
    }

    .harness-view-toolbar {
      grid-template-columns: minmax(0, 1fr) auto;
      padding-left: 10px;
    }

    .harness-view-toolbar > small {
      display: none;
    }

    .harness-card-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .harness-list :deep(.note-list-item) {
      min-width: 0;
    }
  }

  @media (max-width: 359px) {
    .harness-top-actions :deep(.b_btn),
    .harness-directory-trigger {
      padding-right: 10px;
      padding-left: 10px;
    }

    .harness-view-toolbar > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
