<template>
  <div class="knowledge-base">
    <!-- Header -->
    <div class="kb-header">
      <h2 class="kb-title">知识库</h2>
    </div>

    <!-- Main body: 左栏始终显示，右栏在搜索时显示结果、不搜时显示编辑器 -->
    <div class="kb-body">
      <!-- Left panel -->
      <div class="kb-left">
        <div class="kb-left-top">
          <BInput v-model:value="searchKeyword" clearable :placeholder="t('knowledgeBase.searchPlaceholder')" class="kb-search-input" @input="onSearchInput">
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </BInput>
          <BButton type="primary" @click="startCreate">
            <SvgIcon :src="icon.common.plus" size="15" aria-hidden="true" />
            新建
          </BButton>
        </div>

        <div class="kb-filters">
          <BSelect v-model:value="filterCategory" :options="categoryFilterOptions" placeholder="全部分类" @change="loadList" class="kb-filter-select" />
          <BSelect v-model:value="filterStatus" :options="statusFilterOptions" placeholder="全部状态" @change="loadList" class="kb-filter-select" />
        </div>

        <div class="kb-list">
          <div v-if="isSearchMode" class="kb-search-hint">搜索中，请在右侧结果中选择</div>
          <template v-else>
            <div v-for="item in listItems" :key="item.id" class="kb-list-item" :class="{ active: currentId === item.id }" @click="selectItem(item)">
              <div class="kb-list-item-left">
                <BCheckbox :checked="selectedIds.includes(item.id)" @click.stop @change="toggleSelect(item.id)" class="kb-checkbox" />
                <div class="kb-list-item-info">
                  <div class="kb-list-item-title">{{ item.title }}</div>
                  <div class="kb-list-item-meta">
                    <span class="kb-badge" :class="'kb-badge--' + item.status">{{ item.status === 'public' ? '公开' : '内部' }}</span>
                    <span class="kb-category-label">{{ item.category }}</span>
                    <span v-if="item.category === '帮助中心' && item.helpSection" class="kb-help-section-label">{{ item.helpSection }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <div v-if="!isSearchMode && listItems.length === 0" class="kb-empty">暂无条目</div>
        </div>

        <!-- Batch action bar -->
        <div v-if="selectedIds.length > 0" class="kb-batch-bar">
          <span class="kb-batch-count">已选 {{ selectedIds.length }} 项</span>
          <BButton size="small" class="kb-batch-btn" @click="batchSetStatus('public')">公开</BButton>
          <BButton size="small" class="kb-batch-btn" @click="batchSetStatus('internal')">内部</BButton>
          <BButton size="small" class="kb-batch-btn" @click="showBatchCategory = true">改分类</BButton>
          <BButton size="small" class="kb-batch-btn kb-batch-btn--danger" @click="batchDelete">删除</BButton>
        </div>
      </div>

      <!-- Right panel: 搜索时显示结果卡片，否则显示编辑器 -->
      <div class="kb-right">
        <!-- 搜索结果 -->
        <template v-if="isSearchMode && !returnToSearch">
          <div class="kb-search-results">
            <div class="kb-search-results-header">
              <span class="kb-search-results-count">{{ t('knowledgeBase.searchResults', { count: searchResults.length }) }}</span>
              <BButton size="small" class="kb-search-clear" @click="clearSearch">
                <SvgIcon :src="icon.navigation.close" size="14" aria-hidden="true" />
                {{ t('knowledgeBase.clearSearch') }}
              </BButton>
            </div>
            <div v-if="searchResults.length === 0" class="kb-search-empty">{{ t('knowledgeBase.searchEmpty') }}</div>
            <div v-for="item in searchResults" :key="item.id" class="kb-search-card" @click="selectSearchResult(item)">
              <div class="kb-search-card-icon"><SvgIcon :src="icon.help_document" size="20" aria-hidden="true" /></div>
              <div class="kb-search-card-body">
                <div class="kb-search-card-title" v-html="highlightText(item.title, searchKeyword)"></div>
                <div class="kb-search-card-meta">
                  <span class="kb-badge" :class="'kb-badge--' + item.status">{{ item.status === 'public' ? '公开' : '内部' }}</span>
                  <span class="kb-category-label">{{ item.category }}</span>
                  <span v-if="item.category === '帮助中心' && item.helpSection" class="kb-help-section-label">{{ item.helpSection }}</span>
                </div>
                <div class="kb-search-card-snippet" v-html="getSearchSnippet(item, searchKeyword)"></div>
              </div>
            </div>
          </div>
        </template>
        <!-- 编辑器 -->
        <template v-else>
          <div v-if="returnToSearch" class="kb-return-bar">
            <BButton size="small" class="kb-return-btn" @click="goBackToSearch">
              <SvgIcon :src="icon.arrow_left" size="14" aria-hidden="true" />
              {{ t('knowledgeBase.backToResults') }}
            </BButton>
          </div>
          <div v-if="currentItem" class="kb-editor">
            <div class="kb-editor-top">
              <BInput v-model:value="editTitle" placeholder="标题" class="kb-title-input" />
              <div class="kb-editor-meta">
                <label class="kb-meta-label">分类：<BInput v-model:value="editCategory" placeholder="输入分类名称" class="kb-category-input" /></label>
                <label v-if="isHelpCenterArticle" class="kb-meta-label">帮助栏目：<BInput v-model:value="editHelpSection" maxlength="50" placeholder="例如：笔记与编辑" class="kb-help-section-input" /></label>
                <label class="kb-meta-label">状态：<BSelect v-model:value="editStatus" :options="statusOptions" class="kb-meta-select" /></label>
                <label class="kb-meta-label">类型：<BSelect v-model:value="editType" :options="typeOptions" class="kb-meta-select" /></label>
              </div>
            </div>
            <Editor v-model:content="editContent" v-model:type="editType" class="kb-editor-area" />
            <div class="kb-editor-actions">
              <BButton type="primary" @click="saveItem" :loading="saving">
                <SvgIcon :src="icon.noteDetail.saveLine" size="15" aria-hidden="true" />
                保存
              </BButton>
              <BButton type="danger" @click="deleteItem">
                <SvgIcon :src="icon.noteDetail.deleteLine" size="15" aria-hidden="true" />
                归档
              </BButton>
              <span class="kb-editor-time" v-if="currentItem.updated_at">更新于 {{ currentItem.updated_at }}</span>
            </div>
          </div>
          <div v-else class="kb-editor-empty">
            <p>{{ t('knowledgeBase.selectHint') }}</p>
          </div>
        </template>
      </div>
    </div>

    <BModal v-model:visible="showBatchCategory" title="修改分类" width="360px" @ok="confirmBatchCategory">
      <BSelect v-model:value="batchCategoryValue" :options="categoryOptions" class="kb-batch-category-select" />
    </BModal>
    <AdminRiskActionModal
      v-model:visible="riskVisible"
      :title="riskConfig.title"
      :impact="riskConfig.impact"
      :confirm-phrase="riskConfig.phrase"
      :confirm-label="riskConfig.label"
      :loading="saving"
      @confirm="confirmRiskAction"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import icon from '@/config/icon';
import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BSelect from '@/components/base/BasicComponents/BSelect.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
import Editor from '@/components/noteLibrary/detail/Editor.vue';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
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
const editHelpSection = ref('其他帮助');
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
type KnowledgeRiskKind = 'save' | 'archive' | 'batchStatus' | 'batchCategory' | 'batchArchive';
type RiskPayload = { reason: string; confirmed: true; confirmText: string };
const riskVisible = ref(false);
const riskKind = ref<KnowledgeRiskKind>('save');
const pendingBatchStatus = ref<'public' | 'internal'>('internal');

const categories = ref<string[]>(['帮助中心']);
let unavailableArticleId = '';
const isHelpCenterArticle = computed(() => editCategory.value.trim() === '帮助中心');

function routeArticleId() {
  const value = route.query.article;
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function articleQuery(articleId = '') {
  const query = { ...route.query };
  if (articleId) query.article = articleId;
  else delete query.article;
  return query;
}

function syncArticleRoute(articleId: string, replace = false) {
  if (routeArticleId() === articleId) return;
  const navigation = { name: 'knowledgeBase', query: articleQuery(articleId) };
  void (replace ? router.replace(navigation) : router.push(navigation));
}

const categoryOptions = computed(() => categories.value.map((c) => ({ value: c, label: c })));

async function loadCategories() {
  const res = await apiBasePost('/api/knowledgeBase/categories');
  if (res.status === 200 && Array.isArray(res.data)) {
    categories.value = res.data;
  }
}
const statusOptions = computed(() => [
  { value: 'public', label: '公开' },
  { value: 'internal', label: '内部' },
]);
const typeOptions = computed(() => [
  { value: 'html', label: 'HTML' },
  { value: 'markdown', label: 'Markdown' },
]);
const categoryFilterOptions = computed(() => [{ value: '', label: '全部分类' }, ...categoryOptions.value]);
const statusFilterOptions = computed(() => [{ value: '', label: '全部状态' }, ...statusOptions.value]);
const riskConfig = computed(() => {
  if (riskKind.value === 'archive') {
    return {
      title: '归档知识条目',
      impact: `将“${editTitle.value || currentId.value}”转为内部状态并从知识库工作台归档。内容与审计证据会保留。`,
      phrase: '确认归档知识',
      label: '确认归档',
    };
  }
  if (riskKind.value === 'batchArchive') {
    return {
      title: '批量归档知识',
      impact: `将 ${selectedIds.value.length} 条知识转为内部状态并归档，内容与审计证据会保留。`,
      phrase: '确认归档知识',
      label: '确认归档',
    };
  }
  if (riskKind.value === 'batchStatus') {
    const publishing = pendingBatchStatus.value === 'public';
    return {
      title: publishing ? '批量发布知识' : '批量转为内部知识',
      impact: `将 ${selectedIds.value.length} 条知识调整为“${publishing ? '公开' : '内部'}”。公开内容会进入帮助与 AI 检索范围。`,
      phrase: publishing ? '确认发布知识' : '',
      label: publishing ? '确认发布' : '确认调整',
    };
  }
  if (riskKind.value === 'batchCategory') {
    return {
      title: '批量修改知识分类',
      impact: `将 ${selectedIds.value.length} 条知识移动到“${batchCategoryValue.value}”分类。`,
      phrase: '',
      label: '确认修改',
    };
  }
  const publishing = editStatus.value === 'public' && (!currentId.value || currentItem.value?.status !== 'public');
  return {
    title: publishing ? '发布知识条目' : currentId.value ? '保存知识条目' : '创建知识条目',
    impact: publishing
      ? `“${editTitle.value}”将进入公开帮助与 AI 检索范围，请确认内容不含内部信息。`
      : `将保存“${editTitle.value}”的内容、分类、状态与类型变更。`,
    phrase: publishing ? '确认发布知识' : '',
    label: publishing ? '确认发布' : '确认保存',
  };
});

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
    const articleId = routeArticleId();
    if (articleId) {
      await openArticleFromRoute();
    } else if (listItems.value.length > 0 && !currentId.value && !currentItem.value) {
      await selectItem(listItems.value[0], false);
    }
  }
}

