<template>
  <div ref="boardRoot" class="project-board" @pointermove="trackPointer" @pointerleave="clearHover">
    <div class="project-board__toolbar">
      <div v-if="mobile" class="project-board__lane-select">
        <span v-for="lane in BOARD_LANES" :key="lane" class="project-board__lane-measure" aria-hidden="true">{{
          laneText(lane)
        }}</span>
        <BSelect
          v-model:value="mobileLane"
          :options="BOARD_LANES.map((lane) => ({ value: lane, label: laneText(lane) }))"
        />
      </div>
      <span class="project-board__hint">{{ t(mobile ? 'toolbox.board.mobileHint' : 'toolbox.board.dragHint') }}</span>
      <BButton v-if="undoId" size="small" :disabled="busy" @click="send({ type: 'undo', undoId })">{{
        t('toolbox.board.undo')
      }}</BButton>
    </div>
    <p v-if="error && !editor" role="alert">{{ error }}</p>
    <div class="project-board__lanes">
      <section v-for="lane in visibleLanes" :key="lane" class="project-board__lane" :data-lane="lane">
        <header
          ><div
            ><h4>{{ laneText(lane) }}</h4
            ><p :class="{ 'is-drop-description': dragged && lane !== dragged.lane && !mobile }">{{
              dragged && lane !== dragged.lane && !mobile
                ? t(`toolbox.board.${boardConversion(dragged.lane, lane)}Hint`)
                : laneText(lane, 'description')
            }}</p></div
          ><BChip tone="neutral">{{ lists[lane].length }}</BChip></header
        >
        <VueDraggable
          :key="`${dragKey}-${lane}`"
          v-model="lists[lane]"
          :data-lane="lane"
          class="project-board__drop"
          :group="dragGroup"
          handle=".board-drag"
          direction="vertical"
          :fallback-on-body="true"
          :disabled="busy || workspace.status === 'archived'"
          :animation="reducedMotion ? 0 : 150"
          :delay="mobile ? 200 : 0"
          :delay-on-touch-only="true"
          :scroll="true"
          :bubble-scroll="true"
          :scroll-sensitivity="70"
          :force-fallback="mobile"
          ghost-class="project-board__ghost"
          @start="startDrag"
          @end="endDrag"
        >
          <WorkspaceBoardCard
            v-for="(item, index) in lists[lane]"
            :key="item.id"
            :item="item"
            :hovered="hoveredId === item.id"
            :type-label="laneText(item.lane)"
            :disabled="busy || workspace.status === 'archived'"
            :state="stateText(item)"
            :primary="primary(item)"
            :menu="menu(item, index)"
            @edit="edit(item)"
            @action="(key) => action(item, key)"
            @source="showSource(item)"
          />
        </VueDraggable>
        <p v-if="!lists[lane].length" class="project-board__empty">{{ laneText(lane, 'empty') }}</p>
        <BButton
          class="project-board__add"
          :disabled="busy || workspace.status === 'archived'"
          block
          @click="create(lane)"
          ><SvgIcon :src="icon.common.plus" size="14" />{{ bt(`add_${lane}`) }}</BButton
        >
      </section>
    </div>
    <WorkspaceItemEditor
      v-if="editor"
      :key="editor.key"
      :title="editor.title"
      :hint="editor.hint"
      :state="editor.item ? stateText(editor.item) || t('toolbox.board.notStarted') : ''"
      :source-title="
        ['convert', 'repeat'].includes(editor.command.type) ? editor.item?.title : editor.item?.sourceTitle
      "
      :initial="editor.initial"
      :readonly="workspace.status === 'archived'"
      :busy="busy"
      :error="error"
      @close="editor = null"
      @save="save"
      @source="
        editor.item &&
        (['convert', 'repeat'].includes(editor.command.type) ? (sourceView = editor.item) : showSource(editor.item))
      "
    />
    <WorkspaceItemEditor
      v-if="sourceView"
      :key="`source-${sourceView.id}`"
      :title="t('toolbox.board.source')"
      :hint="
        sourceView.id.startsWith('snapshot-')
          ? t('toolbox.board.snapshotHint')
          : sourceView.status === 'archived'
            ? t('toolbox.board.archivedSource')
            : undefined
      "
      :source-title="sourceView.sourceTitle"
      :state="stateText(sourceView) || t('toolbox.board.notStarted')"
      :initial="{ title: sourceView.title, content: sourceView.content, dueOn: sourceView.dueOn }"
      :readonly="sourceView.status === 'archived'"
      :busy="busy"
      :error="error"
      @save="saveSource"
      @close="sourceView = null"
      @source="showSource(sourceView)"
    />
  </div>
