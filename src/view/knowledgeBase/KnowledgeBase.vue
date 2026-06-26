<template>
  <div class="knowledge-base">
    <!-- Header -->
    <div class="kb-header">
      <h2 class="kb-title">知识库</h2>
    </div>

    <!-- Main body -->
    <div class="kb-body" v-if="!isSearchMode">
      <!-- Left panel -->
      <div class="kb-left">
        <div class="kb-left-top">
          <b-input v-model:value="searchKeyword" clearable :placeholder="t('knowledgeBase.searchPlaceholder')" class="kb-search-input" @input="onSearchInput">
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
          <b-button type="primary" @click="startCreate">+ 新建</b-button>
        </div>

        <div class="kb-filters">
          <select v-model="filterCategory" class="kb-filter-select" @change="loadList">
            <option value="">全部</option>
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
          <select v-model="filterStatus" class="kb-filter-select" @change="loadList">
            <option value="">全部状态</option>
            <option value="public">● 公开</option>
            <option value="internal">🔒 内部</option>
          </select>
        </div>

        <div class="kb-list">
          <div v-for="item in listItems" :key="item.id" class="kb-list-item" :class="{ active: currentId === item.id }" @click="selectItem(item)">
            <div class="kb-list-item-left">
              <input type="checkbox" :checked="selectedIds.includes(item.id)" @click.stop @change="toggleSelect(item.id)" class="kb-checkbox" />
              <div class="kb-list-item-info" @click="selectItem(item)">
                <div class="kb-list-item-title">{{ item.title }}</div>
                <div class="kb-list-item-meta">
                  <span class="kb-badge" :class="'kb-badge--' + item.status">{{ item.status === 'public' ? '● 公开' : '🔒 内部' }}</span>
                  <span class="kb-category-label">{{ item.category }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="listItems.length === 0" class="kb-empty">暂无条目</div>
        </div>

        <!-- Batch action bar -->
        <div v-if="selectedIds.length > 0" class="kb-batch-bar">
          <span class="kb-batch-count">已选 {{ selectedIds.length }} 项</span>
          <button class="kb-batch-btn" @click="batchSetStatus('public')">公开</button>
          <button class="kb-batch-btn" @click="batchSetStatus('internal')">内部</button>
          <button class="kb-batch-btn" @click="showBatchCategory = true">改分类</button>
          <button class="kb-batch-btn kb-batch-btn--danger" @click="batchDelete">删除</button>
        </div>
      </div>

      <!-- Right panel -->
      <div class="kb-right">
        <div v-if="returnToSearch" class="kb-return-bar">
          <button class="kb-return-btn" @click="goBackToSearch">← {{ t('knowledgeBase.backToResults') }}</button>
        </div>

        <div v-if="currentItem" class="kb-editor">
          <div class="kb-editor-top">
            <b-input v-model:value="editTitle" placeholder="标题" class="kb-title-input" />
            <div class="kb-editor-meta">
              <label>分类：<select v-model="editCategory" class="kb-meta-select"><option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option></select></label>
              <label>状态：
                <select v-model="editStatus" class="kb-meta-select">
                  <option value="public">● 公开</option>
                  <option value="internal">🔒 内部</option>
                </select>
              </label>
              <label>类型：
                <select v-model="editType" class="kb-meta-select">
                  <option value="html">HTML</option>
                  <option value="markdown">Markdown</option>
                </select>
              </label>
            </div>
          </div>

          <Editor v-model:content="editContent" v-model:type="editType" class="kb-editor-area" />

          <div class="kb-editor-actions">
            <b-button type="primary" @click="saveItem" :loading="saving">💾 保存</b-button>
            <b-button type="danger" @click="deleteItem">🗑 删除</b-button>
            <span class="kb-editor-time" v-if="currentItem.updated_at">更新于 {{ currentItem.updated_at }}</span>
          </div>
        </div>

        <div v-else class="kb-editor-empty">
          <p>{{ t('knowledgeBase.selectHint') }}</p>
        </div>
      </div>
    </div>

    <!-- Search results view -->
    <div v-else class="kb-search-results">
      <div class="kb-search-results-header">
        <span class="kb-search-results-count">{{ t('knowledgeBase.searchResults', { count: searchResults.length }) }}</span>
        <button class="kb-search-clear" @click="clearSearch">✕ {{ t('knowledgeBase.clearSearch') }}</button>
      </div>

      <div v-if="searchResults.length === 0" class="kb-search-empty">{{ t('knowledgeBase.searchEmpty') }}</div>

      <div v-for="item in searchResults" :key="item.id" class="kb-search-card" @click="selectSearchResult(item)">
        <div class="kb-search-card-icon">📄</div>
        <div class="kb-search-card-body">
          <div class="kb-search-card-title" v-html="highlightText(item.title, searchKeyword)"></div>
          <div class="kb-search-card-meta">
            <span class="kb-badge" :class="'kb-badge--' + item.status">{{ item.status === 'public' ? '● 公开' : '🔒 内部' }}</span>
            <span class="kb-category-label">{{ item.category }}</span>
          </div>
          <div class="kb-search-card-snippet" v-html="highlightText(item.content_preview || '', searchKeyword)"></div>
        </div>
      </div>
    </div>

    <!-- Batch category modal -->
    <div v-if="showBatchCategory" class="kb-modal-overlay" @click.self="showBatchCategory = false">
      <div class="kb-modal">
        <h3>修改分类</h3>
        <select v-model="batchCategoryValue" class="kb-meta-select" style="width:100%;margin:12px 0">
          <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
        <div class="kb-modal-actions">
          <b-button @click="showBatchCategory = false">取消</b-button>
          <b-button type="primary" @click="confirmBatchCategory">确定</b-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import icon from '@/config/icon';
import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import Editor from '@/components/noteLibrary/detail/Editor.vue';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
import { apiBasePost } from '@/http/request';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

// Data
const listItems = ref<any[]>([]);
const currentItem = ref<any>(null);
const currentId = ref('');
const editTitle = ref('');
const editContent = ref('');
const editCategory = ref('帮助中心');
const editStatus = ref('internal');
const editType = ref('html');
const selectedIds = ref<string[]>([]);
const filterCategory = ref('');
const filterStatus = ref('');
const searchKeyword = ref('');
const searchResults = ref<any[]>([]);
const isSearchMode = ref(false);
const returnToSearch = ref(false);
const savedSearchKeyword = ref('');
const showBatchCategory = ref(false);
const batchCategoryValue = ref('帮助中心');
const saving = ref(false);

const categories = ['帮助中心', '内部知识', 'FAQ', '系统行为'];

// Load list
async function loadList() {
  const res = await apiBasePost('/api/knowledgeBase/list', {
    filters: {
      category: filterCategory.value || undefined,
      status: filterStatus.value || undefined,
    },
    pageSize: 100,
    currentPage: 1,
  });
  if (res.status === 200 && res.data) {
    listItems.value = res.data.items || [];
    if (listItems.value.length > 0 && !currentId.value) {
      selectItem(listItems.value[0]);
    }
  }
}

// Select item
function selectItem(item: any) {
  currentId.value = item.id;
  returnToSearch.value = false;
  loadItem(item.id);
}

async function loadItem(id: string) {
  const res = await apiBasePost('/api/knowledgeBase/get', { id });
  if (res.status === 200 && res.data) {
    currentItem.value = res.data;
    editTitle.value = res.data.title || '';
    editContent.value = res.data.content || '';
    editCategory.value = res.data.category || '帮助中心';
    editStatus.value = res.data.status || 'internal';
    editType.value = res.data.type || 'html';
  }
}

// Create new
function startCreate() {
  currentId.value = '';
  returnToSearch.value = false;
  currentItem.value = { title: '', content: '', category: '帮助中心', status: 'internal', type: 'html' };
  editTitle.value = '';
  editContent.value = '';
  editCategory.value = '帮助中心';
  editStatus.value = 'internal';
  editType.value = 'html';
}

// Save
async function saveItem() {
  if (!editTitle.value?.trim()) {
    message.warning('标题不能为空');
    return;
  }
  saving.value = true;
  try {
    if (currentId.value) {
      await apiBasePost('/api/knowledgeBase/update', {
        id: currentId.value,
        title: editTitle.value.trim(),
        content: editContent.value,
        category: editCategory.value,
        status: editStatus.value,
        type: editType.value,
      });
      message.success('保存成功');
    } else {
      const res = await apiBasePost('/api/knowledgeBase/create', {
        title: editTitle.value.trim(),
        content: editContent.value,
        category: editCategory.value,
        status: editStatus.value,
        type: editType.value,
      });
      if (res.status === 200 && res.data?.id) {
        currentId.value = res.data.id;
        message.success('创建成功');
      }
    }
    await loadList();
  } finally {
    saving.value = false;
  }
}

// Delete
function deleteItem() {
  if (!currentId.value) return;
  Alert.alert({
    title: '确认删除',
    content: `确定删除「${editTitle.value}」吗？`,
    async onOk() {
      await apiBasePost('/api/knowledgeBase/delete', { id: currentId.value });
      message.success('已删除');
      currentId.value = '';
      currentItem.value = null;
      await loadList();
    },
  });
}

// Search
let searchTimer: any = null;
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    doSearch();
  }, 300);
}

