<template>
  <div class="todo-page">
    <div class="todo-wrap">
      <header class="todo-hero">
        <h1>{{ $t('todos.title') }}</h1>
        <p>{{ $t('todos.subtitle') }}</p>
      </header>

      <!-- 添加 -->
      <div class="todo-add">
        <input
          class="todo-add-input"
          v-model="newContent"
          :placeholder="$t('todos.addPlaceholder')"
          maxlength="500"
          @keyup.enter="add"
        />
        <button class="todo-star" :class="{ on: newPriority }" :title="$t('todos.priority')" @click="newPriority = !newPriority">★</button>
        <input class="todo-date" type="date" v-model="newDue" :title="$t('todos.due')" />
        <button class="todo-add-btn" :disabled="adding || !newContent.trim()" @click="add">{{ $t('todos.add') }}</button>
      </div>

      <!-- 筛选 + 统计 -->
      <div class="todo-bar">
        <div class="todo-tabs">
          <button v-for="f in filters" :key="f.v" class="todo-tab" :class="{ active: filter === f.v }" @click="filter = f.v">
            {{ f.label }}<span class="todo-tab-n">{{ f.count }}</span>
          </button>
        </div>
        <button v-if="doneCount > 0" class="todo-clear" @click="clearDone">{{ $t('todos.clearDone') }}</button>
      </div>

      <!-- 列表 -->
      <b-loading :loading="loading">
        <div v-if="filtered.length" class="todo-list">
          <div v-for="t in filtered" :key="t.id" class="todo-item" :class="{ done: t.done }">
            <label class="todo-check">
              <input type="checkbox" :checked="!!t.done" @change="toggle(t)" />
              <span class="todo-check-box"></span>
            </label>

            <div class="todo-main">
              <input
                v-if="editingId === t.id"
                class="todo-edit-input"
                v-model="editingContent"
                maxlength="500"
                @keyup.enter="saveEdit(t)"
                @blur="saveEdit(t)"
                ref="editInputRef"
              />
              <span v-else class="todo-content" @click="startEdit(t)">{{ t.content }}</span>
              <span v-if="t.due_date" class="todo-due" :class="{ overdue: isOverdue(t) }">🗓 {{ fmtDue(t.due_date) }}</span>
            </div>

            <button class="todo-star sm" :class="{ on: t.priority }" :title="$t('todos.priority')" @click="togglePriority(t)">★</button>
            <button class="todo-del" :title="$t('common.delete')" @click="remove(t)">×</button>
          </div>
        </div>
        <div v-else-if="!loading" class="todo-empty">
          <div class="todo-empty-icon">✅</div>
          <p>{{ filter === 'done' ? $t('todos.emptyDone') : $t('todos.empty') }}</p>
          <span>{{ $t('todos.emptyHint') }}</span>
        </div>
      </b-loading>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { blockGuestWrite } from '@/composables/useGuestGuard';

  const { t } = useI18n();

  type Todo = { id: string; content: string; done: number; priority: number; due_date: string | null; create_time: string };

  const todos = ref<Todo[]>([]);
  const loading = ref(false);
  const adding = ref(false);
  const filter = ref<'active' | 'done' | 'all'>('active');
  const newContent = ref('');
  const newPriority = ref(false);
  const newDue = ref('');
  const editingId = ref('');
  const editingContent = ref('');
  const editInputRef = ref<HTMLInputElement[] | HTMLInputElement>();

  const activeCount = computed(() => todos.value.filter((t) => !t.done).length);
  const doneCount = computed(() => todos.value.filter((t) => t.done).length);
  const filters = computed(() => [
    { v: 'active' as const, label: t('todos.active'), count: activeCount.value },
    { v: 'done' as const, label: t('todos.done'), count: doneCount.value },
    { v: 'all' as const, label: t('todos.all'), count: todos.value.length },
  ]);
  const filtered = computed(() => {
    if (filter.value === 'active') return todos.value.filter((t) => !t.done);
    if (filter.value === 'done') return todos.value.filter((t) => t.done);
    return todos.value;
  });

  function toLocalDate(v: string | null) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDue(v: string | null) {
    const d = toLocalDate(v);
    if (!d) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${p(d.getDate())}`;
  }
  function isOverdue(t: Todo) {
    if (t.done || !t.due_date) return false;
    const d = toLocalDate(t.due_date);
    if (!d) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  }

  async function load() {
    loading.value = true;
    try {
      const res = await apiBasePost('/api/todo/list', {});
      if (res?.status === 200 && Array.isArray(res.data)) todos.value = res.data;
    } finally {
      loading.value = false;
    }
  }

  async function add() {
    if (blockGuestWrite('add-todo', '登录后即可使用待办,免费记录你的每一件事。')) return;
    const content = newContent.value.trim();
    if (!content || adding.value) return;
    adding.value = true;
    try {
      const res = await apiBasePost('/api/todo/add', {
        content,
        priority: newPriority.value ? 1 : 0,
        dueDate: newDue.value || null,
      });
      if (res?.status === 200 && res.data) {
        todos.value.unshift(res.data);
        resort();
        newContent.value = '';
        newPriority.value = false;
        newDue.value = '';
      } else {
        message.info(res?.msg || t('todos.addFail'));
      }
    } finally {
      adding.value = false;
    }
  }

  async function toggle(t: Todo) {
    const done = t.done ? 0 : 1;
    t.done = done; // 乐观更新
    resort();
    const res = await apiBasePost('/api/todo/toggle', { id: t.id, done });
    if (res?.status !== 200) {
      t.done = done ? 0 : 1;
      resort();
    }
  }

  async function togglePriority(t: Todo) {
    const priority = t.priority ? 0 : 1;
    t.priority = priority;
    resort();
    await apiBasePost('/api/todo/update', { id: t.id, priority });
  }

  function startEdit(t: Todo) {
    editingId.value = t.id;
    editingContent.value = t.content;
    nextTick(() => {
      const el = Array.isArray(editInputRef.value) ? editInputRef.value[0] : editInputRef.value;
      el?.focus();
    });
  }
  async function saveEdit(t: Todo) {
    if (editingId.value !== t.id) return;
    const c = editingContent.value.trim();
    editingId.value = '';
    if (!c || c === t.content) return;
    t.content = c;
    await apiBasePost('/api/todo/update', { id: t.id, content: c });
  }

  function remove(item: Todo) {
    Alert.alert({
      title: t('todos.deleteTitle'),
      content: t('todos.deleteConfirm', { c: item.content }),
      onOk: async () => {
        const res = await apiBasePost('/api/todo/delete', { id: item.id });
        if (res?.status === 200) todos.value = todos.value.filter((x) => x.id !== item.id);
      },
    });
  }

  function clearDone() {
    Alert.alert({
      title: t('todos.clearDone'),
      content: t('todos.clearDoneConfirm', { n: doneCount.value }),
      onOk: async () => {
        const res = await apiBasePost('/api/todo/clearDone', {});
        if (res?.status === 200) todos.value = todos.value.filter((x) => !x.done);
      },
    });
  }

  // 本地重排:未完成在前、重要在前、有截止的按截止升序、再按创建倒序(与后端一致,免刷新)
  function resort() {
    todos.value = [...todos.value].sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      if (!!a.priority !== !!b.priority) return b.priority - a.priority;
      const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      return new Date(b.create_time).getTime() - new Date(a.create_time).getTime();
    });
  }

  load();
</script>

<style lang="less" scoped>
  .todo-page {
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 24px 16px 60px;
    color: var(--text-color);
  }
  .todo-wrap {
    max-width: 720px;
    margin: 0 auto;
  }
  .todo-hero {
    margin-bottom: 18px;
    h1 {
      margin: 0;
      font-size: 24px;
    }
    p {
      margin: 6px 0 0;
      font-size: 13px;
      color: var(--desc-color);
    }
  }
  .todo-add {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--menu-body-bg-color);
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    padding: 8px 10px;
  }
  .todo-add-input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text-color);
    font-size: 14px;
    outline: none;
  }
  .todo-date {
    border: 1px solid var(--card-border-color);
    background: transparent;
    color: var(--desc-color);
    border-radius: 8px;
    padding: 4px 6px;
    font-size: 12px;
    color-scheme: light dark;
  }
  .todo-add-btn {
    border: 0;
    border-radius: 8px;
    background: var(--primary-color);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    padding: 7px 16px;
    cursor: pointer;
    white-space: nowrap;
  }
  .todo-add-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .todo-star {
    border: 0;
    background: transparent;
    color: var(--card-border-color);
    font-size: 18px;
    cursor: pointer;
    line-height: 1;
    padding: 0 2px;
  }
  .todo-star.on {
    color: #f5a623;
  }
  .todo-star.sm {
    font-size: 15px;
    flex-shrink: 0;
  }
  .todo-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 16px 0 10px;
  }
  .todo-tabs {
    display: inline-flex;
    background: var(--bl-input-noBorder-bg-color, rgba(0, 0, 0, 0.05));
    border-radius: 8px;
    padding: 3px;
  }
  .todo-tab {
    border: 0;
    background: transparent;
    color: var(--desc-color);
    padding: 5px 14px;
    font-size: 13px;
    border-radius: 6px;
    cursor: pointer;
  }
  .todo-tab.active {
    background: var(--menu-body-bg-color);
    color: var(--text-color);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    font-weight: 600;
  }
  .todo-tab-n {
    margin-left: 5px;
    font-size: 11px;
    opacity: 0.6;
  }
  .todo-clear {
    border: 0;
    background: transparent;
    color: var(--desc-color);
    font-size: 12px;
    cursor: pointer;
  }
  .todo-clear:hover {
    color: #ef4444;
  }
  .todo-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .todo-item {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--menu-body-bg-color);
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    padding: 10px 12px;
    transition: border-color 0.15s;
  }
  .todo-item:hover {
    border-color: color-mix(in srgb, var(--primary-color) 30%, var(--card-border-color));
  }
  .todo-item:hover .todo-del {
    opacity: 0.6;
  }
  .todo-check {
    position: relative;
    display: inline-flex;
    cursor: pointer;
    flex-shrink: 0;
  }
  .todo-check input {
    position: absolute;
    opacity: 0;
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
  .todo-check-box {
    width: 18px;
    height: 18px;
    border-radius: 6px;
    border: 2px solid var(--card-border-color);
    transition: all 0.15s;
  }
  .todo-check input:checked + .todo-check-box {
    background: var(--primary-color);
    border-color: var(--primary-color);
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3'><path d='M5 12l5 5L20 7'/></svg>");
    background-size: 12px;
    background-position: center;
    background-repeat: no-repeat;
  }
  .todo-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .todo-content {
    font-size: 14px;
    cursor: text;
    word-break: break-word;
  }
  .todo-item.done .todo-content {
    text-decoration: line-through;
    color: var(--desc-color);
  }
  .todo-edit-input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--primary-color);
    background: transparent;
    color: var(--text-color);
    border-radius: 6px;
    padding: 3px 6px;
    font-size: 14px;
    outline: none;
  }
  .todo-due {
    flex-shrink: 0;
    font-size: 11.5px;
    color: var(--desc-color);
    background: var(--bl-input-noBorder-bg-color, rgba(0, 0, 0, 0.05));
    border-radius: 6px;
    padding: 1px 7px;
    white-space: nowrap;
  }
  .todo-due.overdue {
    color: #ef4444;
    background: color-mix(in srgb, #ef4444 12%, transparent);
  }
  .todo-del {
    border: 0;
    background: transparent;
    color: var(--desc-color);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
    flex-shrink: 0;
  }
  .todo-del:hover {
    color: #ef4444;
    opacity: 1 !important;
  }
  .todo-empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--desc-color);
    .todo-empty-icon {
      font-size: 44px;
    }
    p {
      margin: 12px 0 4px;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-color);
    }
    span {
      font-size: 13px;
    }
  }
  @media (max-width: 560px) {
    .todo-del {
      opacity: 0.6;
    }
  }
</style>
