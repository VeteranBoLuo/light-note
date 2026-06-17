<template>
  <CommonContainer title="用户反馈" @backClick="router.push('/admin')">
    <div class="p-user-opinion">
      <div class="p-user-opinion__filters">
        <b-input v-model:value="searchValue" placeholder="搜索反馈内容或联系方式" @input="handleSearch">
          <template #prefix>
            <svg-icon :src="icon.navigation.search" size="16" />
          </template>
        </b-input>
        <BSelect v-model:value="statusFilter" :options="statusOptions" @change="searchOpinionList" />
      </div>

      <div class="p-user-opinion__list">
        <article v-for="record in opinionList" :key="record.id" class="p-user-opinion__card">
          <div class="p-user-opinion__head">
            <div>
              <strong>{{ record.alias || '未命名用户' }}</strong>
              <div class="p-user-opinion__meta">{{ record.type }} · {{ record.createTime }}</div>
            </div>
            <span class="p-user-opinion__status-tag" :class="`p-user-opinion__status-tag--${record.status || 'pending'}`">
              {{ statusMeta(record.status).label }}
            </span>
          </div>

          <div class="p-user-opinion__section">
            <label>反馈内容</label>
            <p>{{ record.content }}</p>
          </div>

          <div class="p-user-opinion__section">
            <label>联系方式</label>
            <p>{{ record.phone || '-' }}</p>
          </div>

          <div class="p-user-opinion__section" v-if="parseImgArray(record.imgArray).length > 0">
            <label>反馈图片</label>
            <div class="p-user-opinion__images">
              <img
                v-for="(src, index) in parseImgArray(record.imgArray)"
                :key="`${src}-${index}`"
                :src="src"
                alt=""
                @click="bookmark.refreshViewer(src)"
              />
            </div>
          </div>

          <div class="p-user-opinion__section">
            <label>管理员回复</label>
            <a-textarea
              v-model:value="replyDrafts[record.id]"
              :rows="3"
              :placeholder="record.replyContent || '请输入回复内容'"
            />
          </div>

          <div class="p-user-opinion__actions">
            <span class="p-user-opinion__meta" v-if="record.replyTime">上次回复：{{ record.replyTime }}</span>
            <div class="p-user-opinion__buttons">
              <b-button @click="delOpinion(record)">删除</b-button>
              <b-button type="primary" @click="submitReply(record)">保存回复</b-button>
            </div>
          </div>
        </article>
      </div>

      <BPagination
        :current="currentPage"
        :page-size="pageSize"
        :total="total"
        @page-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>
  </CommonContainer>
</template>

<script setup lang="ts">
  import { onMounted, reactive, ref } from 'vue';
  import opinionApi from '@/api/opinionApi.ts';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import router from '@/router';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { useRoute } from 'vue-router';

  const route = useRoute();
  const bookmark = bookmarkStore();
  const opinionList = ref<any[]>([]);
  const replyDrafts = reactive<Record<string, string>>({});
  const currentPage = ref<number>(1);
  const pageSize = ref<number>(10);
  const total = ref(0);
  const searchValue = ref('');
  const statusFilter = ref((route.query.status as string) || 'all');
  const timer = ref();

  const statusOptions = [
    { label: '全部状态', value: 'all' },
    { label: '待回复', value: 'pending' },
    { label: '已回复', value: 'replied' },
    { label: '已查看', value: 'viewed' },
  ];

  function statusMeta(status: string) {
    const meta = {
      pending: { label: '待回复' },
      replied: { label: '已回复' },
      viewed: { label: '已查看' },
    };
    return meta[status] || meta.pending;
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

  function handleSearch() {
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      currentPage.value = 1;
      searchOpinionList();
    }, 400);
  }

  const onPageChange = (page: number) => {
    currentPage.value = page;
    searchOpinionList();
  };
  const onSizeChange = (newPageSize: number) => {
    pageSize.value = newPageSize;
    currentPage.value = 1;
    searchOpinionList();
  };

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
  .p-user-opinion {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .p-user-opinion__filters {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .p-user-opinion__list {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .p-user-opinion__card {
    padding: 14px;
    border-radius: 14px;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .p-user-opinion__head,
  .p-user-opinion__actions,
  .p-user-opinion__buttons {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .p-user-opinion__meta,
  .p-user-opinion__section label {
    font-size: 12px;
    color: var(--sub-text-color);
  }

  .p-user-opinion__status-tag {
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

  .p-user-opinion__status-tag--pending {
    color: #b36b00;
    background: rgba(255, 184, 77, 0.12);
    border-color: rgba(255, 184, 77, 0.3);
  }

  .p-user-opinion__status-tag--replied {
    color: #2f6fed;
    background: rgba(47, 111, 237, 0.14);
    border-color: rgba(47, 111, 237, 0.3);
  }

  .p-user-opinion__status-tag--viewed {
    color: #1f8f55;
    background: rgba(31, 143, 85, 0.14);
    border-color: rgba(31, 143, 85, 0.3);
  }

  .p-user-opinion__section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .p-user-opinion__section p {
    margin: 0;
    white-space: pre-wrap;
  }

  .p-user-opinion__images {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .p-user-opinion__images img {
    width: 72px;
    height: 72px;
    object-fit: cover;
    border-radius: 10px;
  }
</style>