async function doSearch() {
  const kw = searchKeyword.value.trim();
  if (!kw) {
    isSearchMode.value = false;
    return;
  }
  const res = await apiBasePost('/api/knowledgeBase/search', {
    keyword: kw,
    category: filterCategory.value || undefined,
    status: filterStatus.value || undefined,
  });
  if (res.status === 200 && res.data) {
    searchResults.value = res.data.items || [];
    isSearchMode.value = true;
    savedSearchKeyword.value = kw;
  }
}

function clearSearch() {
  searchKeyword.value = '';
  isSearchMode.value = false;
  returnToSearch.value = false;
}

function selectSearchResult(item: any) {
  // Auto save current editing item
  if (currentId.value && editTitle.value?.trim()) {
    apiBasePost('/api/knowledgeBase/update', {
      id: currentId.value,
      title: editTitle.value.trim(),
      content: editContent.value,
      category: editCategory.value,
      status: editStatus.value,
      type: editType.value,
    }).catch(() => {});
  }
  savedSearchKeyword.value = searchKeyword.value;
  returnToSearch.value = true;
  selectItem(item);
}

function goBackToSearch() {
  searchKeyword.value = savedSearchKeyword.value;
  isSearchMode.value = true;
  returnToSearch.value = false;
  doSearch();
}

