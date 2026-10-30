<template>
  <div class="note-reference-harness" data-testid="note-reference-harness">
    <header class="harness-topbar">
      <BButton class="harness-back" aria-label="返回">
        <SvgIcon :src="icon.arrow_left" size="16" aria-hidden="true" />
      </BButton>
      <span class="harness-saved">已保存于 14:02</span>
      <span class="harness-spacer"></span>
      <span class="harness-chip">用户研究</span>
    </header>
    <NoteWorkspaceShell
      class="harness-shell"
      has-ai
      ai-resizable
      panel-shortcuts
      :sidebar-open="sidebarOpen"
      :ai-open="aiOpen"
      :sidebar-overlay-open="sidebarOverlayOpen"
      :ai-overlay-open="aiOverlayOpen"
      :sidebar-width="sidebarWidth"
      v-bind="sidePanelLayout"
      @update:sidebar-open="sidebarOpen = $event"
      @update:ai-open="aiOpen = $event"
      @update:sidebar-overlay-open="sidebarOverlayOpen = $event"
      @update:ai-overlay-open="aiOverlayOpen = $event"
      @update:sidebar-width="sidebarWidth = $event"
      @update:ai-width="updatePanelWidth"
      @layout-change="layout = $event"
    >
      <template #sidebar="{ collapse }">
        <aside class="harness-sidebar">
          <NoteLibrarySidebar
            :surface="params.get('surface') === 'library' ? 'library' : 'detail'"
            collapsible
            :active-page-id="currentNoteId"
            :children-by-parent="childrenByParent"
            :expanded-ids="expandedIds"
            :loading-keys="loadingKeys"
            @open="currentNoteId = $event"
            @collapse="collapse"
          />
        </aside>
      </template>
      <article class="harness-editor" data-testid="editor">
        <small>笔记库 / {{ currentTitle }}</small>
        <h1>{{ currentTitle }}</h1>
        <div class="harness-toolbar">↶ ↷ ｜ H 标题　B　I ｜ 列表　引用　插入</div>
        <h2>01 · 三位受访者的共同点</h2>
        <p>A、B、C 都提到「收藏之后很少回看」。对照提纲第 3 题，只有 B 主动描述过回看的场景。</p>
        <blockquote>“我记得收藏过，却想不起当时准备拿来做什么。”—— 访谈对象 A</blockquote>
        <h2>02 · 与假设相反的证据</h2>
        <ul>
          <li>提纲假设「整理成本高」，但 C 说整理并不难，难的是想起它。</li>
          <li>按提纲第 5 题追问「最近一次回看」，三人都答不上具体日期。</li>
        </ul>
      </article>
      <template #ai="{ collapse }">
        <NoteDetailSidePanel v-model:tab="tab" class="harness-side" @collapse="collapse">
          <template #ai>
            <div class="harness-ai" data-testid="ai-panel">
              <strong>笔记助手</strong>
              <p>润色、改写与插入建议（验收夹具占位）。</p>
            </div>
          </template>
          <template #reference>
            <NoteReferencePanel
              :target="target"
              :current-note-id="currentNoteId"
              owner-key="harness"
              @change="setTarget"
              @swap="swap"
            />
          </template>
        </NoteDetailSidePanel>
      </template>
    </NoteWorkspaceShell>
    <output class="harness-state" data-testid="harness-state">{{ stateText }}</output>
  </div>
</template>

