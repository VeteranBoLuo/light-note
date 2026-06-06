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
            <span>当前表：<strong>{{ selectedTable || '未选择' }}</strong></span>
            <span>点击表名选中，再次点击插入编辑器</span>
          </div>
          <div class="sql-input-wrapper">
            <BInput ref="sqlInputRef" class="sql-input" type="textarea" v-model:value="sql" :rows="18" placeholder="SELECT * FROM user WHERE id = ?;" @input="handleSqlInput" @focus="handleSqlFocus" @focusout="handleSqlBlur" />
            <div v-if="showSuggest" class="sql-suggest">
              <div class="sql-suggest-header"><span>智能提示</span><small>↑↓ 选择 · Enter/Tab 确认 · Esc 关闭</small></div>
              <div class="sql-suggest-list">
                <button v-for="(item, index) in filteredSuggestions" :key="item" type="button" class="sql-suggest-item" :class="{ active: index === activeSuggestIndex }" @mousedown.prevent="applySuggestion(item)">{{ item }}</button>
              </div>
            </div>
          </div>
          <div class="editor-meta">
            <span>字符数：{{ sql.length }}</span>
            <span>最后执行：{{ lastExecutedAt || '——' }}</span>
          </div>
        </div>
      </section>

      <div class="helper-card glass-card">
        <div class="panel-header"><h3>数据表</h3><small>{{ filteredTables.length }} / {{ tables.length }}</small></div>
        <div class="table-filter">
          <b-input v-model:value="tableFilter" placeholder="输入关键字过滤" class="log-search-input"><template #prefix><svg-icon :src="icon.navigation.search" size="16" /></template></b-input>
        </div>
        <div class="table-grid">
          <button v-for="table in filteredTables" :key="table" type="button" class="table-chip" :class="{ active: selectedTable === table }" @click="handleTableClick(table)">{{ table }}</button>
        </div>
      </div>
    </div>

    <div v-if="tableSnippets.length" class="template-row">
      <span class="template-label">数据操作：</span>
      <button v-for="item in tableSnippets" :key="item.label" type="button" class="chip" @click="runSqlTemplate(item.value)">{{ item.label }}</button>
    </div>

    <section class="result-grid">
      <section class="schema-panel glass-card">
        <div class="panel-header"><div><h3>表结构</h3><small>{{ schemaSummary }}</small></div><span class="status-pill" :class="schemaState">{{ schemaStatusCopy }}</span></div>
        <div class="schema-body">
          <div v-if="!selectedTable" class="schema-empty">选择一张表查看结构</div>
          <template v-else>
            <div v-if="schemaRows.length" class="schema-table">
              <div class="schema-row schema-head"><span>字段</span><span>类型</span><span>空</span><span>键</span><span>默认</span><span>附加</span></div>
              <div v-for="(row, index) in schemaRows" :key="`${row.field}-${index}`" class="schema-row"><span>{{ row.field }}</span><span>{{ row.type || '-' }}</span><span>{{ row.nullable || '-' }}</span><span>{{ row.key || '-' }}</span><span>{{ row.defaultValue || '-' }}</span><span>{{ row.extra || '-' }}</span></div>
            </div>
            <pre v-else class="schema-result">{{ schemaResult || '暂无结构信息' }}</pre>
          </template>
        </div>
      </section>

      <section class="result-panel glass-card">
        <div class="panel-header"><div><h3>执行结果</h3><small>{{ executionSummary }}</small></div><span class="status-pill" :class="executionState">{{ statusCopy }}</span></div>
        <pre v-if="!resultColumns.length" class="result-view">{{ result || '等待执行...' }}</pre>
        <BTable v-else :data="resultData" :columns="resultColumns" />
      </section>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { apiBasePost } from '@/http/request.ts';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import icon from '@/config/icon.ts';

type ExecutionState = 'idle' | 'running' | 'completed' | 'error';
type SchemaRow = { field: string; type?: string; nullable?: string; key?: string; defaultValue?: string; extra?: string };