// Toggle select
function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) selectedIds.value.splice(idx, 1);
  else selectedIds.value.push(id);
}

// Batch operations
async function batchSetStatus(status: string) {
  await apiBasePost('/api/knowledgeBase/batchUpdateStatus', { ids: selectedIds.value, status });
  message.success(`已更新 ${selectedIds.value.length} 条状态`);
  selectedIds.value = [];
  await loadList();
}

function confirmBatchCategory() {
  apiBasePost('/api/knowledgeBase/batchUpdateCategory', { ids: selectedIds.value, category: batchCategoryValue.value }).then(() => {
    message.success(`已更新 ${selectedIds.value.length} 条分类`);
    selectedIds.value = [];
    showBatchCategory.value = false;
    loadList();
  });
}

async function batchDelete() {
  Alert.alert({
    title: '确认批量删除',
    content: `确定删除 ${selectedIds.value.length} 条知识吗？`,
    async onOk() {
      await apiBasePost('/api/knowledgeBase/batchDelete', { ids: selectedIds.value });
      message.success(`已删除 ${selectedIds.value.length} 条`);
      selectedIds.value = [];
      loadList();
    },
  });
}

// Highlight
function highlightText(text: string, keyword: string): string {
  if (!keyword?.trim() || !text) return text || '';
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark class="kb-highlight">$1</mark>');
}

onMounted(() => {
  loadList();
});
</script>

<style lang="less" scoped>
.knowledge-base {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
}
.kb-header {
  flex-shrink: 0;
  margin-bottom: 16px;
}
.kb-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: var(--text-color);
}

.kb-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
}

