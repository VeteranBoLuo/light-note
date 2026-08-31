import type { AsyncDuckDB, AsyncDuckDBConnection, DuckDBBundles } from '@duckdb/duckdb-wasm';

export const BROWSER_SQL_MAX_FILES = 4;
export const BROWSER_SQL_MAX_BYTES = 80 * 1024 * 1024;
export const BROWSER_SQL_MAX_RESULT_ROWS = 5_000;
export const BROWSER_SQL_PREVIEW_ROWS = 200;

export type BrowserSqlCell = string | number | boolean | null;

export interface BrowserSqlColumn {
  name: string;
  type: string;
}

export interface BrowserSqlTable {
  name: string;
  sourceName: string;
  sourceBytes: number;
  rowCount: number;
  columns: BrowserSqlColumn[];
}

export interface BrowserSqlResult {
  columns: string[];
  rows: Array<Record<string, BrowserSqlCell>>;
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
}

export interface BrowserDuckDbRuntime {
  db: AsyncDuckDB;
  connection: AsyncDuckDBConnection;
  version: string;
}

function normalizeCell(value: unknown): BrowserSqlCell {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value, (part) => part.toString(16).padStart(2, '0')).join('')}`;
  }
  if (Array.isArray(value)) return JSON.stringify(value.map(normalizeCell));
  try {
    return JSON.stringify(value, (_, nested) => (typeof nested === 'bigint' ? nested.toString() : nested));
  } catch {
    return String(value);
  }
}

export function normalizeArrowRows(
  table: { schema: { fields: Array<{ name: string }> }; toArray(): unknown[] },
  limit = BROWSER_SQL_MAX_RESULT_ROWS + 1,
) {
  const columns = table.schema.fields.map((field) => field.name);
  const values = table.toArray().slice(0, limit);
  return {
    columns,
    rows: values.map((row) => {
      const record = row as Record<string, unknown>;
      return Object.fromEntries(columns.map((column) => [column, normalizeCell(record[column])])) as Record<
        string,
        BrowserSqlCell
      >;
    }),
  };
}

/**
 * 本地 SQL 工作台只开放单条只读分析语句，避免 SQL 主动访问网络、写文件或改变内存数据库。
 * 数据视图由受控代码创建，用户查询最终包在 LIMIT 子查询中执行。
 */
export function normalizeReadOnlySql(input: string) {
  const sql = String(input || '').trim();
  if (!sql) throw new Error('EMPTY_SQL');
  if (sql.length > 100_000) throw new Error('SQL_TOO_LONG');
  const withoutTrailingSemicolon = sql.replace(/;\s*$/u, '').trim();
  if (withoutTrailingSemicolon.includes(';')) throw new Error('MULTIPLE_STATEMENTS');
  if (!/^(select|with)\b/iu.test(withoutTrailingSemicolon)) throw new Error('READ_ONLY_SQL_REQUIRED');
  if (
    /\b(attach|call|checkpoint|copy|create|delete|detach|drop|export|force|import|insert|install|load|set|truncate|update|vacuum)\b/iu.test(
      withoutTrailingSemicolon,
    )
  ) {
    throw new Error('READ_ONLY_SQL_REQUIRED');
  }
  if (/(?:https?|s3|gs|azure|hf):\/\//iu.test(withoutTrailingSemicolon) || /\b(?:from|join)\s+'/iu.test(sql)) {
    throw new Error('REMOTE_SOURCE_BLOCKED');
  }
  if (
    /\b(?:(?:read|scan|sniff|parquet|http|postgres|mysql|sqlite|iceberg|delta|azure|s3)_[a-z0-9_]*|[a-z0-9_]+_scan|glob)\s*\(/iu.test(
      withoutTrailingSemicolon,
    )
  ) {
    throw new Error('REMOTE_SOURCE_BLOCKED');
  }
  return withoutTrailingSemicolon;
}

export function buildLimitedBrowserSql(input: string, maxRows = BROWSER_SQL_MAX_RESULT_ROWS) {
  const sql = normalizeReadOnlySql(input);
  return `SELECT * FROM (${sql}) AS "__lightnote_result" LIMIT ${Math.max(1, maxRows + 1)}`;
}

function quoteCsv(value: BrowserSqlCell) {
  if (value == null) return '';
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

export function browserSqlResultToCsv(result: Pick<BrowserSqlResult, 'columns' | 'rows'>) {
  return [
    result.columns.map(quoteCsv).join(','),
    ...result.rows.map((row) => result.columns.map((column) => quoteCsv(row[column] ?? null)).join(',')),
  ].join('\n');
}

export function tableNameForIndex(index: number) {
  return index === 0 ? 'data' : `data_${index + 1}`;
}

export function internalFileName(file: Pick<File, 'name'>, index: number) {
  const extension = file.name.toLocaleLowerCase().match(/\.(csv|json|parquet)$/u)?.[1];
  if (!extension) throw new Error('UNSUPPORTED_FILE');
  return `lightnote_source_${index + 1}.${extension}`;
}

export async function createBrowserDuckDb(): Promise<BrowserDuckDbRuntime> {
  const [duckdb, mvpModule, mvpWorker, ehModule, ehWorker] = await Promise.all([
    import('@duckdb/duckdb-wasm'),
    import('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'),
    import('@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'),
    import('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'),
    import('@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'),
  ]);
  const bundles: DuckDBBundles = {
    mvp: { mainModule: mvpModule.default, mainWorker: mvpWorker.default },
    eh: { mainModule: ehModule.default, mainWorker: ehWorker.default },
  };
  const bundle = await duckdb.selectBundle(bundles);
  if (!bundle.mainWorker) throw new Error('WORKER_UNAVAILABLE');
  const worker = new Worker(bundle.mainWorker);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const connection = await db.connect();
    const version = await db.getVersion();
    return { db, connection, version };
  } catch (error) {
    await db.terminate().catch(() => undefined);
    throw error;
  }
}

export async function destroyBrowserDuckDb(runtime: BrowserDuckDbRuntime | null) {
  if (!runtime) return;
  await runtime.connection.close().catch(() => undefined);
  await runtime.db.terminate().catch(() => undefined);
}

function sourceReader(internalName: string) {
  if (internalName.endsWith('.csv')) return `read_csv_auto('${internalName}', header = true)`;
  if (internalName.endsWith('.json')) return `read_json_auto('${internalName}')`;
  if (internalName.endsWith('.parquet')) return `read_parquet('${internalName}')`;
  throw new Error('UNSUPPORTED_FILE');
}

export async function importBrowserSqlFiles(runtime: BrowserDuckDbRuntime, files: File[]) {
  if (files.length === 0) return [];
  if (files.length > BROWSER_SQL_MAX_FILES) throw new Error('TOO_MANY_FILES');
  if (files.reduce((sum, file) => sum + file.size, 0) > BROWSER_SQL_MAX_BYTES) throw new Error('TOO_LARGE');
  await runtime.db.dropFiles().catch(() => undefined);
  const existingViews = await runtime.connection.query(
    "SELECT table_name FROM information_schema.views WHERE table_schema = 'main' AND table_name LIKE 'data%'",
  );
  const existing = normalizeArrowRows(existingViews).rows;
  for (const row of existing) {
    const name = String(row.table_name || '').replace(/"/gu, '');
    if (name) await runtime.connection.query(`DROP VIEW IF EXISTS "${name}"`);
  }

  const tables: BrowserSqlTable[] = [];
  for (const [index, file] of files.entries()) {
    const internalName = internalFileName(file, index);
    const tableName = tableNameForIndex(index);
    await runtime.db.registerFileBuffer(internalName, new Uint8Array(await file.arrayBuffer()));
    await runtime.connection.query(`CREATE VIEW "${tableName}" AS SELECT * FROM ${sourceReader(internalName)}`);
    const [description, countResult] = await Promise.all([
      runtime.connection.query(`DESCRIBE SELECT * FROM "${tableName}"`),
      runtime.connection.query(`SELECT count(*) AS row_count FROM "${tableName}"`),
    ]);
    const columns = normalizeArrowRows(description).rows.map((row) => ({
      name: String(row.column_name || ''),
      type: String(row.column_type || ''),
    }));
    const countRow = normalizeArrowRows(countResult).rows[0];
    tables.push({
      name: tableName,
      sourceName: file.name,
      sourceBytes: file.size,
      rowCount: Number(countRow?.row_count || 0),
      columns,
    });
  }
  return tables;
}

export async function executeBrowserSql(runtime: BrowserDuckDbRuntime, sql: string): Promise<BrowserSqlResult> {
  const startedAt = performance.now();
  const table = await runtime.connection.query(buildLimitedBrowserSql(sql));
  const normalized = normalizeArrowRows(table, BROWSER_SQL_MAX_RESULT_ROWS + 1);
  const truncated = normalized.rows.length > BROWSER_SQL_MAX_RESULT_ROWS;
  const rows = truncated ? normalized.rows.slice(0, BROWSER_SQL_MAX_RESULT_ROWS) : normalized.rows;
  return {
    columns: normalized.columns,
    rows,
    rowCount: rows.length,
    truncated,
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
  };
}