// Select item
async function selectItem(item: any, syncRoute = true) {
  returnToSearch.value = false;
  // 搜索模式下点左栏条目 → 退出搜索显示编辑器
  if (isSearchMode.value) {
    searchKeyword.value = '';
    isSearchMode.value = false;
  }
  const loaded = await loadItem(String(item.id));
  if (loaded && syncRoute) syncArticleRoute(String(item.id));
}

async function loadItem(id: string) {
  const res = await apiBasePost('/api/knowledgeBase/get', { id });
  if (res.status === 200 && res.data) {
    currentId.value = String(res.data.id || id);
    currentItem.value = res.data;
    editTitle.value = res.data.title || '';
    editContent.value = res.data.content || '';
    editCategory.value = res.data.category || '帮助中心';
    editHelpSection.value = res.data.helpSection || '其他帮助';
    editStatus.value = res.data.status || 'internal';
    editType.value = res.data.type || 'html';
    return true;
  }
  return false;
}

async function openArticleFromRoute() {
  const articleId = routeArticleId();
  if (!articleId) {
    unavailableArticleId = '';
    if (isSearchMode.value || (!currentId.value && currentItem.value)) return;
    currentId.value = '';
    currentItem.value = null;
    if (listItems.value.length) await selectItem(listItems.value[0], false);
    return;
  }
  if (currentId.value === articleId && currentItem.value) return;
  searchKeyword.value = '';
  isSearchMode.value = false;
  returnToSearch.value = false;
  if (await loadItem(articleId)) {
    unavailableArticleId = '';
    return;
  }
  currentId.value = '';
  currentItem.value = null;
  syncArticleRoute('', true);
  if (unavailableArticleId !== articleId) {
    unavailableArticleId = articleId;
    message.warning('该知识条目不存在或已被删除');
  }
  if (listItems.value.length) await selectItem(listItems.value[0], false);
}