const sql = ref('');
const result = ref('');
const resultData = ref<any[]>([]);
const selectedTable = ref('');
const tableFilter = ref('');
const executionState = ref<ExecutionState>('idle');
const lastExecutedAt = ref('');
const schemaState = ref<ExecutionState>('idle');
const schemaRows = ref<SchemaRow[]>([]);
const schemaResult = ref('');
const schemaUpdatedAt = ref('');
const errorSignatures = ['error', 'exception', 'unknown column', 'denied', 'syntax', "doesn't exist", 'duplicate'];

const tables = ['api_logs','bookmark','config_json','files','folders','help_config','help_config_draft','note','note_images','operation_logs','opinion','resource_tag_relations','tag','tag_bookmark_relations','tag_relations','user'];

const keyWords = ['SELECT','FROM','INSERT INTO','UPDATE','DELETE','WHERE','GROUP BY','ORDER BY','LIMIT','INNER JOIN','LEFT JOIN','RIGHT JOIN','COUNT(*)','SUM()','MAX()','MIN()','LIKE','BETWEEN','AND','OR','NOT','IN','IS NULL','IS NOT NULL','DESC','ASC'];

const sqlInputRef = ref<InstanceType<typeof BInput> | null>(null);
const isSqlFocused = ref(false);
const tokenInfo = ref<{ token: string; start: number; end: number } | null>(null);
const activeSuggestIndex = ref(0);

const suggestionSource = computed(() => {
  const merged = [...keyWords, ...tables];
  if (selectedTable.value && schemaRows.value.length > 0) merged.push(...schemaRows.value.map((row) => row.field));
  return Array.from(new Set(merged));
});

const filteredSuggestions = computed(() => {
  const info = tokenInfo.value;
  if (!info?.token) return [];
  const keyword = info.token.trim();
  if (!keyword) return [];
  return suggestionSource.value.filter((item) => item.toUpperCase().startsWith(keyword.toUpperCase())).slice(0, 12);
});

const showSuggest = computed(() => isSqlFocused.value && filteredSuggestions.value.length > 0);

const tableTemplates = [
  { label: '查询全部', build: (table: string) => `SELECT * FROM ${table};` },
  { label: '最新 50 条', build: (table: string) => `SELECT * FROM ${table} ORDER BY id DESC LIMIT 50;` },
  { label: '统计行数', build: (table: string) => `SELECT COUNT(*) AS total FROM ${table};` },
  { label: '按 ID 查询', build: (table: string) => `SELECT * FROM ${table} WHERE id = ?;` },
  { label: '按 ID 删除', build: (table: string) => `DELETE FROM ${table} WHERE id = ?;` },
  { label: '按 ID 更新', build: (table: string) => `UPDATE ${table} SET column = value WHERE id = ?;` },
  { label: '新增记录', build: (table: string) => `INSERT INTO ${table} (column1, column2) VALUES (value1, value2);` },
  { label: '查看结构', build: (table: string) => `DESC ${table};` },
];

const filteredTables = computed(() => {
  const keyword = tableFilter.value.trim().toLowerCase();
  if (!keyword) return tables;
  return tables.filter((table) => table.toLowerCase().includes(keyword));
});

const tableSnippets = computed(() => {
  if (!selectedTable.value) return [];
  return tableTemplates.map((t) => ({ label: t.label, value: t.build(selectedTable.value) }));
});

const resultColumns = computed(() => {
  if (!resultData.value.length) return [];
  const first = resultData.value[0];
  if (!first || typeof first !== 'object') return [];
  return Object.keys(first).map((key) => ({ key, title: key, width: '150px' }));
});

