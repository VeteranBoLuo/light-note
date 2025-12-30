<template>
  <div class="admin-panel-container">
    <section class="admin-panel user-opinion__panel">
      <header class="admin-header user-opinion__header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / Feedback</p>
          <h2 class="admin-title">用户反馈</h2>
          <p class="admin-subtitle">收集和管理系统用户意见</p>
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
            placeholder="用户名或接口名..."
            class="log-search-input"
            @input="handleSearch"
          >
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
        </div>
        <span class="admin-filters-hint">支持模糊匹配 · 回车或停止输入 0.5s 自动查询</span>
      </div>

      <div class="admin-table-card">
        <a-table :data-source="logList" :columns="logColumns" row-key="id" :scroll="{ y: 500 }" :pagination="false">
          <template #expandedRowRender="{ record }">
            <div class="admin-expand-panel">
              <p>反馈内容：{{ record.content }}</p>
              <p>反馈时间：{{ record.createTime }}</p>
              反馈图片：
              <div class="flex-align-center-gap">
                <img
                  v-for="src in JSON.parse(record.imgArray)"
                  :src="src"
                  height="100"
                  width="100"
                  @click="bookmark.refreshViewer(src)"
                  alt=""
                />
              </div>
            </div>
          </template>
          <template #bodyCell="{ column, text, record }">
            <template v-if="column.dataIndex === 'operation'">
              <svg-icon title="删除" :src="icon.table_delete" size="16" @click="delOpinion(record)" class="dom-hover" />
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
  import { computed, onMounted, ref } from 'vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import userApi from '@/api/userApi.ts';
  import { message } from 'ant-design-vue';

  const bookmark = bookmarkStore();
  const logList = ref([]);

  const logColumns = computed(() => {
    return [
      {
        title: '邮箱',
        dataIndex: 'email',
        ellipsis: true,
      },
      {
        title: '反馈内容',
        dataIndex: 'content',
        ellipsis: true,
      },
      {
        title: '反馈类型',
        dataIndex: 'type',
        ellipsis: true,
      },
      {
        title: '反馈时间',
        dataIndex: 'createTime',
        ellipsis: true,
      },
      {
        title: '操作',
        dataIndex: 'operation',
        ellipsis: true,
      },
    ];
  });

  const currentPage = ref<number>(1);
  const pageSize = ref<number>(10);
  const onChange = (page: number, newPageSize: number) => {
    if (newPageSize !== pageSize.value) {
      currentPage.value = 1;
    } else {
      currentPage.value = page;
    }
    pageSize.value = newPageSize;
    searchApiLog();
  };

  const timer = ref();

  function handleSearch() {
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      searchApiLog();
    }, 500);
  }

  const total = ref(0);
  const searchValue = ref('');
  const statCards = computed(() => {
    const totalValue = total.value || 0;
    const hasData = totalValue > 0;
    const start = hasData ? (currentPage.value - 1) * pageSize.value + 1 : 0;
    const end = hasData ? Math.min(totalValue, currentPage.value * pageSize.value) : 0;
    return [
      {
        label: '当前展示区间',
        value: `${start}-${end}`,
        hint: '条记录',
      },
      {
        label: '总反馈数',
        value: totalValue,
        hint: '累计',
      },
      {
        label: '分页尺寸',
        value: pageSize.value,
        hint: '条/页',
      },
    ];
  });

  function searchApiLog() {
    apiQueryPost('/api/opinion/getOpinionList', {
      currentPage: currentPage.value,
      pageSize: pageSize.value,
      filters: {
        key: searchValue.value,
      },
    }).then((res) => {
      if (res.status === 200) {
        logList.value = res.data.items;
        total.value = res.data.total;
      }
    });
  }

  const delOpinion = (record) => {
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除此用反馈？`,
      onOk() {
        apiBasePost('/api/opinion/delOpinion', {
          id: record.id,
        }).then((res) => {
          if (res.status === 200) {
            message.success('删除成功');
            searchApiLog();
          }
        });
      },
    });
  };

  onMounted(() => {
    searchApiLog();
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';

  .log-search-input {
    flex: 1;
  }

  .user-opinion__filters-hint {
    font-size: 12px;
    color: var(--sub-text-color, #7c8b9e);
  }

  @media (max-width: 960px) {
    .user-opinion__filters-main {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