// Create new
function startCreate() {
  currentId.value = '';
  returnToSearch.value = false;
  currentItem.value = { title: '', content: '', category: '帮助中心', helpSection: '其他帮助', status: 'internal', type: 'html' };
  editTitle.value = '';
  editContent.value = '';
  editCategory.value = '帮助中心';
  editHelpSection.value = '其他帮助';
  editStatus.value = 'internal';
  editType.value = 'html';
  syncArticleRoute('', true);
}

// Save
function saveItem() {
  if (!editTitle.value?.trim()) {
    message.warning('标题不能为空');
    return;
  }
  riskKind.value = 'save';
  riskVisible.value = true;
}

async function executeSave(action: RiskPayload) {
  saving.value = true;
  try {
    if (currentId.value) {
      const res = await apiBasePost('/api/knowledgeBase/update', {
        id: currentId.value,
        title: editTitle.value.trim(),
        content: editContent.value,
        category: editCategory.value,
        helpSection: isHelpCenterArticle.value ? editHelpSection.value.trim() || '其他帮助' : null,
        status: editStatus.value,
        type: editType.value,
        ...action,
      });
      message.success(`保存成功 · 审计 ${String(res.data?.auditId || '').slice(0, 8)}`);
    } else {
      const res = await apiBasePost('/api/knowledgeBase/create', {
        title: editTitle.value.trim(),
        content: editContent.value,
        category: editCategory.value,
        helpSection: isHelpCenterArticle.value ? editHelpSection.value.trim() || '其他帮助' : null,
        status: editStatus.value,
        type: editType.value,
        ...action,
      });
      if (res.status === 200 && res.data?.id) {
        currentId.value = res.data.id;
        syncArticleRoute(String(res.data.id), true);
        message.success(`创建成功 · 审计 ${String(res.data?.auditId || '').slice(0, 8)}`);
      }
    }
    await loadList();
    riskVisible.value = false;
  } finally {
    saving.value = false;
  }
}