</template>
<script setup lang="ts">
  import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { VueDraggable } from 'vue-draggable-plus';
  import { BOARD_LANES, boardConversion, type BoardLane, type BoardCommand } from '@lightnote/shared/workspace-board';
  import {
    operateToolboxBoard,
    readToolboxBoardItem,
    fetchToolboxWorkspace,
    type ToolboxWorkspace,
    type ToolboxWorkspaceItem,
  } from '@/api/toolbox';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import WorkspaceBoardCard from './WorkspaceBoardCard.vue';
  import WorkspaceItemEditor from './WorkspaceItemEditor.vue';
  const props = defineProps<{ workspace: ToolboxWorkspace; mobile: boolean }>();
  const emit = defineEmits<{ updated: [workspace: ToolboxWorkspace] }>();
  const { t } = useI18n();
  const mobileLane = defineModel<BoardLane>('lane', { default: 'inbox' });
  const dragGroup = computed(() => ({ name: 'workspace-items', pull: !props.mobile, put: !props.mobile }));
  const visibleLanes = computed(() => (props.mobile ? [mobileLane.value] : BOARD_LANES));
  const lists = ref<Record<BoardLane, ToolboxWorkspaceItem[]>>({ inbox: [], knowledge: [], action: [] });
  const busy = ref(false),
    error = ref(''),
    undoId = ref<string | null>(null),
    dragKey = ref(0),
    dragged = ref<ToolboxWorkspaceItem | null>(null);
  const boardRoot = ref<HTMLElement | null>(null);
  const hoveredId = ref<string | null>(null);
  let pointer: { x: number; y: number } | null = null;
  let hoverFrame = 0;
  function refreshHover() {
    const target =
      pointer && !dragged.value && window.matchMedia('(hover: hover)').matches
        ? document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>('.board-card')
        : null;
    hoveredId.value = target && boardRoot.value?.contains(target) ? target.dataset.itemId || null : null;
  }
  function trackPointer(event: PointerEvent) {
    pointer = event.pointerType === 'touch' ? null : { x: event.clientX, y: event.clientY };
    refreshHover();
  }
  function clearHover() {
    pointer = null;
    hoveredId.value = null;
  }
  function settleHover(event: any) {
    const original = event.originalEvent;
    if (original?.type?.startsWith('touch')) pointer = null;
    else if (Number.isFinite(original?.clientX) && Number.isFinite(original?.clientY))
      pointer = { x: original.clientX, y: original.clientY };
    cancelAnimationFrame(hoverFrame);
    const until = performance.now() + 200;
    const sample = () => {
      refreshHover();
      if (performance.now() < until) hoverFrame = requestAnimationFrame(sample);
    };
    // Native drag hover can remain attached to a moved DOM node. Hit-test the final layout instead.
    void nextTick(() => {
      if (alive) hoverFrame = requestAnimationFrame(sample);
    });
  }
  onMounted(() => window.addEventListener('scroll', refreshHover, true));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let alive = true;
  onBeforeUnmount(() => {
    alive = false;
    cancelAnimationFrame(hoverFrame);
    window.removeEventListener('scroll', refreshHover, true);
  });
  type Editor = {
    key: string;
    title: string;
    hint?: string;
    command: BoardCommand;
    item?: ToolboxWorkspaceItem;
    initial: { title: string; content: string; dueOn: string | null };
  };
  const editor = ref<Editor | null>(null),
    sourceView = ref<ToolboxWorkspaceItem | null>(null);
  let pending: { fingerprint: string; requestId: string; expectedVersion: number; command: BoardCommand } | null = null;
  function sync() {
    for (const lane of BOARD_LANES)
      lists.value[lane] = props.workspace.items
        .filter((x) => x.lane === lane && x.status !== 'archived')
        .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map((x) => ({ ...x }));
  }
  watch(
    () => props.workspace,
    () => {
      sync();
      void nextTick(() => {
        if (alive) refreshHover();
      });
    },
    { immediate: true },
  );
  function bt(key: string) {
    return t(`toolbox.board.${props.workspace.kind}.${key}`);
  }
  function laneText(lane: BoardLane, key = 'title') {
    return t(`toolbox.workspace.template.${props.workspace.kind}.lanes.${lane}.${key}`);
  }
  function stateText(item: ToolboxWorkspaceItem) {
    if (item.lane === 'knowledge') return bt('settled');
    if (item.status === 'done') return item.lane === 'inbox' ? t('toolbox.board.legacy') : bt('finished');
    if (item.status === 'in_progress') return bt(item.lane === 'inbox' ? 'progress' : 'executing');
    return '';
  }
  function primary(item: ToolboxWorkspaceItem) {
    let key =
      item.lane === 'knowledge'
        ? 'convert:action'
        : item.lane === 'inbox'
          ? item.status === 'open'
            ? 'start'
            : 'convert:knowledge'
          : item.status === 'done'
            ? props.workspace.kind === 'learning'
              ? 'repeat'
              : 'reopen'
            : item.status === 'open'
              ? 'start'
              : 'finish';
    return { key, label: label(item, key) };
  }
  function label(item: ToolboxWorkspaceItem, key: string) {
    if (key.startsWith('convert:')) {
      const lane = key.split(':')[1];
      return lane === 'inbox'
        ? bt('restart')
        : lane === 'action'
          ? bt('derive')
          : bt(item.lane === 'action' ? 'result' : 'settle');
    }
    if (key === 'start') return bt(item.lane === 'inbox' ? 'start' : 'execute');
    if (key === 'finish') return bt('finish');
    if (key === 'repeat') return bt('repeat');
    if (key === 'reopen') return item.lane === 'inbox' ? bt('restart') : t('toolbox.workspace.reopenItem');
    return t(`toolbox.board.${key}`);
  }
  function menu(item: ToolboxWorkspaceItem, index: number) {
    const keys = ['edit', ...BOARD_LANES.filter((x) => x !== item.lane).map((x) => `convert:${x}`)];
    if (item.lane === 'action' && item.status !== 'done') keys.push('finish');
    if ((item.lane === 'inbox' && item.status !== 'open') || (item.lane === 'action' && item.status === 'done'))
      keys.push('reopen');
    keys.push('up', 'down', 'archive');
    return keys
      .filter((key) => key !== primary(item).key)
      .map((key) => ({
        key,
        label: label(item, key),
        danger: key === 'archive',
        disabled:
          busy.value ||
          (key === 'up' && index === 0) ||
          (key === 'down' && index === lists.value[item.lane].length - 1),
      }));
  }
  function create(lane: BoardLane) {
    error.value = '';
    editor.value = {
      key: crypto.randomUUID(),
      title: bt(`add_${lane}`),
      command: { type: 'create', lane },
      initial: { title: '', content: '', dueOn: null },
    };
  }
  function edit(item: ToolboxWorkspaceItem) {
    error.value = '';
    editor.value = {
      key: crypto.randomUUID(),
      title: t('common.edit'),
      command: { type: 'edit', itemId: item.id },
      item,
      initial: { title: item.title, content: item.content, dueOn: item.dueOn },
    };
  }
  function conversion(item: ToolboxWorkspaceItem, lane: BoardLane, targetIndex?: number) {
    const mode = boardConversion(item.lane, lane);
    if (!mode) return;
    const command: BoardCommand = {
      type: 'convert',
      itemId: item.id,
      lane,
      ...(targetIndex === undefined ? {} : { targetIndex }),
    };
    const title = label(item, `convert:${lane}`);
    if (mode === 'move' && lane === 'inbox' && item.lane === 'knowledge') {
      Alert.alert({
        title,
        content: t('toolbox.board.restartConfirm', { lane: laneText(lane) }),
        okText: title,
        cancelText: t('common.cancel'),
        onOk: () => alive && send(command),
      });
      return;
    }
    if (props.workspace.kind === 'learning' && item.lane === 'inbox' && lane === 'knowledge') {
      Alert.alert({ title, content: t('toolbox.board.masterConfirm'), onOk: () => alive && send(command) });
      return;
    }
    error.value = '';
    editor.value = {
      key: crypto.randomUUID(),
      title,
      hint:
        lane === 'inbox'
          ? `${t('toolbox.board.restartConfirm', { lane: laneText(lane) })} ${t('toolbox.board.reclassifyHint')}`
          : t(`toolbox.board.${mode}Hint`),
      command,
      item,
      initial: { title: item.title, content: item.content, dueOn: mode === 'move' ? item.dueOn : null },
    };
  }
  function action(item: ToolboxWorkspaceItem, key: string) {
    if (busy.value) return;
    if (key === 'edit') {
      edit(item);
      return;
    }
    if (key.startsWith('convert:')) {
      conversion(item, key.split(':')[1] as BoardLane);
      return;
    }
    if (key === 'archive') {
      Alert.alert({
        title: t('toolbox.workspace.archiveItem', { title: item.title }),
        content: t('toolbox.workspace.archiveItemConfirm'),
        onOk: () => alive && send({ type: 'status', itemId: item.id, status: 'archived' }),
      });
      return;
    }
    if (key === 'repeat') {
      editor.value = {
        key: crypto.randomUUID(),
        title: bt('repeat'),
        hint: t('toolbox.board.deriveHint'),
        item,
        command: { type: 'repeat', itemId: item.id },
        initial: { title: item.title, content: item.content, dueOn: null },
      };
      return;
    }
    if (key === 'up' || key === 'down') {
      const ids = lists.value[item.lane].map((x) => x.id),
        i = ids.indexOf(item.id),
        j = i + (key === 'up' ? -1 : 1);
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      void send({ type: 'reorder', lane: item.lane, ids });
      return;
    }
    void send({
      type: 'status',
      itemId: item.id,
      status: key === 'start' ? 'in_progress' : key === 'finish' ? 'done' : 'open',
    });
  }
  async function save(data: { title: string; content: string; dueOn: string | null }) {
    if (editor.value) await send({ ...editor.value.command, ...data }, true);
  }
  async function send(command: BoardCommand, closeEditor = false) {
    if (busy.value || !alive) return;
    const owner = props.workspace.id;
    const fingerprint = JSON.stringify(command);
    if (!pending || pending.fingerprint !== fingerprint)
      pending = {
        fingerprint,
        requestId: crypto.randomUUID(),
        expectedVersion: props.workspace.boardVersion || 0,
        command,
      };
    busy.value = true;
    error.value = '';
    try {
      const result = await operateToolboxBoard(owner, pending);
      if (!alive) return;
      pending = null;
      undoId.value = result.undoId;
      emit('updated', result.workspace);
      // Wait for the parent to publish the authoritative board before final synchronization.
      await nextTick();
      if (closeEditor) editor.value = null;
      const focus = result.workspace.items.find((x) => x.id === result.focusItemId);
      if (focus) {
        mobileLane.value = focus.lane;
        await nextTick();
        document.querySelector(`[data-item-id="${focus.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    } catch (e: any) {
      if (!alive) return;
      error.value = t('toolbox.board.failed');
      if (e?.code === 'BOARD_VERSION_CONFLICT') {
        pending = null;
        undoId.value = null;
        error.value = t('toolbox.board.conflict');
        try {
          const fresh = await fetchToolboxWorkspace(owner);
          if (alive) {
            emit('updated', fresh);
            await nextTick();
          }
        } catch {}
      }
    } finally {
      if (alive) {
        busy.value = false;
        sync();
        await nextTick();
        if (alive) refreshHover();
      }
    }
  }
  function startDrag(event: any) {
    hoveredId.value = null;
    dragged.value = props.workspace.items.find((x) => x.id === event.item.dataset.itemId) || null;
  }
  function endDrag(event: any) {
    const item = dragged.value,
      lane = event.to.dataset.lane as BoardLane;
    const ids = lists.value[lane]?.map((x) => x.id);
    dragged.value = null;
    settleHover(event);
    if (item && item.lane === lane) {
      // VueDraggable has already updated this lane. Keep that order while saving.
      if (event.oldIndex !== event.newIndex) void send({ type: 'reorder', lane, ids });
      return;
    }
    // Cross-lane drops only propose a conversion; cancellation must retain the original board.
    sync();
    dragKey.value++;
    if (item && lane && !props.mobile) conversion(item, lane, event.newIndex);
  }
  async function saveSource(data: { title: string; content: string; dueOn: string | null }) {
    if (!sourceView.value) return;
    await send({ type: 'edit', itemId: sourceView.value.id, ...data });
    if (!error.value) sourceView.value = null;
  }
  async function showSource(item: ToolboxWorkspaceItem) {
    const local = props.workspace.items.find((x) => x.id === item.sourceItemId);
    if (local) {
      mobileLane.value = local.lane;
      await nextTick();
      document.querySelector(`[data-item-id="${local.id}"]`)?.scrollIntoView({ block: 'nearest' });
      sourceView.value = local;
      return;
    }
    try {
      if (!item.sourceItemId) throw Error();
      const source = await readToolboxBoardItem(props.workspace.id, item.sourceItemId);
      if (alive) sourceView.value = source;
    } catch {
      if (alive)
        sourceView.value = {
          ...item,
          id: `snapshot-${item.id}`,
          title: item.sourceTitle || t('toolbox.board.source'),
          content: item.sourceContent || '',
          dueOn: null,
          status: 'archived',
          sourceItemId: null,
          sourceTitle: '',
        };
    }
  }
</script>
<style scoped lang="less">
  .project-board__lane-select {
    display: grid;
    width: max-content;
    max-width: 100%;
    min-width: 0;
  }
  .project-board__lane-select > * {
    grid-area: 1 / 1;
    min-width: 0;
  }
  .project-board__lane-select > .b-select {
    width: 100%;
  }
  .project-board__lane-measure {
    visibility: hidden;
    pointer-events: none;
    white-space: nowrap;
    font-size: 14px;
    font-weight: 500;
    padding: 0 32px 0 13px;
  }
  .project-board__toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    margin: 16px 0;
  }
  .project-board__hint {
    font-size: 12px;
    color: var(--desc-color);
    flex: 1;
  }
  .project-board__lanes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    align-items: start;
  }
  .project-board__lane {
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--workspace-panel-bg-color);
  }
  .project-board__lane header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 10px;
    margin: 0 0 12px;
  }
  .project-board__lane h4 {
    margin: 0;
    font-size: 15px;
  }
  .project-board__lane header p {
    height: 32px;
    line-height: 16px;
    overflow: hidden;
    margin: 5px 0 0;
    color: var(--desc-color);
    font-size: 11px;
  }
  .is-drop-description {
    color: var(--workspace-purple-text, var(--primary-color)) !important;
  }
  .project-board__drop {
    display: grid;
    gap: 10px;
    min-height: 32px;
  }
  .project-board__empty {
    font-size: 12px;
    line-height: 1.6;
    text-align: center;
    color: var(--desc-color);
    padding: 16px 6px;
    margin: 0;
  }
  .project-board__add.b_btn {
    margin-top: 12px;
    background: transparent;
    border: 1px dashed var(--surface-border-color);
    white-space: normal;
    height: auto;
    min-height: 34px;
    font-size: 12px;
    gap: 6px;
    line-height: 1.4;
    padding: 6px;
  }
  .project-board__drop:empty {
    min-height: 64px;
  }
  .project-board__ghost {
    opacity: 0.35;
    outline: 2px solid var(--primary-color);
  }
  @media (max-width: 767px) {
    .project-board__lanes {
      grid-template-columns: minmax(0, 1fr);
    }
    .project-board__hint {
      flex-basis: 100%;
    }
    .project-board__add.b_btn {
      min-height: 44px;
    }
  }
</style>
