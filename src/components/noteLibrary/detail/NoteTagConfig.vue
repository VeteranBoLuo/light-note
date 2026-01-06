<template>
  <BModal
    v-model:visible="visible"
    title="笔记标签配置"
    :mask-closable="false"
    wrap-class-name="note-tag-modal"
    @ok="handleOk"
  >
    <div class="tag-config" :class="{ mobile: bookmark.isMobile }">
      <div class="panel tag-panel">
        <div class="panel-header">
          <div class="title">标签库</div>
          <div class="tag-actions">
            <b-input v-model:value="searchValue" :maxlength="20" placeholder="搜索标签" />
            <b-button type="primary" size="small" @click="startCreate"> 新建标签 </b-button>
          </div>
        </div>
        <div class="tag-list" v-if="filteredTags.length">
          <div
            v-for="tag in filteredTags"
            :key="tag.id"
            class="tag-row"
            :class="{ active: selectedTagId === tag.id }"
            @click="selectTag(tag)"
          >
            <div class="tag-left">
              <span class="color-dot" />
              <div class="tag-text">
                <div class="tag-name">{{ tag.name }}</div>
              </div>
            </div>
            <div class="tag-meta">
              <b-button size="small" @click.stop="bindTag(tag)">添加</b-button>
            </div>
          </div>
        </div>
        <div class="empty" v-else>暂无标签，点击右上角新建</div>
      </div>

      <div class="panel edit-panel">
        <div class="panel-header">
          <div class="title">{{ editingTag?.id ? '编辑标签' : '新建标签' }}</div>
          <div class="hint">名称必填，20 字内</div>
        </div>
        <div class="form-item">
          <div class="label">名称</div>
          <b-input v-model:value="form.name" :maxlength="20" placeholder="输入标签名称" />
        </div>
        <div class="form-item single-line">仅需填写标签名称，提交后可直接绑定</div>
        <div class="form-actions">
          <b-button type="primary" :loading="saving" @click="submitTag">保存</b-button>
          <b-button v-if="editingTag?.id" :danger="true" @click="handleDelete(editingTag.id)">删除</b-button>
        </div>
      </div>

      <div class="panel note-panel">
        <div class="panel-header">
          <div class="title">已选标签</div>
          <b-button size="small" @click="resetTags">重置</b-button>
        </div>
        <div class="chip-list" v-if="noteTags.length">
          <div v-for="tag in noteTags" :key="tag.id" class="chip">
            <span class="color-dot" />
            <span class="chip-text">{{ tag.name }}</span>
            <SvgIcon :src="icon.common.close" class="chip-close" @click.stop="unbindTag(tag)" />
          </div>
        </div>
        <div class="empty" v-else>暂无标签，去左侧选择绑定</div>
      </div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import { computed, inject, onMounted, reactive, ref } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { apiBaseGet, apiBasePost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  import { message, Modal } from 'ant-design-vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';

  interface TagItem {
    id: number;
    name: string;
  }

  const visible = defineModel('visible');
  const bookmark = bookmarkStore();
  const note: any = inject('note');

  const allTags = ref<TagItem[]>([]);
  const noteTags = ref<TagItem[]>([]);
  const initialNoteTags = ref<TagItem[]>([]);
  const selectedTagId = ref<number | null>(null);
  const searchValue = ref('');
  const saving = ref(false);

  const form = reactive({
    id: null as number | null,
    name: '',
  });

  const editingTag = computed(() => (form.id ? (allTags.value.find((t) => t.id === form.id) ?? null) : null));

  const filteredTags = computed(() => {
    const keyword = searchValue.value.trim().toLowerCase();
    const list = [...allTags.value];
    if (!keyword) return list;
    return list.filter((tag) => tag.name.toLowerCase().includes(keyword));
  });

  onMounted(() => {
    fetchAllTags();
    fetchNoteTags();
  });

  async function fetchAllTags() {
    const res = await apiBasePost('/api/note/queryNoteTagList');
    if (res.status === 200) {
      allTags.value = (res.data ?? []).map(normalizeTag);
      console.log('allTags', allTags.value);
    }
  }

  async function fetchNoteTags() {
    if (!note?.id) return;
    try {
      const res = await apiBasePost('/api/note/getNoteTags', { id: note.id });
      if (res.status === 200) {
        noteTags.value = res.data;
        initialNoteTags.value = [...res.data];
        return;
      }
    } catch (error) {
      console.warn('fetchNoteTags fallback', error);
    }
    hydrateFromLocal();
  }

  function normalizeTag(raw: any): TagItem {
    return {
      id: raw.id,
      name: raw.name ?? '',
    };
  }

  function hydrateFromLocal() {
    if (!note?.tags) return;
    try {
      const parsed = JSON.parse(note.tags);
      if (Array.isArray(parsed)) {
        const ids = parsed.map((v) => Number(v)).filter((v) => !Number.isNaN(v));
        noteTags.value = allTags.value.filter((t) => ids.includes(t.id));
        initialNoteTags.value = [...noteTags.value];
      }
    } catch (error) {
      console.warn('parse note.tags failed', error);
    }
  }

  function startCreate() {
    resetForm();
    selectedTagId.value = null;
  }

  function selectTag(tag: TagItem) {
    console.log('selectTag', tag);
    selectedTagId.value = tag.id;
    form.id = tag.id;
    form.name = tag.name;
  }

  function resetForm() {
    form.name = '';
    form.id = null;
    selectedTagId.value = null;
  }

  function validateForm() {
    const name = form.name.trim();
    if (!name) {
      message.warning('名称不能为空');
      return false;
    }
    if (name.length > 20) {
      message.warning('名称需在 20 字以内');
      return false;
    }
    const duplicated = allTags.value.some((t) => t.name === name && t.id !== form.id);
    if (duplicated) {
      message.warning('标签名称已存在');
      return false;
    }
    return true;
  }

  async function submitTag() {
    if (!validateForm()) return;
    saving.value = true;
    const payload = {
      id: form.id,
      name: form.name.trim(),
    };
    try {
      const url = form.id ? '/api/note/editNoteTag' : '/api/note/addNoteTag';
      const res = await apiBasePost(url, payload);
      if (res.status === 200) {
        message.success(form.id ? '更新成功' : '创建成功');
        await fetchAllTags();
        if (!form.id && res.data?.id) {
          const created = allTags.value.find((t) => t.id === Number(res.data.id));
          if (created) bindTag(created);
        }
        if (form.id) {
          const updated = allTags.value.find((t) => t.id === form.id);
          if (updated) selectTag(updated);
        } else {
          resetForm();
        }
      }
    } finally {
      saving.value = false;
    }
  }

  async function handleDelete(id: number) {
    Modal.confirm({
      title: '删除标签',
      content: '删除后会同时解除与笔记的绑定，确认删除？',
      async onOk() {
        const res = await apiBasePost('/api/note/delNoteTag', { id });
        if (res.status === 200) {
          message.success('删除成功');
          await fetchAllTags();
          noteTags.value = noteTags.value.filter((t) => t.id !== id);
          resetForm();
        }
      },
    });
  }

  function bindTag(tag: TagItem) {
    if (noteTags.value.some((t) => t.id === tag.id)) {
      message.warning('标签已绑定');
      return;
    }
    if (noteTags.value.length >= 3) {
      message.warning('最多关联 3 个标签');
      return;
    }
    noteTags.value.push(tag);
  }

  function unbindTag(tag: TagItem) {
    noteTags.value = noteTags.value.filter((t) => t.id !== tag.id);
  }

  function resetTags() {
    noteTags.value = [...initialNoteTags.value];
  }

  async function handleOk() {
    if (!note?.id) {
      message.warning('笔记未保存');
      return;
    }
    const newTagIds = noteTags.value.map((t) => t.id);
    const res = await apiBasePost('/api/note/updateNoteTags', { noteId: note.id, tags: newTagIds });
    if (res.status === 200) {
      visible.value = false;
      emit('saveTag');
      message.success('保存成功');
    }
  }

  const emit = defineEmits(['saveTag']);
</script>

<style lang="less" scoped>
  .tag-config {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 20px;
    min-height: 450px;
    color: var(--text-color);

    &.mobile {
      grid-template-columns: 1fr;
      gap: 16px;
    }
  }

  .panel {
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7)) var(--user-body-bg-color, #ffffff),
      var(--user-body-bg-color, #ffffff);
    border: 1px solid var(--card-border-color, rgba(0, 0, 0, 0.08));
    border-radius: 16px;
    padding: 16px;
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.1),
      0 4px 12px rgba(0, 0, 0, 0.05);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;

    &:hover {
      box-shadow:
        0 12px 32px rgba(0, 0, 0, 0.15),
        0 6px 16px rgba(0, 0, 0, 0.1);
    }

    [data-theme='night'] &:hover {
      background:
        linear-gradient(145deg, rgba(53, 56, 65, 0.95), rgba(34, 34, 34, 0.9)) var(--user-body-bg-color, #2b2b2b),
        var(--user-body-bg-color, #2b2b2b);
      box-shadow:
        0 8px 24px rgba(0, 0, 0, 0.5),
        0 4px 12px rgba(0, 0, 0, 0.3);
    }
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .title {
    font-weight: 600;
    font-size: 16px;
    color: var(--text-color);
  }

  .hint {
    font-size: 12px;
    color: var(--desc-color);
  }

  .tag-actions {
    display: flex;
    gap: 8px;
    align-items: center;

    :deep(.b-input) {
      width: 160px;
    }
  }

  .tag-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 360px;
    overflow: auto;
  }

  .tag-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    border: 1px solid var(--card-border-color, rgba(0, 0, 0, 0.08));
    border-radius: 10px;
    background: var(--background-color, #ffffff);
    transition: all 0.15s ease;
    cursor: pointer;

    &:hover {
      border-color: rgba(96, 92, 229, 0.4);
      transform: translateY(-1px);
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.12);
    }

    &.active {
      border-color: rgba(96, 92, 229, 0.8);
      box-shadow: 0 0 0 1px rgba(96, 92, 229, 0.4);
    }
  }

  .tag-left {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .color-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.05);
    box-shadow: 0 0 0 2px rgba(96, 92, 229, 0.12);
    background: var(--noteType-hover-color, #605ce5);
    flex-shrink: 0;
  }

  .tag-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tag-name {
    color: var(--text-color);
    font-weight: 600;
  }

  .edit-panel .form-item,
  .note-panel .form-item {
    margin-bottom: 12px;
  }

  .label {
    font-size: 13px;
    color: var(--desc-color);
    margin-bottom: 6px;
  }

  .single-line {
    color: var(--desc-color);
    font-size: 13px;
    background: var(--common-tag-bg-color, #f0f0f0);
    border: 1px dashed var(--card-border-color, rgba(0, 0, 0, 0.08));
    padding: 10px;
    border-radius: 10px;

    [data-theme='night'] & {
      background: var(--common-tag-bg-color, #333333);
    }
  }

  .form-actions {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }

  .note-panel .chip-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 48px;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    border: 1px solid rgba(96, 92, 229, 0.3);
    background: rgba(96, 92, 229, 0.06);
    color: var(--text-color);
    font-size: 14px;
    transition: all 0.15s ease;
    cursor: default;

    &:hover {
      border-color: rgba(96, 92, 229, 0.5);
      background: rgba(96, 92, 229, 0.1);
    }

    [data-theme='night'] & {
      background: rgba(96, 92, 229, 0.1);
      border-color: rgba(96, 92, 229, 0.4);

      &:hover {
        background: rgba(96, 92, 229, 0.15);
      }
    }
  }

  .chip-text {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-close {
    width: 12px;
    height: 12px;
    cursor: pointer;
  }

  .empty {
    color: var(--desc-color);
    font-size: 13px;
    padding: 16px 0;
    text-align: center;
  }
</style>