// Delete
function deleteItem() {
  if (!currentId.value) return;
  riskKind.value = 'archive';
  riskVisible.value = true;
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
  // 搜索内容变化时，退出文章详情回到搜索结果
  returnToSearch.value = false;
  const res = await apiBasePost('/api/knowledgeBase/search', {
    keyword: kw,
    category: filterCategory.value || undefined,
    status: filterStatus.value || undefined,
  });
  if (res.status === 200 && res.data) {
    searchResults.value = res.data.items || [];
    isSearchMode.value = true;
    savedSearchKeyword.value = kw;
    syncArticleRoute('', true);
  }
}

function clearSearch() {
  searchKeyword.value = '';
  isSearchMode.value = false;
  returnToSearch.value = false;
  syncArticleRoute('', true);
}
/** 后端已返回关键字上下文片段，直接高亮展示 */
function getSearchSnippet(item: any, keyword: string): string {
  const text = item.contentPreview || item.content_preview || '';
  if (!keyword?.trim() || !text) return '';
  return highlightText(text, keyword);
}

/** 点击搜索结果 → 加载文章，保留搜索状态以便返回 */
async function selectSearchResult(result: any) {
  savedSearchKeyword.value = searchKeyword.value;
  returnToSearch.value = true;
  // 直接加载，不经过 selectItem（selectItem 会清空搜索）
  if (await loadItem(String(result.id))) syncArticleRoute(String(result.id));
}

function goBackToSearch() {
  searchKeyword.value = savedSearchKeyword.value;
  isSearchMode.value = true;
  returnToSearch.value = false;
  syncArticleRoute('', true);
  doSearch();
}

// Toggle select
function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) selectedIds.value.splice(idx, 1);
  else selectedIds.value.push(id);
}

// Batch operations
function batchSetStatus(status: string) {
  pendingBatchStatus.value = status === 'public' ? 'public' : 'internal';
  riskKind.value = 'batchStatus';
  riskVisible.value = true;
}

function confirmBatchCategory() {
  showBatchCategory.value = false;
  riskKind.value = 'batchCategory';
  riskVisible.value = true;
}

async function batchDelete() {
  riskKind.value = 'batchArchive';
  riskVisible.value = true;
}

