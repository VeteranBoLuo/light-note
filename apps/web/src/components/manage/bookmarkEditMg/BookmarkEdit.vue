<template>
  <div class="tag-edit-container">
    <b-loading :loading="loading">
      <div class="tag-edit-body">
        <div class="tag-attr-item">
          <span class="tag-attr-label">{{ $t('bookmarkMg.bookmarkName') }}</span>
          <b-input v-model:value="bookmarkData.name" />
        </div>
        <div class="tag-attr-item" data-guide="bookmark-url">
          <div class="tag-attr-head">
            <span class="tag-attr-label">{{ $t('bookmarkMg.bookmarkUrl') }}</span>
            <div class="tag-attr-actions">
              <BTooltip :title="$t('bookmarkMg.generateMetaDesc')">
                <button
                  type="button"
                  class="generate-meta-action"
                  @click="generateBookmarkMeta"
                  :class="{ loading: generating }"
                  v-click-log="{ module: '书签详情', operation: '点击智能生成' }"
                >
                  <svg-icon :src="icon.common.magicWand" :title="$t('bookmarkMg.generateMetaTitle')" />
                  <span>{{ $t('bookmarkMg.generateMetaTitle') }}</span>
                </button>
              </BTooltip>
              <button v-if="isEdit" type="button" class="generate-meta-action" @click="snapVisible = true" v-click-log="{ module: '书签详情', operation: '查看网页快照' }">
                <span>📸 {{ $t('bookmarkMg.snapshot') }}</span>
              </button>
            </div>
          </div>
          <b-input v-model:value="bookmarkData.url"> </b-input>
        </div>
        <div class="tag-attr-item" data-guide="bookmark-tags">
          <span class="tag-attr-label">{{ $t('bookmarkMg.relatedTag') }}</span>
          <b-select
            mode="multiple"
            :max-tag-count="3"
            :options="tagOptions"
            :placeholder="$t('placeholder.selectPlaceholder')"
            :show-search="true"
            :filter-option="SelectionSearch"
            v-model:value="bookmarkData.relatedTags"
          >
            <template #dropdown-footer>
              <div
                class="add-tag-entry"
                @click="goAddTag"
                v-click-log="{ module: '书签详情', operation: '下拉里新增标签' }"
              >
                <span class="add-tag-plus">+</span>
                <span>{{ $t('navigation.newTag') }}</span>
              </div>
            </template>
          </b-select>
        </div>
        <div class="tag-attr-item">
          <span class="tag-attr-label">{{ $t('bookmarkMg.description') }}</span>
          <b-input v-model:value="bookmarkData.description" />
        </div>
        <div v-if="handleType === 'add'" class="tag-attr-item">
          <label class="snapshot-opt">
            <input type="checkbox" v-model="saveSnapshot" />
            <span class="tag-attr-label" style="margin: 0">{{ $t('bookmarkMg.saveSnapshotOpt') }}</span>
          </label>
          <span class="snapshot-opt-desc">{{ $t('bookmarkMg.saveSnapshotOptDesc') }}</span>
        </div>
      </div>
    </b-loading>
    <b-space class="edit-tag-footer">
      <b-button type="primary" data-guide="bookmark-save" :loading="completingInbox" @click="submit">
        {{ isOrganizingFromInbox ? $t('inbox.saveAndComplete') : $t('common.confirm') }}
      </b-button>
      <b-button @click="$router.back()">返回</b-button>
    </b-space>
    <BookmarkSnapshotModal v-model:visible="snapVisible" :bookmark-id="bookmarkId" />
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { useRouter } from 'vue-router';
  import { bookmarkStore, useUserStore } from '@/store';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { SelectionSearch } from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { recordOperation } from '@/api/commonApi.ts';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BookmarkSnapshotModal from '@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue';
  import { useBookmarkMeta } from '@/composables/useBookmarkMeta';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useInboxOrganizer } from '@/composables/useInboxOrganizer';
  import { useI18n } from 'vue-i18n';

  const bookmark = bookmarkStore();
  const user = useUserStore();
  const { t } = useI18n();
  const { isOrganizingFromInbox, completingInbox, completeInboxResource } = useInboxOrganizer();

  const bookmarkData = ref<any>({
    id: '',
    name: '',
    iconUrl: '',
    description: '',
    createTime: '',
    relatedTags: [],
  });

  getTagSelect();

  const tagOptions = ref([]);

  async function getTagSelect() {
    const res = await apiQueryPost('/api/bookmark/queryTagList', {
      filters: {
        userId: user.id,
      },
    });
    if (res.status === 200) {
      bookmark.tagList = res.data;
      tagOptions.value = [];
      res.data.forEach((tag) => {
        if (tag.id !== router.currentRoute.value.params.id) {
          tagOptions.value.push({
            label: tag.name,
            value: tag.id,
          });
        }
      });
      return tagOptions.value;
    }
    return [];
  }

  async function submit() {
    // 游客:即时拦截 + 上下文邀请文案(不发无效请求);后端 addBookmark 仍有 ensureNotVisitor 兜底
    if (
      blockGuestWrite(
        'add-bookmark',
        '把整理好的书签存进你自己的轻笺？注册即用、自动登录,免费收藏书签、记笔记、存文件。',
      )
    )
      return;
    if (loading.value) {
      message.warning('请等待数据请求完毕');
      return;
    }
    if (!bookmarkData.value.name || !bookmarkData.value.name.trim()) {
      message.warning('请输入书签名称');
      return;
    }
    if (!bookmarkData.value.url || !bookmarkData.value.url.trim()) {
      message.warning('请输入书签地址');
      return;
    }

    let params = JSON.parse(JSON.stringify(bookmarkData.value));
    let url = '/api/bookmark/updateBookmark';
    if (handleType.value === 'add') {
      url = '/api/bookmark/addBookmark';
      params.userId = user.id;
      params.saveSnapshot = saveSnapshot.value; // 仅新增时带上;仅当勾选才存快照
    } else {
      params.iconUrl = null;
    }
    const res = await apiBasePost(url, params);
    if (res.status !== 200) return;
    recordOperation({
      module: '书签详情',
      operation: `${handleType.value === 'add' ? '新增' : '保存'}书签成功【${bookmarkData.value.name || params.url}】`,
    });
    if (isOrganizingFromInbox.value && handleType.value === 'edit') {
      const completed = await completeInboxResource('bookmark', bookmarkData.value.id || bookmarkId.value);
      if (!completed) {
        message.warning(t('inbox.completeFailed'));
        return;
      }
      message.success(t('inbox.saveAndCompleteSuccess'));
      router.push('/inbox');
      return;
    }
    message.success(t('common.saveSuccess'));
    router.back();
  }

  // 下拉里「新增标签」:跳转到新增标签页(注:会离开当前书签编辑页)
  function goAddTag() {
    router.push('/manage/editTag/add');
  }

  const { generating, generateBookmarkMeta } = useBookmarkMeta({
    bookmarkData,
    tagOptions,
    refreshTags: getTagSelect,
  });

  const handleType = computed(() => {
    if (router.currentRoute.value.params.id === 'add' || router.currentRoute.value.params.tagId) {
      return 'add';
    }
    return 'edit';
  });

  const router = useRouter();

  // 网页快照(防死链):仅编辑已有书签时可查看/归档(新增页 id==='add')
  const snapVisible = ref(false);
  const bookmarkId = computed(() => String(router.currentRoute.value.params?.id || ''));
  const isEdit = computed(() => !!bookmarkId.value && bookmarkId.value !== 'add');
  const saveSnapshot = ref(true); // 新增书签时是否存网页快照(默认开,防死链)
  const loading = ref(false);
  onMounted(async () => {
    if (handleType.value === 'add') {
      if (router.currentRoute.value.params.tagId) {
        bookmarkData.value.relatedTags = [router.currentRoute.value.params.tagId];
      }
      return;
    }
    loading.value = true;
    // 创建两个Promise，分别对应两个API调用
    const res = await apiQueryPost('/api/bookmark/getBookmarkDetail', {
      filters: {
        id: router.currentRoute.value.params?.id,
      },
    });
    bookmarkData.value = res.data;
    const tagRes = await apiQueryPost('/api/bookmark/getRelatedTag', {
      filters: {
        userId: user.id,
        id: router.currentRoute.value.params?.id,
        type: 'bookmark',
      },
    });
    bookmarkData.value.relatedTags = tagRes.data.map((data) => data.id);
    loading.value = false;
  });