/* Left panel */
.kb-left {
  width: 320px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--card-border-color);
  border-radius: 8px;
  padding: 12px;
  box-sizing: border-box;
}
.kb-left-top {
  display: flex;
  gap: 8px;
  align-items: center;
}
.kb-search-input {
  flex: 1;
}
.kb-filters {
  display: flex;
  gap: 8px;
}
.kb-filter-select {
  flex: 1;
  height: 32px;
  border: 1px solid var(--card-border-color);
  border-radius: 6px;
  background: var(--background-color);
  color: var(--text-color);
  padding: 0 8px;
  font-size: 13px;
  cursor: pointer;
}
.kb-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.kb-list-item {
  display: flex;
  align-items: flex-start;
  padding: 8px 6px;
  border-radius: 6px;
  cursor: pointer;
  gap: 8px;
  transition: background 0.15s;
}
.kb-list-item:hover, .kb-list-item.active {
  background: var(--bl-input-noBorder-bg-color);
}
.kb-list-item-left {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  width: 100%;
  cursor: pointer;
}
.kb-checkbox {
  margin-top: 3px;
  accent-color: var(--primary-color);
  cursor: pointer;
}
.kb-list-item-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.kb-list-item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kb-list-item-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
}

/* Badge */
.kb-badge {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
}
.kb-badge--public {
  color: var(--resource-note-color, #00a884);
}
.kb-badge--internal {
  color: var(--desc-color);
}
.kb-category-label {
  color: var(--desc-color);
  font-size: 11px;
}

/* Batch */
.kb-batch-bar {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px 0 0;
  border-top: 1px solid var(--card-border-color);
  flex-wrap: wrap;
}
.kb-batch-count {
  font-size: 12px;
  color: var(--desc-color);
  margin-right: 4px;
}
.kb-batch-btn {
  border: 1px solid var(--card-border-color);
  background: transparent;
  color: var(--text-color);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.kb-batch-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}
.kb-batch-btn--danger:hover {
  border-color: #ff4d4f;
  color: #ff4d4f;
}

/* Right panel */
.kb-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--card-border-color);
  border-radius: 8px;
  overflow: hidden;
}
.kb-return-bar {
  flex-shrink: 0;
  padding: 8px 16px;
  border-bottom: 1px solid var(--card-border-color);
  background: var(--bl-input-noBorder-bg-color);
}
.kb-return-btn {
  border: none;
  background: transparent;
  color: var(--primary-color);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}
.kb-return-btn:hover {
  text-decoration: underline;
}
.kb-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
}
.kb-editor-top {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.kb-title-input {
  width: 100% !important;
}
.kb-editor-meta {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-color);
  align-items: center;
  flex-wrap: wrap;
}
.kb-meta-select {
  height: 28px;
  border: 1px solid var(--card-border-color);
  border-radius: 4px;
  background: var(--background-color);
  color: var(--text-color);
  padding: 0 6px;
  font-size: 12px;
  cursor: pointer;
}
.kb-editor-area {
  flex: 1;
  min-height: 0;
}
.kb-editor-actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  align-items: center;
  padding-top: 12px;
}
.kb-editor-time {
  font-size: 12px;
  color: var(--desc-color);
  margin-left: auto;
}
.kb-editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--desc-color);
}

/* Search results */
.kb-search-results {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 4px;
}
.kb-search-results-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--card-border-color);
  margin-bottom: 12px;
}
.kb-search-results-count {
  font-size: 14px;
  color: var(--desc-color);
}
.kb-search-clear {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--primary-color);
  font-size: 13px;
  cursor: pointer;
}
.kb-search-empty {
  text-align: center;
  padding: 40px;
  color: var(--desc-color);
}
.kb-search-card {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid var(--card-border-color);
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.kb-search-card:hover {
  border-color: var(--primary-color);
  background: var(--bl-input-noBorder-bg-color);
}
.kb-search-card-icon {
  font-size: 20px;
  flex-shrink: 0;
  line-height: 1.4;
}
.kb-search-card-body {
  flex: 1;
  min-width: 0;
}
.kb-search-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 4px;
}
.kb-search-card-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}
.kb-search-card-snippet {
  font-size: 13px;
  color: var(--desc-color);
  line-height: 1.6;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
mark.kb-highlight {
  background: color-mix(in srgb, var(--primary-color) 30%, transparent);
  color: var(--text-color);
  padding: 1px 2px;
  border-radius: 2px;
}

/* Modal */
.kb-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.kb-modal {
  background: var(--background-color);
  border: 1px solid var(--card-border-color);
  border-radius: 12px;
  padding: 20px;
  width: 360px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}
.kb-modal h3 {
  margin: 0 0 8px;
  font-size: 16px;
  color: var(--text-color);
}
.kb-modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}

.kb-empty {
  text-align: center;
  padding: 20px;
  color: var(--desc-color);
  font-size: 13px;
}
</style>