<script setup lang="ts">
  import { computed, provide, ref } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import NoteDetailSidePanel from '@/components/noteLibrary/reference/NoteDetailSidePanel.vue';
  import NoteReferencePanel from '@/components/noteLibrary/reference/NoteReferencePanel.vue';
  import NoteLibrarySidebar from '@/components/noteLibrary/tree/NoteLibrarySidebar.vue';
  import { NOTE_TREE_REFERENCE_CONTEXT } from '@/components/noteLibrary/tree/noteTreeReference';
  import NoteWorkspaceShell from '@/components/noteLibrary/workspace/NoteWorkspaceShell.vue';
  import { NOTE_TREE_ROOT_KEY } from '@/composables/useNoteTree';
  import icon from '@/config/icon';
  import type { NoteTreeItem } from '@/types/noteTree';
  import { parseNoteReferenceQuery, type NoteReferenceTarget } from '@/utils/noteReference';
  import {
    NOTE_REFERENCE_MAIN_MIN_WIDTH,
    NOTE_REFERENCE_PANEL_DEFAULT_RATIO,
    type NoteWorkspaceLayoutState,
  } from '@/utils/noteWorkspaceLayout';

  const params = new URLSearchParams(location.search);
  const titles: Record<string, string> = {
    n1: '访谈发现与相反证据',
    n2: '访谈提纲与记录方法',
    n3: '会议纪要示例',
    n4: '小团队知识协作比较表',
    n5: '周报改写前后对照，标题特别长用来检查省略号是否正常显示',
  };
  const node = (id: string): NoteTreeItem =>
    ({ id, parentId: null, title: titles[id], type: 'html', childCount: 0, hasChildren: false, isTop: false, sort: 0 }) as NoteTreeItem;
  const childrenByParent = { [NOTE_TREE_ROOT_KEY]: Object.keys(titles).map(node) };
  const expandedIds = new Set<string>();
  const loadingKeys = new Set<string>();

  const currentNoteId = ref('n1');
  const target = ref<NoteReferenceTarget | null>(parseNoteReferenceQuery(params.get('ref')));
  const tab = ref<'ai' | 'reference'>(params.get('tab') === 'ai' ? 'ai' : target.value || params.get('tab') === 'reference' ? 'reference' : 'ai');
  const sidebarOpen = ref(params.get('sidebar') !== 'closed');
  const aiOpen = ref(params.get('panel') !== 'closed');
  const sidebarOverlayOpen = ref(false);
  const aiOverlayOpen = ref(false);
  const sidebarWidth = ref(270);
  const sidePanelWidth = ref<number | null>(null);
  const layout = ref<NoteWorkspaceLayoutState | null>(null);
  const currentTitle = computed(() => titles[currentNoteId.value]);

  const sidePanelLayout = computed(() => {
    const docked = Boolean(target.value);
    return {
      preferDockedAi: docked,
      mainMinWidth: docked ? NOTE_REFERENCE_MAIN_MIN_WIDTH : 680,
      aiWidth: sidePanelWidth.value,
      aiDefaultRatio: docked ? NOTE_REFERENCE_PANEL_DEFAULT_RATIO : 0,
    };
  });

  function updatePanelWidth(width: number | null) {
    sidePanelWidth.value = width;
  }

  function setTarget(next: NoteReferenceTarget | null) {
    target.value = next && !(next.type === 'note' && next.id === currentNoteId.value) ? { type: next.type, id: next.id } : null;
    if (!target.value) return;
    tab.value = 'reference';
    aiOpen.value = true;
    if (layout.value?.aiPresentation === 'overlay') aiOverlayOpen.value = true;
  }

  function swap(noteId: string) {
    const previous = currentNoteId.value;
    currentNoteId.value = noteId;
    target.value = { type: 'note', id: previous };
  }

  provide(NOTE_TREE_REFERENCE_CONTEXT, {
    referencedNoteId: computed(() => (target.value?.type === 'note' ? target.value.id : null)),
    currentNoteId: computed(() => currentNoteId.value),
    reference: (noteId: string) => setTarget({ type: 'note', id: noteId }),
    cancelReference: () => setTarget(null),
    openInNewWindow: (noteId: string) => console.info('[harness] open in new window', noteId),
  });

  const stateText = computed(() =>
    JSON.stringify({
      current: currentNoteId.value,
      target: target.value,
      tab: tab.value,
      sidebarOpen: sidebarOpen.value,
      aiOpen: aiOpen.value,
      sidebarWidth: sidebarWidth.value,
      sidePanelWidth: sidePanelWidth.value,
      layout: layout.value,
    }),
  );
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';

  .note-reference-harness {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    color: var(--text-color);
    background: var(--background-color);
  }

  .harness-topbar {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    height: var(--ui-layout-54, 54px);
    padding: 0 var(--ui-space-16, 16px);
    border-bottom: 1px solid var(--surface-border-color);
  }

  .harness-saved {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }

  .harness-spacer {
    flex: 1;
  }

  .harness-chip {
    padding: 0 var(--ui-space-8, 8px);
    border-radius: 999px;
    color: var(--workspace-tag-text);
    background: var(--workspace-tag-selected);
    font-size: var(--ui-font-12, 12px);
  }

  .harness-shell {
    flex: 1;
    min-height: 0;
  }

  .harness-sidebar {
    height: 100%;
    padding: var(--ui-space-10, 10px);
    box-sizing: border-box;
  }

  .harness-editor {
    height: 100%;
    padding: var(--ui-space-16, 16px) var(--ui-space-24, 24px);
    overflow: auto;
    box-sizing: border-box;
    .workspace-content-surface();

    small {
      color: var(--desc-color);
    }

    h1 {
      margin: var(--ui-space-4, 4px) 0 var(--ui-space-10, 10px);
      font-size: var(--ui-font-22, 22px);
    }

    blockquote {
      margin: 0 0 var(--ui-space-10, 10px);
      padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
      border-left: 3px solid var(--primary-color);
      color: var(--desc-color);
    }
  }

  .harness-toolbar {
    margin-bottom: var(--ui-space-12, 12px);
    padding: var(--ui-space-6, 6px) 0;
    border-block: 1px solid var(--surface-border-color);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }

  .harness-ai {
    padding: var(--ui-space-16, 16px);
  }

  .harness-state {
    position: fixed;
    right: 0;
    bottom: 0;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
</style>