</script>

<style lang="less" scoped>
  .tag-edit-container {
    height: 100%;
    width: 100%;
    padding-top: 20px;
    box-sizing: border-box;
  }

  .tag-edit-body {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .tag-attr-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 50%;
  }

  .tag-attr-label {
    white-space: nowrap;
  }

  .snapshot-opt {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .snapshot-opt input {
    width: 15px;
    height: 15px;
    cursor: pointer;
    accent-color: var(--primary-color);
  }
  .snapshot-opt-desc {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--desc-color);
  }

  .tag-attr-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .tag-attr-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .edit-tag-footer {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
  }

  :deep(.ant-transfer-list-header) {
    background-color: var(--background-color);
    color: var(--text-color);
  }

  :deep(.ant-input) {
    background-color: var(--background-color);
    color: var(--text-color);
    transition: none;
  }

  //:deep(.ant-select-selector) {
  //  transition: none !important;
  //}

  :deep(.ant-input-affix-wrapper) {
    transition: none;
  }

  :deep(.ant-transfer-list-search) {
    background-color: var(--background-color);
  }

  :deep(.anticon-search) {
    color: var(--text-color) !important;
  }

  :deep(.ant-btn-primary) {
    box-shadow: none;
  }

  :deep(.ant-transfer-list-content-item-text) {
    color: var(--text-color) !important;
  }

  :deep(.ant-spin-container::after) {
    background-color: unset;
  }
  :deep(.ant-btn-icon-only) {
    color: #ccc;
  }
  .generate-meta-action {
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 999px;
    transition:
      background-color 0.3s,
      color 0.3s,
      border-color 0.3s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--primary-color) 24%, var(--card-border-color));
    font-size: 12px;
    line-height: 1;
    &:hover {
      background-color: var(--bl-input-noBorder-hover-bg-color);
    }
    &.loading {
      animation: multiColorFade 2s ease-in-out infinite;
    }
  }
  @keyframes multiColorFade {
    0% {
      color: var(--text-color);
    }
    20% {
      color: var(--primary-color);
    }
    40% {
      color: #ff6b6b;
    }
    60% {
      color: #4ecdc4;
    }
    80% {
      color: var(--primary-color);
    }
    100% {
      color: var(--text-color);
    }
  }
  @media (max-width: 1300px) {
    .tag-attr-item {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 90%;
    }

    .tag-attr-head {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }

    :deep(.ant-checkbox-group) {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    }

    :deep(.ant-checkbox-group-item) {
      color: var(--text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  /* 下拉底部「新增标签」入口:样式对齐选项行,主色强调 */
  .add-tag-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 12px;
    border-radius: 4px;
    font-size: 14px;
    color: var(--primary-color);
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
  }
  .add-tag-plus {
    font-size: 16px;
    line-height: 1;
    font-weight: 600;
  }
</style>
