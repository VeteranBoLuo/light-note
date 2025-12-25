<template>
  <div class="simple-sql">
    <div class="sql-main">
      <section class="editor-stack glass-card">
        <div class="console-header">
          <div class="console-title">
            <h3>SQL 控制台</h3>
            <small>轻笺数据运维工具</small>
          </div>
          <div class="sql-header-actions">
            <b-button class="ghost-btn" @click="clearSql">清空</b-button>
            <b-button class="primary-btn" @click="runSql">运行</b-button>
          </div>
          <span class="status-pill" :class="executionState">{{ statusCopy }}</span>
        </div>
        <div class="sql-editor-shell">
          <div class="editor-meta-row">
            <span
              >当前表：<strong>{{ selectedTable || '未选择' }}</strong></span
            >
            <span>点击表名选中，再次点击插入编辑器</span>
          </div>
          <BInput
            class="sql-input"
            type="textarea"
            v-model:value="sql"
            :rows="18"
            placeholder="SELECT * FROM user WHERE id = ?;"
          />
          <div class="editor-meta">
            <span>字符数：{{ sql.length }}</span>
            <span>最后执行：{{ lastExecutedAt || '——' }}</span>
          </div>
        </div>
      </section>

      <aside class="assistant-panel">
        <div class="helper-card glass-card quick-statements">
          <div class="panel-header">
            <h3>快捷语句</h3>
            <small>常用维护操作</small>
          </div>
          <div class="chip-grid two-col">
            <button
              v-for="item in sqlOptions"
              :key="item.label"
              type="button"
              class="chip"
              @click="appendSql(item.value)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>

        <div class="helper-card glass-card">
          <div class="panel-header">
            <h3>关键词</h3>
            <small>常用 SQL 片段</small>
          </div>
          <div class="chip-grid four-col">
            <button v-for="item in keyWords" :key="item" type="button" class="chip" @click="appendSql(item)">
              {{ item }}
            </button>
          </div>
        </div>

        <div class="helper-card glass-card">
          <div class="panel-header">
            <h3>数据表</h3>
            <small>{{ filteredTables.length }} / {{ tables.length }}</small>
          </div>
          <div class="table-filter">
            <b-input v-model:value="tableFilter" placeholder="输入关键字过滤" class="log-search-input">
              <template #prefix>
                <svg-icon :src="icon.navigation.search" size="16" />
              </template>
            </b-input>
            <span>点击高亮，再次点击自动插入。</span>
          </div>
          <div class="table-grid">
            <button
              v-for="table in filteredTables"
              :key="table"
              type="button"
              class="table-chip"
              :class="{ active: selectedTable === table }"
              @click="handleTableClick(table)"
            >
              {{ table }}
            </button>
          </div>
        </div>

        <div v-if="tableSnippets.length" class="helper-card glass-card table-templates">
          <div class="panel-header">
            <h3>{{ selectedTable }} 模板</h3>
            <small>常用操作</small>
          </div>
          <div class="chip-grid two-col">
            <button
              v-for="item in tableSnippets"
              :key="item.label"
              type="button"
              class="chip"
              @click="appendSql(item.value)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
      </aside>
    </div>

    <section class="result-panel glass-card">
      <div class="panel-header">
        <div>
          <h3>执行结果</h3>
          <small>{{ executionSummary }}</small>
        </div>
        <span class="status-pill" :class="executionState">{{ statusCopy }}</span>
      </div>
      <pre class="result-view">{{ result || '等待执行...' }}</pre>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import icon from '@/config/icon.ts';

  type ExecutionState = 'idle' | 'running' | 'completed' | 'error';

  const sql = ref('');
  const result = ref('');
  const selectedTable = ref('');
  const tableFilter = ref('');
  const executionState = ref<ExecutionState>('idle');
  const lastExecutedAt = ref('');
  const errorSignatures = ['error', 'exception', 'unknown column', 'denied', 'syntax', "doesn't exist", 'duplicate'];

  const tables = [
    'api_logs',
    'attack_logs',
    'bookmark',
    'config_json',
    'files',
    'folders',
    'help_config',
    'note',
    'note_images',
    'operation_logs',
    'opinion',
    'tag',
    'tag_bookmark_relations',
    'tag_relations',
    'user',
  ];

  const sqlOptions = [
    { label: '清空攻击日志', value: 'DELETE FROM attack_logs;' },
    { label: '查询最新操作日志', value: 'SELECT * FROM operation_logs ORDER BY create_by DESC LIMIT 100;' },
    { label: '统计标签数量', value: 'SELECT COUNT(*) AS total_tags FROM tag;' },
    { label: '恢复书签（逻辑删除）', value: 'UPDATE bookmark SET del_flag = 0 WHERE id = ?;' },
  ];

  const keyWords = [
    'SELECT',
    'INSERT INTO',
    'UPDATE',
    'DELETE',
    'WHERE',
    'GROUP BY',
    'ORDER BY',
    'LIMIT',
    'INNER JOIN',
    'LEFT JOIN',
    'COUNT(*)',
    'SUM()',
    'MAX()',
    'MIN()',
    'LIKE',
    'BETWEEN',
  ];

  const tableTemplates = [
    {
      label: '最近 20 条数据',
      build: (table: string) => `SELECT * FROM ${table} ORDER BY create_time DESC LIMIT 20;`,
    },
    {
      label: '统计行数',
      build: (table: string) => `SELECT COUNT(*) AS total FROM ${table};`,
    },
    {
      label: '按 ID 删除',
      build: (table: string) => `DELETE FROM ${table} WHERE id = ?;`,
    },
    {
      label: '按 ID 更新',
      build: (table: string) => `UPDATE ${table} SET column = value WHERE id = ?;`,
    },
    {
      label: '新增一条记录',
      build: (table: string) => `INSERT INTO ${table} (column1, column2) VALUES (value1, value2);`,
    },
  ];

  const filteredTables = computed(() => {
    const keyword = tableFilter.value.trim().toLowerCase();
    if (!keyword) return tables;
    return tables.filter((table) => table.toLowerCase().includes(keyword));
  });

  const tableSnippets = computed(() => {
    if (!selectedTable.value) return [];
    return tableTemplates.map((template) => ({
      label: template.label,
      value: template.build(selectedTable.value),
    }));
  });

  const statusCopy = computed(() => {
    switch (executionState.value) {
      case 'running':
        return '执行中';
      case 'completed':
        return '已完成';
      case 'error':
        return '异常';
      default:
        return '待执行';
    }
  });

  const executionSummary = computed(() => {
    return lastExecutedAt.value ? `最后执行：${lastExecutedAt.value}` : '尚未执行';
  });

  function appendSql(fragment: string) {
    if (!fragment) return;
    const normalized = fragment.trim();
    if (!normalized) return;
    const current = sql.value.trimEnd();
    sql.value = current ? `${current} ${normalized} ` : `${normalized} `;
  }

  function clearSql() {
    sql.value = '';
  }

  function handleTableClick(table: string) {
    if (selectedTable.value === table) {
      appendSql(table);
      return;
    }
    selectedTable.value = table;
  }

  function formatResult(payload: unknown): string {
    if (payload === null || payload === undefined) return '';
    if (typeof payload === 'string') return payload;
    try {
      return JSON.stringify(payload, null, 2);
    } catch (error) {
      return String(payload);
    }
  }

  function detectResultError(payload: unknown): boolean {
    if (!payload) return false;
    if (typeof payload === 'string') {
      const normalized = payload.toLowerCase();
      return errorSignatures.some((tag) => normalized.includes(tag));
    }
    if (typeof payload === 'object') {
      const maybeRecord = payload as Record<string, any>;
      if ('error' in maybeRecord && maybeRecord.error) return true;
      if ('success' in maybeRecord && maybeRecord.success === false) return true;
      if ('code' in maybeRecord && typeof maybeRecord.code === 'string') {
        return maybeRecord.code.toLowerCase().includes('err');
      }
      if ('status' in maybeRecord && typeof maybeRecord.status === 'string') {
        return maybeRecord.status.toLowerCase() === 'error';
      }
    }
    return false;
  }

  async function runSql() {
    if (!sql.value.trim()) {
      result.value = '请先输入 SQL 语句。';
      executionState.value = 'error';
      return;
    }
    executionState.value = 'running';
    result.value = '执行中，请稍候...';

    try {
      const res: any = await apiBasePost('/api/common/runSql', { sql: sql.value });
      const isOk = res?.status === 200;
      const payload = isOk ? res?.data : (res?.msg ?? res);
      const formatted = formatResult(payload);
      const hasError = detectResultError(payload) || !isOk;
      result.value = formatted || '无返回结果';
      executionState.value = hasError ? 'error' : 'completed';
    } catch (error: any) {
      result.value = error?.message || '请求异常';
      executionState.value = 'error';
    } finally {
      lastExecutedAt.value = new Date().toLocaleString();
    }
  }