async function confirmRiskAction(action: RiskPayload) {
  if (riskKind.value === 'save') {
    await executeSave(action);
    return;
  }
  saving.value = true;
  try {
    if (riskKind.value === 'archive') {
      const archivedId = currentId.value;
      const res = await apiBasePost('/api/knowledgeBase/delete', { id: archivedId, ...action });
      message.success(`已归档 · 审计 ${String(res.data?.auditId || '').slice(0, 8)}`);
      listItems.value = listItems.value.filter((item) => String(item.id) !== archivedId);
      currentId.value = '';
      currentItem.value = null;
      syncArticleRoute('', true);
    } else if (riskKind.value === 'batchStatus') {
      const count = selectedIds.value.length;
      const res = await apiBasePost('/api/knowledgeBase/batchUpdateStatus', {
        ids: [...selectedIds.value],
        status: pendingBatchStatus.value,
        ...action,
      });
      message.success(`已更新 ${count} 条状态 · 审计 ${String(res.data?.auditId || '').slice(0, 8)}`);
      selectedIds.value = [];
    } else if (riskKind.value === 'batchCategory') {
      const count = selectedIds.value.length;
      const res = await apiBasePost('/api/knowledgeBase/batchUpdateCategory', {
        ids: [...selectedIds.value],
        category: batchCategoryValue.value,
        ...action,
      });
      message.success(`已更新 ${count} 条分类 · 审计 ${String(res.data?.auditId || '').slice(0, 8)}`);
      selectedIds.value = [];
    } else {
      const archivedIds = [...selectedIds.value];
      const res = await apiBasePost('/api/knowledgeBase/batchDelete', { ids: archivedIds, ...action });
      message.success(`已归档 ${archivedIds.length} 条 · 审计 ${String(res.data?.auditId || '').slice(0, 8)}`);
      listItems.value = listItems.value.filter((item) => !archivedIds.includes(String(item.id)));
      if (archivedIds.includes(currentId.value)) {
        currentId.value = '';
        currentItem.value = null;
        syncArticleRoute('', true);
      }
      selectedIds.value = [];
    }
    riskVisible.value = false;
    await loadList();
  } finally {
    saving.value = false;
  }
}

// Highlight
function highlightText(text: string, keyword: string): string {
  const escapedText = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  if (!keyword?.trim() || !escapedText) return escapedText;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return escapedText.replace(regex, '<mark class="kb-highlight">$1</mark>');
}

onMounted(() => {
  loadList();
  loadCategories();
});

watch(
  () => route.query.article,
  () => void openArticleFromRoute(),
);
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
  min-width: 0;
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
.kb-list-item:hover,
.kb-list-item.active {
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
.kb-help-section-label {
  color: var(--resource-bookmark-color);
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
.kb-meta-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
/* 去掉 BSelect 的外边框 */
:deep(.kb-meta-select .select-trigger) {
  border: none;
  background: var(--bl-input-noBorder-bg-color);
  border-radius: 6px;
  height: 28px;
}
/* 分类输入框 */
.kb-category-input {
  width: 120px !important;
}
.kb-help-section-input {
  width: 150px !important;
}
.kb-category-input .input-container {
  height: 28px !important;
  min-width: 0 !important;
}
.kb-help-section-input .input-container {
  height: 28px !important;
  min-width: 0 !important;
}
:deep(.kb-filter-select .select-trigger) {
  border: none;
  background: var(--bl-input-noBorder-bg-color);
  border-radius: 6px;
  height: 32px;
}
.kb-meta-select {
  min-width: 110px;
  vertical-align: middle;
}
.kb-filter-select {
  flex: 1;
  min-width: 0;
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
/* Search results (inside right panel) */
.kb-search-results {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
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
  gap: 10px;
  padding: 10px 14px;
  border-radius: 6px;
  border: 1px solid var(--card-border-color);
  margin-bottom: 6px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
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
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 2px;
}
.kb-search-card-meta {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}
.kb-search-card-snippet {
  font-size: 12px;
  color: var(--desc-color);
  line-height: 1.6;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
mark.kb-highlight {
  background: color-mix(in srgb, #facc15 72%, transparent);
  color: #171717;
  padding: 1px 2px;
  border-radius: 2px;
}

.kb-batch-category-select {
  width: 100%;
}

.kb-empty {
  text-align: center;
  padding: 20px;
  color: var(--desc-color);
  font-size: 13px;
}
.kb-search-hint {
  text-align: center;
  padding: 30px 10px;
  color: var(--desc-color);
  font-size: 13px;
  line-height: 1.6;
}
</style>
