<template>
  <div class="admin-panel-container">
    <section class="admin-panel attack-log__panel">
      <header class="admin-header attack-log__header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / Security</p>
          <h2 class="admin-title">攻击日志</h2>
          <p class="admin-subtitle">监控和记录系统安全威胁</p>
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
            placeholder="攻击类型或来源IP地址..."
            class="log-search-input"
            @input="handleSearch"
          >
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
          </b-input>
          <b-button @click="clearAttackLogs" type="primary">清空日志</b-button>
        </div>
        <span class="admin-filters-hint">支持模糊匹配 · 回车或停止输入 0.5s 自动查询</span>
      </div>

      <div class="admin-table-card">
        <a-table :data-source="logList" :columns="logColumns" row-key="id" :scroll="{ y: 400 }" :pagination="false">
          <template #expandedRowRender="{ record }">
            <div class="admin-expand-panel">
              <div>攻击类型：{{ record.attackType }}</div>
              <div>攻击时间：{{ record.createdAt }}</div>
              <div>攻击者userAgent：{{ record.userAgent }}</div>
              <div>请求方法：{{ record.requestMethod }}</div>
              <div>请求地址：{{ record.requestPath }}</div>
              <div>
                攻击载荷：
                <pre>{{ record.payload }}</pre>
              </div>
              <div>来源IP地址：{{ record?.sourceIp }}</div>
            </div>
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
  import { apiBaseGet, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { message } from 'ant-design-vue';
  const bookmark = bookmarkStore();
  const logList = ref([]);

  const logColumns = computed(() => {
    return [
      {
        title: '攻击类型',
        dataIndex: 'attackType',
        ellipsis: true,
      },
      {
        title: '来源IP地址',
        dataIndex: 'sourceIp',
        ellipsis: true,
      },
      {
        title: '请求地址',
        dataIndex: 'requestPath',
        ellipsis: true,
      },
      {
        title: '攻击载荷',
        dataIndex: 'payload',
        ellipsis: true,
      },
      {
        title: '攻击时间',
        dataIndex: 'createdAt',
        ellipsis: true,
      },
    ];
  });

  const total = ref(0);
  const currentPage = ref<number>(1);
  const pageSize = ref<number>(10);
  const searchValue = ref('');

  const onChange = (page: number, newPageSize: number) => {
    if (newPageSize !== pageSize.value) {
      currentPage.value = 1;
    } else {
      currentPage.value = page;
    }
    pageSize.value = newPageSize;
    searchApiLog();
  };

  function clearAttackLogs() {
    Alert.alert({
      title: '提示',
      content: `请确认是否要清空攻击日志？`,
      onOk() {
        apiBaseGet('/api/common/clearAttackLogs', {}).then((res) => {
          if (res.status === 200) {
            message.success('攻击日志清空成功');
            searchApiLog();
          }
        });
      },
    });
  }

  const timer = ref();
  function handleSearch() {
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      searchApiLog();
    }, 500);
  }

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
        label: '总攻击记录',
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
    apiQueryPost('/api/common/getAttackLogs', {
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
  onMounted(() => {
    searchApiLog();
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';

  .log-search-input {
    flex: 1;
  }

  @media (max-width: 960px) {
  }
</style>
