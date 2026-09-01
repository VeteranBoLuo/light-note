<template>
  <section class="browser-sql-workbench" :aria-label="t('toolbox.tool.browser_sql.name')">
    <section class="sql-stagebar" aria-label="SQL workflow">
      <div v-for="stage in stages" :key="stage.key" :class="['sql-stagebar__item', `is-${stage.state}`]">
        <span>
          <SvgIcon v-if="stage.state === 'done'" :src="icon.toolbox.locate" size="15" />
          <i v-else>{{ stage.index }}</i>
        </span>
        <div
          ><strong>{{ stage.label }}</strong
          ><small>{{ stage.description }}</small></div
        >
      </div>
    </section>

    <section v-if="files.length === 0" class="sql-empty">
      <div class="sql-empty__visual" aria-hidden="true">
        <span><SvgIcon :src="icon.toolbox.table" size="34" /></span>
        <i></i><i></i><i></i>
      </div>
      <div class="sql-empty__copy">
        <BChip tone="success">DuckDB-Wasm</BChip>
        <h2>{{ t('toolbox.browserSql.emptyTitle') }}</h2>
        <p>{{ t('toolbox.browserSql.emptyDescription') }}</p>
      </div>
      <BUpload
        :multiple="true"
        raw-file
        accept=".csv,.json,.parquet,text/csv,application/json,application/vnd.apache.parquet"
        :max-total-size="BROWSER_SQL_MAX_BYTES"
        @change="handleUpload"
      >
        <BButton type="primary" size="large">
          <SvgIcon :src="icon.toolbox.upload" size="17" />{{ t('toolbox.browserSql.chooseFiles') }}
        </BButton>
      </BUpload>
      <small>{{ t('toolbox.browserSql.limitHint') }}</small>
    </section>

    <template v-else>
      <section class="sql-source-panel">
        <header>
          <div>
            <span class="sql-section-index">01</span>
            <div
              ><strong>{{ t('toolbox.browserSql.sources') }}</strong
              ><small>{{ sourceSummary }}</small></div
            >
          </div>
          <div class="sql-source-panel__actions">
            <BChip :tone="engineTone">
              <span class="sql-engine-status"><i></i>{{ engineStatusLabel }}</span>
            </BChip>
            <BUpload
              :multiple="true"
              raw-file
              accept=".csv,.json,.parquet,text/csv,application/json,application/vnd.apache.parquet"
              :max-total-size="BROWSER_SQL_MAX_BYTES"
              :disabled="busy || files.length >= BROWSER_SQL_MAX_FILES"
              @change="handleUpload"
            >
              <BButton size="small" :disabled="busy || files.length >= BROWSER_SQL_MAX_FILES">
                {{ t('toolbox.browserSql.addFiles') }}
              </BButton>
            </BUpload>
            <BButton size="small" :disabled="busy" @click="clearFiles">{{ t('common.clear') }}</BButton>
          </div>
        </header>

        <div class="sql-source-grid">
          <article v-for="(file, index) in files" :key="`${file.name}:${file.lastModified}`" class="sql-source-card">
            <span><SvgIcon :src="icon.toolbox.table" size="19" /></span>
            <div>
              <strong>{{ tables[index]?.name || tableNameForIndex(index) }}</strong>
              <small>{{ file.name }} · {{ formatToolboxBytes(file.size) }}</small>
            </div>
            <BButton
              size="small"
              :disabled="busy"
              :aria-label="t('toolbox.browserSql.removeFile')"
              @click="removeFile(index)"
            >
              <SvgIcon :src="icon.toolbox.delete" size="14" />
            </BButton>
          </article>
        </div>

        <div v-if="tables.length" class="sql-schema-strip">
          <div v-for="table in tables" :key="table.name">
            <strong>{{ table.name }}</strong>
            <span>{{ t('toolbox.browserSql.rows', { count: table.rowCount.toLocaleString() }) }}</span>
            <span>{{ t('toolbox.browserSql.columns', { count: table.columns.length }) }}</span>
            <small>{{
              table.columns
                .slice(0, 5)
                .map((column) => column.name)
                .join(' · ')
            }}</small>
          </div>
        </div>
      </section>

      <section class="sql-console">
        <header>
          <div>
            <span class="sql-section-index">02</span>
            <div
              ><strong>{{ t('toolbox.browserSql.editor') }}</strong
              ><small>{{ t('toolbox.browserSql.editorHint') }}</small></div
            >
          </div>
          <BChip tone="neutral">{{ runtimeVersion }}</BChip>
        </header>

        <div class="sql-recipes" :aria-label="t('toolbox.browserSql.recipes')">
          <BButton
            v-for="recipe in recipes"
            :key="recipe.label"
            size="small"
            :disabled="busy"
            @click="sql = recipe.sql"
          >
            {{ recipe.label }}
          </BButton>
        </div>

        <BInput
          v-model:value="sql"
          type="textarea"
          :rows="10"
          :maxlength="100000"
          :placeholder="t('toolbox.browserSql.placeholder')"
          :disabled="busy"
          @keydown.meta.enter.prevent="runSql"
          @keydown.ctrl.enter.prevent="runSql"
        />

        <div class="sql-console__footer">
          <span><SvgIcon :src="icon.toolbox.local" size="15" />{{ t('toolbox.browserSql.readOnlyHint') }}</span>
          <BButton type="primary" :loading="running" :disabled="!canRun" @click="runSql">
            {{ running ? t('toolbox.browserSql.running') : t('toolbox.browserSql.run') }}
            <small v-if="!running">⌘↵</small>
          </BButton>
        </div>
      </section>

      <section v-if="errorMessage" class="sql-error" role="alert">
        <span><SvgIcon :src="icon.toolbox.locate" size="18" /></span>
        <div
          ><strong>{{ t('toolbox.browserSql.errorTitle') }}</strong
          ><p>{{ errorMessage }}</p></div
        >
        <BButton v-if="engineState === 'error'" size="small" @click="rebuildRuntime">{{ t('common.retry') }}</BButton>
      </section>

      <section class="sql-result-panel">
        <header>
          <div>
            <span class="sql-section-index">03</span>
            <div
              ><strong>{{ t('toolbox.browserSql.result') }}</strong
              ><small>{{ resultDescription }}</small></div
            >
          </div>
          <div v-if="result" class="sql-result-actions">
            <BButton size="small" @click="downloadResult('json')">JSON</BButton>
            <BButton type="primary" size="small" @click="downloadResult('csv')">
              <SvgIcon :src="icon.toolbox.download" size="14" />CSV
            </BButton>
          </div>
        </header>

        <div v-if="loadingEngine || importing" class="sql-result-state">
          <BLoading
            inline
            :loading="true"
            :title="loadingEngine ? t('toolbox.browserSql.startingEngine') : t('toolbox.browserSql.importing')"
          />
          <p>{{ t('toolbox.browserSql.engineHint') }}</p>
        </div>
        <div v-else-if="!result" class="sql-result-state is-idle">
          <span><SvgIcon :src="icon.toolbox.table" size="28" /></span>
          <strong>{{ t('toolbox.browserSql.waitingTitle') }}</strong>
          <p>{{ t('toolbox.browserSql.waitingDescription') }}</p>
        </div>
        <template v-else>
          <div class="sql-result-facts">
            <div
              ><span>{{ t('toolbox.browserSql.returnedRows') }}</span
              ><strong>{{ result.rowCount.toLocaleString() }}</strong></div
            >
            <div
              ><span>{{ t('toolbox.browserSql.resultColumns') }}</span
              ><strong>{{ result.columns.length }}</strong></div
            >
            <div
              ><span>{{ t('toolbox.browserSql.elapsed') }}</span
              ><strong>{{ result.elapsedMs }} ms</strong></div
            >
            <BChip v-if="result.truncated" tone="pending">{{ t('toolbox.browserSql.truncated') }}</BChip>
          </div>
          <BTable class="sql-result-table" :data="previewRows" :columns="previewColumns" row-key="__rowId" />
          <div class="sql-result-mobile">
            <article v-for="row in previewRows.slice(0, 30)" :key="row.__rowId">
              <div v-for="column in visibleResultColumns" :key="column">
                <span>{{ column }}</span
                ><strong>{{ displayCell(row[column]) }}</strong>
              </div>
            </article>
          </div>
          <p v-if="result.rows.length > previewRows.length" class="sql-preview-note">
            {{ t('toolbox.browserSql.previewLimit', { count: previewRows.length }) }}
          </p>
        </template>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import type { Column } from '@/components/base/BasicComponents/BTable/config';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    BROWSER_SQL_MAX_BYTES,
    BROWSER_SQL_MAX_FILES,
    BROWSER_SQL_PREVIEW_ROWS,
    browserSqlResultToCsv,
    createBrowserDuckDb,
    destroyBrowserDuckDb,
    executeBrowserSql,
    importBrowserSqlFiles,
    tableNameForIndex,
    type BrowserDuckDbRuntime,
    type BrowserSqlResult,
    type BrowserSqlTable,
  } from '@/utils/toolboxBrowserSql';
  import { downloadToolboxBlob, formatToolboxBytes } from '@/utils/toolboxLocal';

  const { t } = useI18n();
  const files = ref<File[]>([]);
  const tables = ref<BrowserSqlTable[]>([]);
  const sql = ref('');
  const result = ref<BrowserSqlResult | null>(null);
  const engineState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const importing = ref(false);
  const running = ref(false);
  const runtimeVersion = ref('DuckDB');
  const errorCode = ref('');
  let runtime: BrowserDuckDbRuntime | null = null;
  let runtimeRevision = 0;
  const knownRuntimeErrors = new Set(['UNSUPPORTED_FILE', 'TOO_MANY_FILES', 'TOO_LARGE', 'WORKER_UNAVAILABLE']);
  const knownQueryErrors = new Set([
    'EMPTY_SQL',
    'SQL_TOO_LONG',
    'MULTIPLE_STATEMENTS',
    'READ_ONLY_SQL_REQUIRED',
    'REMOTE_SOURCE_BLOCKED',
  ]);

  const loadingEngine = computed(() => engineState.value === 'loading');
  const busy = computed(() => loadingEngine.value || importing.value || running.value);
  const canRun = computed(
    () => engineState.value === 'ready' && tables.value.length > 0 && sql.value.trim() && !busy.value,
  );
  const engineTone = computed(
    () =>
      (engineState.value === 'ready' ? 'success' : engineState.value === 'error' ? 'danger' : 'pending') as
        'success' | 'danger' | 'pending',
  );
  const engineStatusLabel = computed(() => t(`toolbox.browserSql.engineState.${engineState.value}`));
  const sourceSummary = computed(() =>
    t('toolbox.browserSql.sourceSummary', {
      count: files.value.length,
      size: formatToolboxBytes(files.value.reduce((sum, file) => sum + file.size, 0)),
    }),
  );
  const stages = computed(() => {
    const imported = tables.value.length > 0;
    const queried = Boolean(result.value);
    return [
      {
        key: 'source',
        index: 1,
        label: t('toolbox.browserSql.stage.source'),
        description: t('toolbox.browserSql.stage.sourceHint'),
        state: files.value.length ? 'done' : 'active',
      },
      {
        key: 'query',
        index: 2,
        label: t('toolbox.browserSql.stage.query'),
        description: t('toolbox.browserSql.stage.queryHint'),
        state: queried ? 'done' : imported ? 'active' : 'pending',
      },
      {
        key: 'result',
        index: 3,
        label: t('toolbox.browserSql.stage.result'),
        description: t('toolbox.browserSql.stage.resultHint'),
        state: queried ? 'active' : 'pending',
      },
    ];
  });
  const recipes = computed(() => {
    const table = tables.value[0];
    if (!table) return [];
    const numeric = table.columns.find((column) => /(int|decimal|double|float|real|hugeint)/iu.test(column.type));
    const category = table.columns.find((column) => /(varchar|text|string)/iu.test(column.type));
    const items = [
      { label: t('toolbox.browserSql.recipe.preview'), sql: `SELECT * FROM "${table.name}" LIMIT 100` },
      { label: t('toolbox.browserSql.recipe.count'), sql: `SELECT count(*) AS total_rows FROM "${table.name}"` },
    ];
    if (numeric)
      items.push({
        label: t('toolbox.browserSql.recipe.stats'),
        sql: `SELECT min("${numeric.name.replace(/"/gu, '""')}") AS minimum, avg("${numeric.name.replace(/"/gu, '""')}") AS average, max("${numeric.name.replace(/"/gu, '""')}") AS maximum FROM "${table.name}"`,
      });
    if (category)
      items.push({
        label: t('toolbox.browserSql.recipe.group'),
        sql: `SELECT "${category.name.replace(/"/gu, '""')}" AS category, count(*) AS total FROM "${table.name}" GROUP BY 1 ORDER BY total DESC LIMIT 20`,
      });
    return items;
  });
  const visibleResultColumns = computed(() => result.value?.columns.slice(0, 8) || []);
  const previewRows = computed(() =>
    (result.value?.rows.slice(0, BROWSER_SQL_PREVIEW_ROWS) || []).map((row, index) => ({ ...row, __rowId: index + 1 })),
  );
  const previewColumns = computed<Column[]>(() =>
    visibleResultColumns.value.map((column) => ({ key: column, title: column, width: 'minmax(90px, 1fr)' })),
  );
  const resultDescription = computed(() =>
    result.value ? t('toolbox.browserSql.resultReady') : t('toolbox.browserSql.resultHint'),
  );
  const errorMessage = computed(() => (errorCode.value ? t(`toolbox.browserSql.error.${errorCode.value}`) : ''));

  function displayCell(value: unknown) {
    if (value == null || value === '') return '—';
    return String(value);
  }

  function normalizeFiles(payload: unknown) {
    return Array.isArray(payload) ? payload.filter((item): item is File => item instanceof File) : [];
  }

  async function handleUpload(payload: unknown) {
    const added = normalizeFiles(payload);
    if (!added.length) return;
    const unique = [...files.value, ...added].filter(
      (file, index, all) =>
        all.findIndex(
          (item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified,
        ) === index,
    );
    if (unique.length > BROWSER_SQL_MAX_FILES) {
      errorCode.value = 'TOO_MANY_FILES';
      return;
    }
    if (unique.reduce((sum, file) => sum + file.size, 0) > BROWSER_SQL_MAX_BYTES) {
      errorCode.value = 'TOO_LARGE';
      return;
    }
    files.value = unique;
    await rebuildRuntime();
  }

  async function removeFile(index: number) {
    files.value = files.value.filter((_, fileIndex) => fileIndex !== index);
    if (files.value.length) await rebuildRuntime();
    else await clearFiles();
  }

  async function clearFiles() {
    const previous = runtime;
    runtime = null;
    runtimeRevision += 1;
    files.value = [];
    tables.value = [];
    result.value = null;
    sql.value = '';
    errorCode.value = '';
    engineState.value = 'idle';
    await destroyBrowserDuckDb(previous);
  }

  async function rebuildRuntime() {
    const revision = ++runtimeRevision;
    const previous = runtime;
    runtime = null;
    result.value = null;
    tables.value = [];
    errorCode.value = '';
    engineState.value = 'loading';
    await destroyBrowserDuckDb(previous);
    try {
      const nextRuntime = await createBrowserDuckDb();
      if (revision !== runtimeRevision) {
        await destroyBrowserDuckDb(nextRuntime);
        return;
      }
      runtime = nextRuntime;
      runtimeVersion.value = `DuckDB ${nextRuntime.version.replace(/^v/iu, '')}`;
      importing.value = true;
      tables.value = await importBrowserSqlFiles(nextRuntime, files.value);
      if (revision !== runtimeRevision) return;
      engineState.value = 'ready';
      if (!sql.value.trim() && tables.value[0]) sql.value = `SELECT * FROM "${tables.value[0].name}" LIMIT 100`;
    } catch (error) {
      if (revision !== runtimeRevision) return;
      engineState.value = 'error';
      const code = error instanceof Error ? error.message : '';
      errorCode.value = knownRuntimeErrors.has(code) ? code : 'ENGINE_FAILED';
    } finally {
      if (revision === runtimeRevision) importing.value = false;
    }
  }

  async function runSql() {
    if (!runtime || !canRun.value) return;
    running.value = true;
    errorCode.value = '';
    try {
      result.value = await executeBrowserSql(runtime, sql.value);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      errorCode.value = knownQueryErrors.has(code) ? code : 'QUERY_FAILED';
    } finally {
      running.value = false;
    }
  }

  function downloadResult(format: 'csv' | 'json') {
    if (!result.value) return;
    const content = format === 'csv' ? browserSqlResultToCsv(result.value) : JSON.stringify(result.value.rows, null, 2);
    downloadToolboxBlob(
      new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' }),
      `lightnote-query-${Date.now()}.${format}`,
    );
  }

  onBeforeUnmount(() => {
    runtimeRevision += 1;
    const previous = runtime;
    runtime = null;
    void destroyBrowserDuckDb(previous);
  });
</script>

<style scoped lang="less">
  .browser-sql-workbench {
    display: grid;
    gap: 16px;
  }

  .sql-stagebar {
    padding: 9px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }

  .sql-stagebar__item {
    min-width: 0;
    padding: 9px 11px;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 1px solid transparent;
    border-radius: 10px;
    color: var(--desc-color);
  }

  .sql-stagebar__item > span {
    width: 27px;
    height: 27px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--workspace-panel-bg-color);
    font-size: 10px;
    font-weight: 750;
  }

  .sql-stagebar__item > span i {
    font-style: normal;
  }

  .sql-stagebar__item > div,
  .sql-source-panel header > div > div,
  .sql-console header > div > div,
  .sql-result-panel header > div > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .sql-stagebar__item strong,
  .sql-stagebar__item small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sql-stagebar__item small {
    font-size: 10px;
  }

  .sql-stagebar__item.is-active {
    border-color: var(--primary-color);
    color: var(--text-color);
    background: var(--workspace-panel-bg-color);
  }

  .sql-stagebar__item.is-active > span,
  .sql-stagebar__item.is-done > span {
    border-color: var(--primary-color);
    color: #fff;
    background: var(--primary-color);
  }

  .sql-stagebar__item.is-done {
    color: var(--text-color);
  }

  .sql-empty {
    min-height: 500px;
    padding: 48px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: radial-gradient(circle at 50% 20%, rgba(97, 92, 237, 0.12), transparent 34%), var(--card-background);
    text-align: center;
  }

  .sql-empty__visual {
    position: relative;
    width: 116px;
    height: 100px;
  }

  .sql-empty__visual span {
    position: absolute;
    z-index: 2;
    top: 16px;
    left: 28px;
    width: 60px;
    height: 60px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(97, 92, 237, 0.25);
    border-radius: 18px;
    color: var(--primary-color);
    background: var(--card-background);
    box-shadow: 0 18px 55px rgba(62, 56, 170, 0.18);
  }

  .sql-empty__visual i {
    position: absolute;
    width: 34px;
    height: 34px;
    border: 1px solid rgba(97, 92, 237, 0.18);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
    transform: rotate(14deg);
  }

  .sql-empty__visual i:nth-child(2) {
    top: 4px;
    left: 6px;
  }
  .sql-empty__visual i:nth-child(3) {
    top: 4px;
    right: 5px;
    transform: rotate(-14deg);
  }
  .sql-empty__visual i:nth-child(4) {
    right: 8px;
    bottom: 0;
    transform: rotate(20deg);
  }

  .sql-empty__copy {
    max-width: 620px;
    display: grid;
    justify-items: center;
    gap: 9px;
  }

  .sql-empty h2,
  .sql-empty p {
    margin: 0;
  }
  .sql-empty h2 {
    font-size: clamp(24px, 3vw, 36px);
    letter-spacing: -0.04em;
  }
  .sql-empty p,
  .sql-empty > small {
    color: var(--desc-color);
  }
  .sql-empty p {
    line-height: 1.7;
  }
  .sql-empty > small {
    font-size: 11px;
  }

  .sql-source-panel,
  .sql-console,
  .sql-result-panel {
    min-width: 0;
    padding: 15px;
    display: grid;
    gap: 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }

  .sql-source-panel > header,
  .sql-console > header,
  .sql-result-panel > header,
  .sql-source-panel > header > div,
  .sql-console > header > div,
  .sql-result-panel > header > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .sql-source-panel > header > div:first-child,
  .sql-console > header > div:first-child,
  .sql-result-panel > header > div:first-child {
    justify-content: flex-start;
  }

  .sql-section-index {
    width: 28px;
    height: 28px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 8px;
    color: #fff;
    background: var(--primary-color);
    font-size: 10px;
    font-weight: 750;
  }

  .sql-source-panel header small,
  .sql-console header small,
  .sql-result-panel header small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .sql-source-panel__actions,
  .sql-result-actions,
  .sql-recipes {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
  }

  .sql-engine-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sql-engine-status i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .sql-source-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .sql-source-card {
    min-width: 0;
    padding: 10px;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }

  .sql-source-card > span {
    width: 35px;
    height: 35px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--card-background);
  }

  .sql-source-card > div {
    min-width: 0;
    margin-right: auto;
    display: grid;
    gap: 2px;
  }
  .sql-source-card strong,
  .sql-source-card small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sql-source-card small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .sql-schema-strip {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .sql-schema-strip > div {
    min-width: 0;
    padding: 9px 11px;
    display: grid;
    grid-template-columns: auto auto auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    border-left: 3px solid var(--primary-color);
    border-radius: 8px;
    background: var(--workspace-panel-bg-color);
    font-size: 11px;
  }

  .sql-schema-strip span,
  .sql-schema-strip small {
    color: var(--desc-color);
  }
  .sql-schema-strip small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sql-console :deep(textarea) {
    min-height: 230px;
    resize: vertical;
    border-color: var(--surface-border-color);
    background: #151724;
    color: #edf0ff;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    line-height: 1.7;
  }

  .sql-console__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .sql-console__footer > span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .sql-console__footer .b_btn small {
    margin-left: 7px;
    opacity: 0.7;
  }

  .sql-error {
    padding: 13px 15px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    border: 1px solid #dc4c4c;
    border-radius: 13px;
    color: #c13838;
    background: var(--card-background);
  }

  .sql-error > span {
    width: 28px;
    height: 28px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 50%;
    background: rgba(220, 76, 76, 0.1);
  }
  .sql-error > div {
    min-width: 0;
    margin-right: auto;
  }
  .sql-error p {
    margin: 3px 0 0;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .sql-result-state {
    min-height: 260px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px dashed var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
    text-align: center;
  }

  .sql-result-state p {
    max-width: 560px;
    margin: 0;
    color: var(--desc-color);
    font-size: 11px;
  }
  .sql-result-state.is-idle > span {
    color: var(--primary-color);
    opacity: 0.7;
  }

  .sql-result-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
    align-items: center;
    gap: 8px;
  }

  .sql-result-facts > div {
    padding: 10px 12px;
    display: grid;
    gap: 3px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .sql-result-facts span {
    color: var(--desc-color);
    font-size: 10px;
  }
  .sql-result-facts strong {
    font-size: 18px;
  }
  .sql-result-table {
    min-width: 0;
  }
  .sql-result-mobile {
    display: none;
  }
  .sql-preview-note {
    margin: 0;
    color: var(--desc-color);
    font-size: 10px;
  }

  @media (max-width: 767px) {
    .sql-stagebar {
      grid-template-columns: 1fr;
    }
    .sql-stagebar__item small {
      white-space: normal;
    }
    .sql-empty {
      min-height: 440px;
      padding: 38px 18px;
    }
    .sql-source-panel > header,
    .sql-console > header,
    .sql-result-panel > header,
    .sql-console__footer {
      align-items: stretch;
      flex-direction: column;
    }
    .sql-source-panel__actions {
      width: 100%;
    }
    .sql-source-grid,
    .sql-schema-strip,
    .sql-result-facts {
      grid-template-columns: 1fr;
    }
    .sql-schema-strip > div {
      grid-template-columns: auto auto auto;
    }
    .sql-schema-strip small {
      grid-column: 1 / -1;
    }
    .sql-console :deep(textarea) {
      min-height: 260px;
    }
    .sql-console__footer .b_btn {
      width: 100%;
    }
    .sql-result-table {
      display: none;
    }
    .sql-result-mobile {
      display: grid;
      gap: 8px;
    }
    .sql-result-mobile article {
      padding: 11px;
      display: grid;
      gap: 7px;
      border: 1px solid var(--surface-border-color);
      border-radius: 11px;
      background: var(--workspace-panel-bg-color);
    }
    .sql-result-mobile article > div {
      display: grid;
      grid-template-columns: minmax(80px, 0.38fr) minmax(0, 1fr);
      gap: 9px;
      font-size: 11px;
    }
    .sql-result-mobile span {
      color: var(--desc-color);
      overflow-wrap: anywhere;
    }
    .sql-result-mobile strong {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }

  html.light-note-mobile-rendering .sql-empty,
  html.light-note-mobile-rendering .sql-source-panel,
  html.light-note-mobile-rendering .sql-console,
  html.light-note-mobile-rendering .sql-result-panel {
    box-shadow: none;
  }
</style>