const statusCopy = computed(() => ({ running: '执行中', completed: '已完成', error: '异常' } as Record<string, string>)[executionState.value] || '待执行');
const executionSummary = computed(() => lastExecutedAt.value ? `最后执行：${lastExecutedAt.value}` : '尚未执行');
const schemaStatusCopy = computed(() => ({ running: '加载中', completed: '已更新', error: '异常' } as Record<string, string>)[schemaState.value] || '待选择');
const schemaSummary = computed(() => {
  if (!selectedTable.value) return '尚未选择数据表';
  return schemaUpdatedAt.value ? `${selectedTable.value} · 更新于 ${schemaUpdatedAt.value}` : `${selectedTable.value} · 暂未加载`;
});

function appendSql(fragment: string) { if (fragment) sql.value = fragment.trim() + ' '; }
function runSqlTemplate(fragment: string) { sql.value = fragment.trim(); runSql(); }
function clearSql() { sql.value = ''; }

function getSqlTextarea(): HTMLTextAreaElement | null {
  return (sqlInputRef.value as any)?.$el?.querySelector('textarea') ?? null;
}

function updateTokenInfo() {
  const textarea = getSqlTextarea();
  if (!textarea) { tokenInfo.value = null; return; }
  const cursor = textarea.selectionStart ?? 0;
  const match = textarea.value.slice(0, cursor).match(/[A-Za-z_][\w]*$/);
  if (!match) { tokenInfo.value = null; return; }
  tokenInfo.value = { token: match[0], start: cursor - match[0].length, end: cursor };
}

function handleSqlInput() { updateTokenInfo(); }
function handleSqlFocus() { isSqlFocused.value = true; updateTokenInfo(); }
function handleSqlBlur() { isSqlFocused.value = false; tokenInfo.value = null; }

function applySuggestion(value: string) {
  const info = tokenInfo.value;
  if (!info) { appendSql(value); return; }
  const before = sql.value.slice(0, info.start);
  const insertion = value + ' ';
  sql.value = before + insertion + sql.value.slice(info.end);
  nextTick(() => {
    const textarea = getSqlTextarea();
    if (!textarea) return;
    const cursor = before.length + insertion.length;
    textarea.focus(); textarea.setSelectionRange(cursor, cursor);
    updateTokenInfo();
  });
}

function handleTableClick(table: string) { selectedTable.value = table; loadTableSchema(table); }

function handleSuggestKeydown(event: KeyboardEvent) {
  if (!showSuggest.value || !filteredSuggestions.value.length) return;
  if (event.key === 'ArrowDown') { event.preventDefault(); activeSuggestIndex.value = (activeSuggestIndex.value + 1) % filteredSuggestions.value.length; }
  else if (event.key === 'ArrowUp') { event.preventDefault(); activeSuggestIndex.value = (activeSuggestIndex.value - 1 + filteredSuggestions.value.length) % filteredSuggestions.value.length; }
  else if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); applySuggestion(filteredSuggestions.value[activeSuggestIndex.value]); }
  else if (event.key === 'Escape') { event.preventDefault(); tokenInfo.value = null; }
}

function bindSqlEvents() {
  const textarea = getSqlTextarea();
  if (!textarea) return;
  textarea.addEventListener('keydown', handleSuggestKeydown);
  textarea.addEventListener('keyup', updateTokenInfo);
  textarea.addEventListener('mouseup', updateTokenInfo);
}

function unbindSqlEvents() {
  const textarea = getSqlTextarea();
  if (!textarea) return;
  textarea.removeEventListener('keydown', handleSuggestKeydown);
  textarea.removeEventListener('keyup', updateTokenInfo);
  textarea.removeEventListener('mouseup', updateTokenInfo);
}

watch(() => tokenInfo.value?.token ?? '', (n, o) => { if (n !== o) activeSuggestIndex.value = 0; });

onMounted(() => {
  nextTick(bindSqlEvents);
  if (!selectedTable.value && tables.length > 0) { selectedTable.value = tables[0]; loadTableSchema(tables[0]); }
});

onBeforeUnmount(() => { unbindSqlEvents(); });