</script>

<style lang="less" scoped>
  .simple-sql {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    height: 100%;
    padding: 20px;
    box-sizing: border-box;
    color: var(--text-color);
    overflow: hidden;
  }

  .glass-card {
    position: relative;
    overflow: hidden;
    background: color-mix(in srgb, var(--background-color) 92%, transparent);
    border: 1px solid color-mix(in srgb, var(--card-border-color) 60%, transparent);
    border-radius: 20px;
    padding: 20px;
    backdrop-filter: blur(12px);
  }

  .glass-card::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 1px solid rgba(255, 255, 255, 0.08);
    pointer-events: none;
  }

  .sql-main {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.4fr);
    gap: 16px;
  }

  .editor-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
  }

  .console-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 50%, transparent);
  }

  .console-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .console-title h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .console-title small {
    color: var(--desc-color);
    font-size: 12px;
  }

  .sql-header-actions {
    display: flex;
    gap: 12px;
  }

  .ghost-btn,
  .primary-btn {
    min-width: 120px;
  }

  .ghost-btn {
    background: transparent;
    border: 1px dashed color-mix(in srgb, var(--card-border-color) 70%, transparent);
    color: var(--text-color);
    transition: all 0.3s ease;
  }

  .ghost-btn:hover {
    border-color: color-mix(in srgb, #3488ff 80%, var(--text-color) 20%);
    color: color-mix(in srgb, #3488ff 80%, var(--text-color) 20%);
    background: color-mix(in srgb, #3488ff 8%, transparent);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(52, 136, 255, 0.15);
  }

  .primary-btn {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #3488ff 90%, var(--background-color) 10%),
      color-mix(in srgb, #7c4dff 90%, var(--background-color) 10%)
    );
    color: #ffffff;
    border: none;
    box-shadow:
      0 4px 16px rgba(52, 136, 255, 0.3),
      0 2px 8px rgba(124, 77, 255, 0.2);
    transition: all 0.3s ease;
  }

  .primary-btn:hover {
    transform: translateY(-2px);
    box-shadow:
      0 8px 24px rgba(52, 136, 255, 0.4),
      0 4px 12px rgba(124, 77, 255, 0.3);
    filter: brightness(1.1) saturate(1.1);
  }

  .sql-editor-shell {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-height: 0;
  }

  .editor-meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--desc-color);
  }

  .editor-meta-row strong {
    font-weight: 600;
  }

  .sql-input {
    flex: 1;
  }

  .sql-input :deep(textarea) {
    height: 100%;
    min-height: 220px;
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .panel-header h3 {
    margin: 0;
  }

  .panel-header small {
    color: var(--desc-color);
  }

  .status-pill {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid transparent;
    background: color-mix(in srgb, var(--background-color) 95%, transparent);
    color: var(--desc-color);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    backdrop-filter: blur(8px);
  }

  .status-pill.running {
    border-color: color-mix(in srgb, #3488ff 70%, var(--background-color) 30%);
    color: #3488ff;
    background: color-mix(in srgb, #3488ff 8%, transparent);
    animation: pulse 1.4s ease-in-out infinite;
    box-shadow: 0 0 0 0 rgba(52, 136, 255, 0.2);
  }

  .status-pill.completed {
    border-color: color-mix(in srgb, #39c59f 70%, var(--background-color) 30%);
    color: #39c59f;
    background: color-mix(in srgb, #39c59f 8%, transparent);
    box-shadow: 0 2px 8px rgba(57, 197, 159, 0.15);
  }

  .status-pill.error {
    border-color: color-mix(in srgb, #ff6b6b 70%, var(--background-color) 30%);
    color: #ff6b6b;
    background: color-mix(in srgb, #ff6b6b 8%, transparent);
    box-shadow: 0 2px 8px rgba(255, 107, 107, 0.15);
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(52, 136, 255, 0.4);
    }
    100% {
      box-shadow: 0 0 0 12px rgba(52, 136, 255, 0);
    }
  }

  .editor-meta {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--desc-color);
  }

  .assistant-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    height: 100%;
    overflow-y: auto;
    padding-right: 4px;
  }

  .helper-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 100px;
    flex-shrink: 0;
  }

  .quick-statements {
    min-height: 70px;
  }

  .table-templates {
    min-height: 70px;
  }

  .chip-grid {
    display: grid;
    gap: 8px;
  }

  .chip-grid.two-col {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  }

  .chip-grid.four-col {
    grid-template-columns: repeat(auto-fill, 100px);
    overflow-y: auto;
    padding-right: 4px;
  }

  .chip {
    border: none;
    border-radius: 16px;
    padding: 6px 12px;
    background: color-mix(in srgb, var(--common-tag-bg-color) 90%, transparent);
    color: var(--common-tag-h-color);
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.2;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .chip:hover {
    transform: translateY(-2px);
    background: var(--btn-h-bg-color);
    color: var(--text-color);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.12),
      0 2px 6px rgba(0, 0, 0, 0.08);
    border-color: color-mix(in srgb, var(--card-border-color) 60%, transparent);
  }

  .table-filter {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    color: var(--desc-color);
  }

  .table-filter-input {
    width: 95%;
    border-radius: 8px;
    border: 1px solid var(--card-border-color);
    padding: 6px 10px;
    background: var(--bl-input-noBorder-bg-color);
    color: var(--text-color);
    font-size: 12px;
  }

  .table-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-height: 180px;
    overflow-y: auto;
    padding-right: 4px;
    align-items: flex-start;
  }

  .table-chip {
    border-radius: 12px;
    border: 1px dashed transparent;
    padding: 6px 8px;
    background: var(--common-tag-bg-color);
    color: var(--common-tag-h-color);
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease;
    font-size: 11px;
    text-align: center;
    word-break: break-word;
    line-height: 1.2;
    display: flex;
    align-items: center;
    justify-content: center;
    height: auto;
    min-height: auto;
    &:hover {
      border-color: #3488ff;
      background: rgba(52, 136, 255, 0.12);
      color: #3488ff;
    }
  }

  .table-chip.active {
    border-color: #3488ff;
    background: rgba(52, 136, 255, 0.12);
    color: #3488ff;
  }

  .result-panel {
    flex: 0 0 auto;
    min-height: 200px;
    max-height: 300px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
  }

  .result-view {
    flex: 1;
    margin: 0;
    padding: 18px;
    background: var(--bl-input-noBorder-bg-color);
    border-radius: 12px;
    overflow: auto;
    font-size: 14px;
    white-space: pre-wrap;
    line-height: 1.5;
  }

  @media (max-width: 1200px) {
    .sql-main {
      grid-template-columns: 1fr;
      gap: 20px;
    }

    .assistant-panel {
      max-height: 500px;
    }

    .result-panel {
      max-height: none;
    }
  }

  @media (max-width: 768px) {
    .simple-sql {
      padding: 16px;
    }

    .console-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .sql-header-actions {
      width: 100%;
      justify-content: flex-start;
    }

    .assistant-panel {
      max-height: 400px;
    }
  }
</style>
