import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractionSchemaReady, requireExtractionSchema } from './schema.js';
import { ensureToolboxSchema } from '../toolboxSchema.js';
import { listToolboxHomeTasks } from '../toolbox/service.js';
import { createExtraction, listExtractions } from './service.js';
import { cleanupExtractionMaterials, runSingleExtractionJob } from './worker.js';
import { resourcePage } from '../dataExport/resources.js';

const dbError = (code) => Object.assign(new Error('private database details'), { code });
function missingDatabase(code = 'ER_NO_SUCH_TABLE') {
  return {
    query: vi.fn(async (sql) => {
      if (/toolbox_extraction/.test(sql)) throw dbError(code);
      return [[]];
    }),
    getConnection: vi.fn(),
  };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('资料转表格未安装时隔离影响范围', () => {
  it('共享 API/文档 Worker 的工坊初始化不要求或自动安装提取表', async () => {
    const db = missingDatabase();
    await expect(ensureToolboxSchema(db)).resolves.toBeUndefined();
    expect(db.query.mock.calls.length).toBeGreaterThan(0);
    expect(db.query.mock.calls.some(([sql]) => /toolbox_extraction/.test(sql))).toBe(false);
  });

  it.each(['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'])('%s 时首页保留旧任务，提取 Worker 与清理不写入', async (code) => {
    vi.stubEnv('TOOLBOX_EXTRACTION_ENABLED', 'true');
    vi.stubEnv('LIGHTNOTE_RUNTIME_ENV', 'test');
    const db = missingDatabase(code);
    db.query.mockResolvedValueOnce([[{ id: 'old-job', tool_id: 'research_brief', status: 'queued' }]]);
    const home = await listToolboxHomeTasks({ userId: 'owner', database: db });
    expect(home.active.map((job) => job.id)).toEqual(['old-job']);
    await expect(runSingleExtractionJob('worker', db)).resolves.toBe(false);
    await expect(cleanupExtractionMaterials(db)).resolves.toBeUndefined();
    expect(db.getConnection).not.toHaveBeenCalled();
    expect(db.query.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  });

  it('启用开关也不能在缺表时创建任务，读取返回稳定原因，账号导出不静默忽略所选数据', async () => {
    vi.stubEnv('TOOLBOX_EXTRACTION_ENABLED', 'true');
    const db = missingDatabase();
    for (const work of [
      () => createExtraction({ userId: 'owner', input: {}, database: db }),
      () => listExtractions({ userId: 'owner', database: db }),
      () => resourcePage(db, 'owner', 'extractions'),
    ]) {
      await expect(work()).rejects.toMatchObject({ code: 'EXTRACTION_SCHEMA_NOT_READY', status: 503 });
    }
    expect(db.getConnection).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('开关关闭但结构存在时，继续读取已有提取表和清理临时材料', async () => {
    vi.stubEnv('TOOLBOX_EXTRACTION_ENABLED', 'false');
    const db = {
      query: vi.fn(async (sql) =>
        sql.includes('SELECT * FROM toolbox_extractions')
          ? [[{ id: 'saved', title: '已有结果', version: 1, data_version: 1 }]]
          : [[]],
      ),
    };
    await expect(listExtractions({ userId: 'owner', database: db })).resolves.toEqual([
      expect.objectContaining({ id: 'saved', title: '已有结果' }),
    ]);
    await cleanupExtractionMaterials(db);
    expect(db.query.mock.calls.at(-1)[0]).toMatch(/^UPDATE toolbox_extraction_sources/);
  });

  it('并发探测复用结果，显式安装后在缓存过期时重新检查', async () => {
    vi.useFakeTimers();
    const db = missingDatabase();
    await expect(Promise.all([extractionSchemaReady(db), extractionSchemaReady(db)])).resolves.toEqual([false, false]);
    expect(db.query).toHaveBeenCalledTimes(1);
    db.query.mockResolvedValue([[]]);
    vi.advanceTimersByTime(30001);
    await expect(requireExtractionSchema(db)).resolves.toBeUndefined();
    expect(db.query).toHaveBeenCalledTimes(5);
  });

  it.each(['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_TABLEACCESS_DENIED_ERROR'])(
    '不掩盖 %s，也不缓存连接/权限故障',
    async (code) => {
      const db = missingDatabase(code);
      await expect(extractionSchemaReady(db)).rejects.toMatchObject({ code });
      db.query.mockResolvedValue([[]]);
      await expect(extractionSchemaReady(db)).resolves.toBe(true);
    },
  );
});
