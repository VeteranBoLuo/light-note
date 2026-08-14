<template>
  <BPopover
    v-model:open="open"
    class="admin-user-picker-trigger"
    trigger="manual"
    placement="bottom-left"
    overlay-class-name="admin-user-picker-popover"
  >
    <div
      ref="pickerRef"
      class="admin-user-picker"
      role="combobox"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.esc.prevent="open = false"
      @keydown.enter.prevent="selectActive"
    >
      <BInput
        v-model:value="keyword"
        clearable
        placeholder="输入昵称、邮箱或用户 ID"
        autocomplete="off"
        @input="scheduleSearch"
        @focus="handleFocus"
      />
    </div>

    <template #content>
      <div class="admin-user-picker__panel" role="listbox">
        <BLoading v-if="loading" :loading="true" inline title="正在搜索用户…" />
        <p v-else-if="keyword.trim().length < 1" class="admin-user-picker__empty">输入任意昵称、邮箱或 ID 开始搜索</p>
        <p v-else-if="!rows.length" class="admin-user-picker__empty">没有找到匹配用户</p>
        <template v-else>
          <BButton
            v-for="(user, index) in rows"
            :key="user.userId"
            class="admin-user-picker__option"
            :class="{ 'is-active': index === activeIndex }"
            role="option"
            :aria-selected="index === activeIndex"
            @mouseenter="activeIndex = index"
            @click="selectUser(user)"
          >
            <span class="admin-user-picker__identity">
              <strong>{{ user.alias || '未设置昵称' }}</strong>
              <small>{{ user.email || user.userId }}</small>
            </span>
            <span class="admin-user-picker__points">{{ Number(user.points || 0).toLocaleString() }} 积分</span>
          </BButton>
        </template>
      </div>
    </template>
  </BPopover>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import growthApi from '@/api/growthApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';

  export interface AdminUserSearchResult {
    userId: string;
    alias: string | null;
    email: string | null;
    points: number;
    role?: string;
    lastActiveTime?: string | null;
  }

  const emit = defineEmits<{ select: [user: AdminUserSearchResult] }>();
  const keyword = ref('');
  const rows = ref<AdminUserSearchResult[]>([]);
  const loading = ref(false);
  const open = ref(false);
  const activeIndex = ref(0);
  const pickerRef = ref<HTMLElement | null>(null);
  let timer: number | undefined;
  let requestSequence = 0;

  function scheduleSearch() {
    open.value = true;
    rows.value = [];
    activeIndex.value = 0;
    window.clearTimeout(timer);
    const value = keyword.value.trim();
    if (!value) {
      loading.value = false;
      return;
    }
    timer = window.setTimeout(() => void search(value), 300);
  }

  async function search(value: string) {
    const sequence = ++requestSequence;
    loading.value = true;
    try {
      const response: any = await growthApi.adminSearchUsers(value, 20);
      if (sequence !== requestSequence || keyword.value.trim() !== value) return;
      rows.value = response.status === 200 ? response.data?.rows || [] : [];
      activeIndex.value = 0;
    } catch {
      if (sequence === requestSequence) rows.value = [];
    } finally {
      if (sequence === requestSequence) loading.value = false;
    }
  }

  function handleFocus() {
    open.value = true;
    if (keyword.value.trim() && !rows.value.length) scheduleSearch();
  }

  function move(direction: number) {
    if (!rows.value.length) return;
    open.value = true;
    activeIndex.value = (activeIndex.value + direction + rows.value.length) % rows.value.length;
  }

  function selectActive() {
    const user = rows.value[activeIndex.value];
    if (user) selectUser(user);
  }

  function selectUser(user: AdminUserSearchResult) {
    keyword.value = user.alias || user.email || user.userId;
    open.value = false;
    emit('select', user);
  }

  function handleOutsidePointer(event: MouseEvent) {
    const target = event.target as Node | null;
    if (!target || pickerRef.value?.contains(target)) return;
    if (target instanceof Element && target.closest('.admin-user-picker-popover')) return;
    open.value = false;
  }

  onMounted(() => document.addEventListener('mousedown', handleOutsidePointer, true));
  onBeforeUnmount(() => {
    window.clearTimeout(timer);
    document.removeEventListener('mousedown', handleOutsidePointer, true);
  });
</script>

<style scoped lang="less">
  .admin-user-picker {
    width: 100%;
  }
</style>

<style lang="less">
  .admin-user-picker-trigger {
    width: min(560px, 100%);
  }

  .admin-user-picker-popover {
    width: min(560px, calc(100vw - 24px));
    max-height: 360px;
    overflow-y: auto;
  }

  .admin-user-picker__panel {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
  }

  .admin-user-picker__empty {
    margin: 0;
    padding: 18px 12px;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  .admin-user-picker__option {
    display: flex !important;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 52px;
    padding: 7px 10px !important;
    border: 1px solid transparent !important;
    border-radius: 8px !important;
    background: transparent !important;
    color: var(--text-color) !important;
    text-align: left;

    &:hover,
    &.is-active {
      border-color: var(--primary-color) !important;
      background: var(--hover-background) !important;
    }
  }

  .admin-user-picker__identity {
    display: grid;
    min-width: 0;

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      margin-top: 2px;
      color: var(--desc-color);
    }
  }

  .admin-user-picker__points {
    flex: 0 0 auto;
    margin-left: 12px;
    color: var(--desc-color);
    font-size: 12px;
  }
</style>