function formatResult(payload: unknown): string {
  if (payload === null || payload === undefined) return '';
  if (typeof payload === 'string') return payload;
  try { return JSON.stringify(payload, null, 2); } catch { return String(payload); }
}

function detectResultError(payload: unknown): boolean {
  if (!payload) return false;
  if (typeof payload === 'string') return errorSignatures.some((tag) => payload.toLowerCase().includes(tag));
  if (typeof payload === 'object') {
    const r = payload as Record<string, any>;
    if (r.error) return true;
    if (r.success === false) return true;
    if (typeof r.code === 'string' && r.code.toLowerCase().includes('err')) return true;
    if (typeof r.status === 'string' && r.status.toLowerCase() === 'error') return true;
  }
  return false;
}

function normalizeSchemaRows(payload: unknown): SchemaRow[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const r = item as Record<string, any>;
    const field = r.Field ?? r.field ?? r.column ?? r.name;
    if (!field) return null;
    return { field: String(field), type: r.Type ?? r.type, nullable: r.Null ?? r.null, key: r.Key ?? r.key, defaultValue: r.Default ?? r.default, extra: r.Extra ?? r.extra } as SchemaRow;
  }).filter((row): row is SchemaRow => Boolean(row));
}

async function loadTableSchema(table: string) {
  schemaState.value = 'running'; schemaRows.value = []; schemaResult.value = '加载中...';
  try {
    const res: any = await apiBasePost('/api/common/runSql', { sql: `DESC ${table};` });
    const ok = res?.status === 200;
    const payload = ok ? res?.data : (res?.msg ?? res);
    const rows = normalizeSchemaRows(payload);
    schemaRows.value = rows;
    schemaResult.value = rows.length ? '' : formatResult(payload) || '无返回结果';
    schemaState.value = detectResultError(payload) || !ok ? 'error' : 'completed';
  } catch (e: any) { schemaResult.value = e?.message || '请求异常'; schemaState.value = 'error'; }
  finally { schemaUpdatedAt.value = new Date().toLocaleString(); }
}

async function runSql() {
  if (!sql.value.trim()) { result.value = '请先输入 SQL 语句。'; executionState.value = 'error'; return; }
  executionState.value = 'running'; result.value = '执行中，请稍候...';
  try {
    const res: any = await apiBasePost('/api/common/runSql', { sql: sql.value });
    const ok = res?.status === 200;
    const payload = ok ? res?.data : (res?.msg ?? res);
    resultData.value = Array.isArray(payload) && payload.length && typeof payload[0] === 'object' ? payload : [];
    result.value = formatResult(payload) || '无返回结果';
    executionState.value = detectResultError(payload) || !ok ? 'error' : 'completed';
    if (ok && !detectResultError(payload)) lastExecutedAt.value = new Date().toLocaleString();
  } catch (e: any) { result.value = e?.message || '请求异常'; executionState.value = 'error'; }
}
</script>

