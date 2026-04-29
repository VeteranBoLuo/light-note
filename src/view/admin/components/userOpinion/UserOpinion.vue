<template>
  <div class="admin-panel-container">
    <section class="admin-panel user-opinion__panel">
      <header class="admin-header user-opinion__header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / Feedback</p>
          <h2 class="admin-title">用户反馈</h2>
          <p class="admin-subtitle">处理用户反馈、维护回复状态，并跟踪已查看进度。</p>
        </div>
      </header>

      <ul class="admin-stats">
        <li v-for="card in statCards" :key="card.label" class="admin-stat-card">
          <span class="admin-stat-label">{{ card.label }}</span>
          <strong class="admin-stat-value">{{ card.value }}</strong>
          <span class="admin-stat-hint">{{ card.hint }}</span>
        </li>
      </ul>

      <div class="admin-filters">
        <div class="admin-filters-main">
          <b-input
            v-model:value="searchValue"
            placeholder="用户、联系方式、反馈内容..."
            class="log-search-input"
            @input="handleSearch"
          >
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
          <a-select
            v-model:value="statusFilter"
            class="user-opinion__status-filter"
            :options="statusOptions"
            @change="searchOpinionList"
          />
        </div>
        <span class="admin-filters-hint">支持内容检索和状态筛选，回复后用户会收到未读提醒。</span>
      </div>

      <div class="admin-table-card">
        <a-table
          :data-source="opinionList"
          :columns="columns"
          row-key="id"
          :scroll="{ y: bookmark.screenHeight - 430 }"
          :pagination="false"
        >
          <template #expandedRowRender="{ record }">
            <div class="opinion-detail">
              <div class="opinion-detail__grid">
                <div>
                  <label>反馈内容</label>
                  <p>{{ record.content }}</p>
                </div>
                <div>
                  <label>提交时间</label>
                  <p>{{ record.createTime }}</p>
                </div>
                <div>
                  <label>联系方式</label>
                  <p>{{ record.phone || '-' }}</p>
                </div>
                <div>
                  <label>查看状态</label>
                  <p>{{ viewStatusText(record) }}</p>
                </div>
              </div>

              <div>
                <label>反馈图片</label>
                <div class="opinion-detail__images" v-if="parseImgArray(record.imgArray).length > 0">
                  <img
                    v-for="(src, index) in parseImgArray(record.imgArray)"
                    :key="`${src}-${index}`"
                    :src="src"
                    alt=""
                    @click="bookmark.refreshViewer(src)"
                  />
                </div>
                <p v-else>-</p>
              </div>

              <div class="opinion-reply-editor">
                <div class="opinion-reply-editor__header">
                  <label>管理员回复</label>
                  <b-button
                    type="primary"
                    @click="submitReply(record)"
                    >保存回复</b-button
                  >
                </div>
                <a-textarea
                  v-model:value="replyDrafts[record.id]"
                  :rows="3"
                  :placeholder="record.replyContent || '请输入回复内容，回复后该条反馈会切换为已回复状态'"
                />
                <div class="opinion-reply-editor__footer">
                  <span v-if="record.replyTime" class="opinion-reply-editor__time">
                    上次回复时间：{{ record.replyTime }}
                  </span>
                </div>
              </div>
            </div>
          </template>

          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'status'">
              <span class="user-opinion__status-tag" :class="`user-opinion__status-tag--${record.status || 'pending'}`">
                {{ statusMeta(record.status).label }}
              </span>
            </template>
            <template v-else-if="column.dataIndex === 'operation'">
              <div class="user-opinion__operation">
                <svg-icon
                  title="删除"
                  :src="icon.table_delete"
                  size="16"
                  @click="delOpinion(record)"
                  class="dom-hover"
                />
              </div>
            </template>
          </template>
        </a-table>
      </div>

      <footer class="admin-footer">
        <a-pagination
          :current="currentPage"
          :page-size="pageSize"
          show-size-changer
          size="small"
          :total="total"
          @change="onChange"
        >
          <template #buildOptionText="props">
            <span>{{ props.value }}条/页</span>
          </template>
        </a-pagination>
      </footer>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, reactive, ref } from 'vue';
  import { useRoute } from 'vue-router';
  import opinionApi from '@/api/opinionApi.ts';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { message } from 'ant-design-vue';

  const route = useRoute();
  const bookmark = bookmarkStore();
  const opinionList = ref<any[]>([]);
  const replyDrafts = reactive<Record<string, string>>({});

  const columns = computed(() => [
    { title: '用户', dataIndex: 'alias', ellipsis: true },
    { title: '联系方式', dataIndex: 'phone', ellipsis: true },
    { title: '反馈类型', dataIndex: 'type', ellipsis: true },
    { title: '状态', dataIndex: 'status', ellipsis: true, width: 120 },
    { title: '反馈时间', dataIndex: 'createTime', ellipsis: true, width: 180 },
    { title: '回复时间', dataIndex: 'replyTime', ellipsis: true, width: 180 },
    { title: '操作', dataIndex: 'operation', ellipsis: true, width: 90 },
  ]);

  const currentPage = ref<number>(1);
  const pageSize = ref<number>(10);
  const total = ref(0);
  const searchValue = ref('');
  const statusFilter = ref((route.query.status as string) || 'all');
  const summary = ref<any>({});
  const timer = ref();

  const statusOptions = [
    { label: '全部状态', value: 'all' },
    { label: '待回复', value: 'pending' },
    { label: '已回复', value: 'replied' },
    { label: '已查看', value: 'viewed' },
  ];

  const statCards = computed(() => [
    {
      label: '待回复',
      value: summary.value.pendingTotal || 0,
      hint: '优先处理',
    },
    {
      label: '已回复',
      value: summary.value.repliedTotal || 0,
      hint: '待用户查看',
    },
    {
      label: '已查看',
      value: summary.value.viewedTotal || 0,
      hint: '已完成',
    },
  ]);

  function statusMeta(status: string) {
    const meta = {
      pending: { label: '待回复' },
      replied: { label: '已回复' },
      viewed: { label: '已查看' },
    };
    return meta[status] || meta.pending;
  }

  function viewStatusText(record) {
    if (record.status === 'viewed') {
      return '用户已查看';
    }
    if (record.status === 'replied') {
      return '待用户查看';
    }
    return '-';
  }

  function parseImgArray(value: string | string[]) {
    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  const onChange = (page: number, newPageSize: number) => {
    currentPage.value = newPageSize !== pageSize.value ? 1 : page;
    pageSize.value = newPageSize;
    searchOpinionList();
  };

  function handleSearch() {
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      currentPage.value = 1;
      searchOpinionList();
    }, 400);
  }

  async function searchOpinionList() {
    const res = await opinionApi.getOpinionList({
      currentPage: currentPage.value,
      pageSize: pageSize.value,
      filters: {
        key: searchValue.value,
        status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      },
    });
    if (res.status === 200) {
      opinionList.value = res.data.items || [];
      total.value = res.data.total || 0;
      summary.value = res.data.summary || {};
      opinionList.value.forEach((item) => {
        replyDrafts[item.id] = item.replyContent || '';
      });
    }
  }

  async function submitReply(record) {
    const replyContent = (replyDrafts[record.id] || '').trim();
    if (!replyContent) {
      message.warning('请输入回复内容');
      return;
    }
    const res = await opinionApi.replyOpinion({
      id: record.id,
      replyContent,
    });
    if (res.status === 200) {
      message.success('回复已保存');
      searchOpinionList();
    }
  }

  function delOpinion(record) {
    Alert.alert({
      title: '提示',
      content: '请确认是否要删除这条用户反馈？',
      onOk() {
        opinionApi.deleteOpinion({ id: record.id }).then((res) => {
          if (res.status === 200) {
            message.success('删除成功');
            searchOpinionList();
          }
        });
      },
    });
  }

  onMounted(() => {
    searchOpinionList();
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';

  .log-search-input {
    flex: 1;
  }

  .user-opinion__status-filter {
    width: 160px;
  }

  .user-opinion__filters-hint,
  .opinion-reply-editor__time {
    font-size: 12px;
    color: var(--sub-text-color, #7c8b9e);
  }

  .user-opinion__operation {
    display: flex;
    justify-content: center;
  }

  .user-opinion__status-tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 58px;
    padding: 2px 10px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: 12px;
    line-height: 20px;
    background: var(--background-color);
  }

  .user-opinion__status-tag--pending {
    color: #b36b00;
    background: rgba(255, 184, 77, 0.12);
    border-color: rgba(255, 184, 77, 0.3);
  }

  .user-opinion__status-tag--replied {
    color: #2f6fed;
    background: rgba(47, 111, 237, 0.14);
    border-color: rgba(47, 111, 237, 0.3);
  }

  .user-opinion__status-tag--viewed {
    color: #1f8f55;
    background: rgba(31, 143, 85, 0.14);
    border-color: rgba(31, 143, 85, 0.3);
  }

  .opinion-detail {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 32px;
  }

  .opinion-detail__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 20px;
  }

  .opinion-detail label {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    color: var(--sub-text-color, #7c8b9e);
  }

  .opinion-detail p {
    margin: 0;
    white-space: pre-wrap;
    color: var(--text-color);
  }

  .opinion-detail__images {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .opinion-detail__images img {
    width: 88px;
    height: 88px;
    object-fit: cover;
    border-radius: 12px;
    cursor: pointer;
  }

  .opinion-reply-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .opinion-reply-editor__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .opinion-reply-editor__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    padding-bottom: 20px;
  }

  :deep(.ant-table-expanded-row-fixed) {
    width: 100% !important;
    max-width: none !important;
  }

  :deep(.ant-table-expanded-row > td) {
    padding-bottom: 28px !important;
  }

  :deep(.ant-table-body) {
    padding-bottom: 16px;
  }

  @media (max-width: 960px) {
    .user-opinion__status-filter {
      width: 100%;
    }

    .opinion-detail__grid {
      grid-template-columns: 1fr;
    }

    .opinion-reply-editor__footer {
      align-items: stretch;
      flex-direction: column;
    }

    .opinion-reply-editor__header {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