<style lang="less" scoped>
.simple-sql { display: flex; flex-direction: column; height: 100%; padding: 20px; box-sizing: border-box; color: var(--text-color); overflow: hidden; }
.glass-card { position: relative; overflow: hidden; background: color-mix(in srgb, var(--background-color) 92%, transparent); border: 1px solid color-mix(in srgb, var(--card-border-color) 60%, transparent); border-radius: 20px; padding: 20px; backdrop-filter: blur(12px); }
.glass-card::after { content: ''; position: absolute; inset: 0; border-radius: inherit; border: 1px solid rgba(255,255,255,0.08); pointer-events: none; }
.sql-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0,1.2fr) minmax(0,0.8fr); gap: 16px; }
.editor-stack { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.console-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 50%, transparent); }
.console-title { display: flex; flex-direction: column; gap: 2px; }
.console-title h3 { margin: 0; font-size: 18px; font-weight: 600; }
.console-title small { color: var(--desc-color); font-size: 12px; }
.sql-header-actions { display: flex; gap: 12px; }
.ghost-btn, .primary-btn { min-width: 100px; }
.ghost-btn { background: transparent; border: 1px dashed color-mix(in srgb, var(--card-border-color) 70%, transparent); color: var(--text-color); transition: all 0.3s ease; }
.ghost-btn:hover { border-color: color-mix(in srgb, #3488ff 80%, var(--text-color) 20%); color: color-mix(in srgb, #3488ff 80%, var(--text-color) 20%); background: color-mix(in srgb, #3488ff 8%, transparent); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(52,136,255,0.15); }
.primary-btn { background: linear-gradient(135deg, color-mix(in srgb, #3488ff 90%, var(--background-color) 10%), color-mix(in srgb, #7c4dff 90%, var(--background-color) 10%)); color: #fff; border: none; box-shadow: 0 4px 16px rgba(52,136,255,0.3), 0 2px 8px rgba(124,77,255,0.2); transition: all 0.3s ease; }
.primary-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(52,136,255,0.4), 0 4px 12px rgba(124,77,255,0.3); filter: brightness(1.1) saturate(1.1); }
.sql-editor-shell { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; }
.editor-meta-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--desc-color); }
.editor-meta-row strong { font-weight: 600; }
.sql-input { flex: 1; display: flex; }
.sql-input-wrapper { position: relative; flex: 1; min-height: 0; overflow: hidden; display: flex; }
.sql-input :deep(textarea) { flex: 1; min-height: 0; font-family: 'JetBrains Mono','Fira Code',Consolas,monospace; }
.sql-suggest { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 5; background: color-mix(in srgb, var(--background-color) 96%, transparent); border: 1px solid color-mix(in srgb, var(--card-border-color) 60%, transparent); border-radius: 14px; box-shadow: 0 10px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08); backdrop-filter: blur(10px); overflow: hidden; }
.sql-suggest-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 12px; font-size: 11px; color: var(--desc-color); background: color-mix(in srgb, var(--background-color) 90%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 50%, transparent); }
.sql-suggest-list { max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; }
.sql-suggest-item { border: none; background: transparent; color: var(--text-color); text-align: left; padding: 8px 12px; font-size: 12px; cursor: pointer; transition: background-color 0.2s ease, color 0.2s ease; }
.sql-suggest-item:hover, .sql-suggest-item.active { background: color-mix(in srgb, #3488ff 12%, transparent); color: color-mix(in srgb, #3488ff 85%, var(--text-color) 15%); }
.panel-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.panel-header h3 { margin: 0; }
.panel-header small { color: var(--desc-color); }
.status-pill { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; border: 1px solid transparent; background: color-mix(in srgb, var(--background-color) 95%, transparent); color: var(--desc-color); box-shadow: 0 2px 8px rgba(0,0,0,0.06); backdrop-filter: blur(8px); }
.status-pill.running { border-color: color-mix(in srgb, #3488ff 70%, var(--background-color) 30%); color: #3488ff; background: color-mix(in srgb, #3488ff 8%, transparent); animation: pulse 1.4s ease-in-out infinite; box-shadow: 0 0 0 0 rgba(52,136,255,0.2); }
.status-pill.completed { border-color: color-mix(in srgb, #39c59f 70%, var(--background-color) 30%); color: #39c59f; background: color-mix(in srgb, #39c59f 8%, transparent); box-shadow: 0 2px 8px rgba(57,197,159,0.15); }
.status-pill.error { border-color: color-mix(in srgb, #ff6b6b 70%, var(--background-color) 30%); color: #ff6b6b; background: color-mix(in srgb, #ff6b6b 8%, transparent); box-shadow: 0 2px 8px rgba(255,107,107,0.15); }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(52,136,255,0.4); } 100% { box-shadow: 0 0 0 12px rgba(52,136,255,0); } }
.editor-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--desc-color); }
.helper-card { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; }
.chip-grid { display: grid; gap: 8px; }
.chip-grid.two-col { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
.chip-grid.four-col { grid-template-columns: repeat(auto-fill, 100px); overflow-y: auto; padding-right: 4px; }
.chip { border: none; border-radius: 16px; padding: 6px 12px; background: color-mix(in srgb, var(--common-tag-bg-color) 90%, transparent); color: var(--common-tag-h-color); cursor: pointer; transition: all 0.3s ease; font-size: 11px; font-weight: 500; line-height: 1.2; border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.chip:hover { transform: translateY(-2px); background: var(--btn-h-bg-color); color: var(--text-color); box-shadow: 0 4px 12px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08); border-color: color-mix(in srgb, var(--card-border-color) 60%, transparent); }
.table-filter { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--desc-color); }
.table-grid { display: flex; flex-wrap: wrap; gap: 8px; max-height: 180px; overflow-y: auto; padding-right: 4px; align-items: flex-start; }
.table-chip { border-radius: 12px; border: 1px dashed transparent; padding: 6px 8px; background: var(--common-tag-bg-color); color: var(--common-tag-h-color); cursor: pointer; transition: border-color 0.2s ease, background-color 0.2s ease; font-size: 11px; text-align: center; word-break: break-word; line-height: 1.2; display: flex; align-items: center; justify-content: center; height: auto; min-height: auto; }
.table-chip:hover { border-color: #3488ff; background: rgba(52,136,255,0.12); color: #3488ff; }
.table-chip.active { border-color: #3488ff; background: rgba(52,136,255,0.12); color: #3488ff; }
.result-grid { display: grid; grid-template-columns: 0.7fr 1fr; gap: 16px; height: 260px; }
.template-row { display: flex; align-items: center; gap: 8px; padding: 10px 0; flex-wrap: wrap; }
.template-label { font-size: 12px; color: var(--desc-color); white-space: nowrap; }
.schema-panel, .result-panel { display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
.schema-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 10px; }
.schema-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--desc-color); background: var(--bl-input-noBorder-bg-color); border-radius: 12px; font-size: 13px; }
.schema-table { flex: 1; display: flex; flex-direction: column; gap: 6px; overflow: auto; padding-right: 4px; }
.schema-row { display: grid; grid-template-columns: 1.1fr 1.4fr 0.5fr 0.6fr 0.9fr 1fr; gap: 8px; padding: 6px 10px; border-radius: 10px; font-size: 12px; background: color-mix(in srgb, var(--background-color) 90%, transparent); border: 1px solid color-mix(in srgb, var(--card-border-color) 60%, transparent); }
.schema-row.schema-head { font-size: 11px; font-weight: 600; color: var(--desc-color); background: color-mix(in srgb, var(--background-color) 80%, transparent); }
.schema-row span { word-break: break-word; }
.schema-result { flex: 1; margin: 0; padding: 14px; background: var(--bl-input-noBorder-bg-color); border-radius: 12px; overflow: auto; font-size: 13px; white-space: pre-wrap; line-height: 1.5; }
.result-panel { min-height: 200px; max-height: 260px; overflow: hidden; }
.result-panel :deep(.table-container) { height: calc(100% - 50px); overflow: auto; }
.result-panel :deep(.table-header),
.result-panel :deep(.table-row) { width: fit-content; }
.result-panel :deep(.table-body) { max-height: none !important; overflow: visible !important; }
.result-view { flex: 1; margin: 0; padding: 18px; background: var(--pre-bg-color); border-radius: 12px; overflow: auto; font-size: 14px; white-space: pre-wrap; line-height: 1.5; }
@media (max-width: 1200px) {
  .sql-main { grid-template-columns: 1fr; gap: 20px; }
  .helper-card { max-height: 500px; }
  .result-grid { grid-template-columns: 1fr; max-height: none; }
  .result-panel, .schema-panel { max-height: none; }
}
@media (max-width: 768px) {
  .simple-sql { padding: 16px; }
  .console-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .sql-header-actions { width: 100%; justify-content: flex-start; }
}
</style>
