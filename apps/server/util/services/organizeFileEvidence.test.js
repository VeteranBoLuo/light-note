import { describe, expect, it, vi } from 'vitest';
vi.mock('../aiDocument/service.js', () => ({ attachCloudDocumentSource: vi.fn() }));
import {
  hasMeaningfulFileName,
  prepareOrganizeFile,
  fileReadingState,
  applyVisualEvidence,
  plannedVisualPages,
  understandOrganizeFile,
} from './organizeFileEvidence.js';
const snapshot = (title = '面试准备.md') => ({ id: '1', type: 'file', title, source: { title, text: '' } });
const file = { id: 1, file_name: '面试准备.md', file_type: 'text/markdown', file_size: 7500, obs_key: 'object' };
const source = {
  id: 'source',
  file_id: 1,
  user_id: 'u',
  object_key: 'object',
  file_size: 7500,
  file_name: file.file_name,
  status: 'queued',
};
function database(existing = source) {
  return {
    query: vi.fn(async (sql) =>
      sql.startsWith('SELECT id,file_name')
        ? [[file]]
        : sql.startsWith('SELECT')
          ? [existing ? [existing] : []]
          : [{ affectedRows: 1 }],
    ),
  };
}
it.each([
  '2026-7-13.png',
  'paste_1785987803011.png',
  'IMG_20260909.jpg',
  '167346132413.jpeg',
  'a34345bc667fedcb12abcd999.png',
])('自动名称不能为主题提供依据：%s', (name) => expect(hasMeaningfulFileName(name)).toBe(false));
it.each(['主卧灯.jpg', '嚣张表情包.jpeg', '面试准备-03-可视化.md', '2026跑步记录.pdf'])(
  '保留有语义的文件名：%s',
  (name) => expect(hasMeaningfulFileName(name)).toBe(true),
);
it('等待解析只查一次，不轮询、不重新入队、不运行识图', async () => {
  const attach = vi.fn();
  const db = database();
  const result = await prepareOrganizeFile(db, 'u', snapshot(), {}, { attach });
  expect(result).toMatchObject({ waiting: true, reading: { state: 'waiting', sourceId: 'source' } });
  expect(attach).not.toHaveBeenCalled();
  expect(db.query).toHaveBeenCalledTimes(2);
});
it('首次整理自动创建缺失解析来源', async () => {
  const db = database(null);
  const attach = vi.fn(async () => {
    db.query.mockImplementation(async (sql) => (sql.startsWith('SELECT') ? [[source]] : [{ affectedRows: 1 }]));
    return { id: 'source' };
  });
  expect(await prepareOrganizeFile(db, 'u', snapshot(), {}, { attach })).toMatchObject({ waiting: true });
  expect(attach).toHaveBeenCalledWith({ userId: 'u', fileId: '1', refresh: false });
});
it('任务等待超时有明确终态，不无限重置', async () => {
  expect(await prepareOrganizeFile(database(), 'u', snapshot(), { startedAt: Date.now() - 31 * 60000 })).toMatchObject({
    reading: { reasonCode: 'DOCUMENT_PREPARATION_TIMEOUT' },
  });
});
it('已尝试解析的失败来源不在轮询中再次重置', async () => {
  const attach = vi.fn();
  const result = await prepareOrganizeFile(
    database({ ...source, status: 'failed', error_code: 'FILE_CONTENT_INVALID' }),
    'u',
    snapshot(),
    { sourceId: 'source' },
    { attach },
  );
  expect(attach).not.toHaveBeenCalled();
  expect(result.reading).toMatchObject({ complete: false, reasonCode: 'FILE_CONTENT_INVALID' });
});
it('PDF 补读仅选择缺失页，可靠文本与空白页不重复识别', () => {
  const pdf = {
    ...source,
    file_name: '图纸.pdf',
    coverage_metadata: {
      total: { pages: 4 },
      processed: { pages: 2 },
      complete: false,
      pdf: { missingPages: [2, 4], blankPages: [3] },
    },
  };
  expect(plannedVisualPages(pdf)).toEqual([2, 4]);
  expect(fileReadingState(pdf, { source: { text: '门窗图纸' } })).toMatchObject({
    state: 'partial',
    readPages: 2,
    missingPages: [2, 4],
  });
});
it('不同对象的视觉缓存不能作为当前证据', () => {
  const image = { ...source, file_name: '狗.jpg' };
  expect(fileReadingState(image, snapshot(), { key: 'old-object', pages: [{ page: 1, subject: '狗' }] })).toMatchObject(
    { complete: false, state: 'metadata' },
  );
});
it('视觉描述单独传递，不改写正文且不使用不确定片段', () => {
  const original = { ...snapshot(), source: { text: '原文' } };
  const next = applyVisualEvidence(original, {
    reading: { state: 'visual' },
    cache: { pages: [{ page: 1, subject: '狗狗表情包', uncertainSegments: ['不能确定的人名'] }] },
  });
  expect(next.source.text).toBe('原文');
  expect(next.source.visualEvidence[0].content).toContain('狗狗表情包');
  expect(next.source.visualEvidence[0].content).not.toContain('不能确定');
});
it('视觉缓存保存按 owner、对象和租约围栏复核，租约总是释放', async () => {
  const db = database();
  const beforeCall = vi.fn();
  const prepared = {
    source: { ...source, file_name: '狗.jpg' },
    cache: { key: 'fixture', pages: [] },
    visualPages: [1],
    reading: {},
  };
  const result = await understandOrganizeFile(db, 'u', snapshot('狗.jpg'), prepared, beforeCall, {
    metadata: async () => ({ contentLength: 7500 }),
    download: async () => Buffer.from('fixture'),
    recognize: async () => ({ subject: '狗', text: '', scene: '', purpose: '表情包', blank: false }),
  });
  expect(beforeCall).toHaveBeenCalledTimes(1);
  const saved = db.query.mock.calls.find(([sql]) => sql.includes('SET visual_evidence_json'));
  expect(saved[0]).toContain('ds.user_id=?');
  expect(saved[0]).toContain('ds.visual_lease_token=?');
  expect(saved[0]).toContain('f.del_flag=0');
  expect(saved[1].slice(1, 4)).toEqual(['source', 'u', 'object']);
  expect(db.query.mock.calls.at(-1)[0]).toContain('visual_lease_token=NULL');
  expect(result.source.visualEvidence[0].content).toContain('狗');
});

it('视觉页面部分失败保留其他页，不自动重试失败页面', async () => {
  const db = database();
  const pdf = {
    ...source,
    file_name: '图纸.pdf',
    coverage_metadata: { total: { pages: 3 }, processed: { pages: 0 }, pdf: { missingPages: [1, 2, 3] } },
  };
  const prepared = { source: pdf, cache: { key: 'fixture', pages: [] }, visualPages: [1, 2, 3], reading: {} };
  const recognize = vi
    .fn()
    .mockResolvedValueOnce({ subject: '窗户', blank: false })
    .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'AI_GATEWAY_TIMEOUT' }))
    .mockResolvedValueOnce({ subject: '门', blank: false });
  const result = await understandOrganizeFile(db, 'u', snapshot('图纸.pdf'), prepared, async () => {}, {
    metadata: async () => ({ contentLength: 7500 }),
    download: async () => Buffer.from('pdf'),
    recognize,
    render: async (_buffer, pages, each) => {
      for (const page of pages) await each(Buffer.from('image'), page);
      return [];
    },
  });
  expect(recognize).toHaveBeenCalledTimes(3);
  expect(prepared.cache.pages.map((page) => page.page)).toEqual([1, 3]);
  expect(result.source.visualEvidence).toHaveLength(2);
  expect(result.reading.complete).toBe(false);
});
it('视觉额度或执行计划被拒绝后停止，不继续后续页面', async () => {
  const db = database();
  const prepared = {
    source: { ...source, file_name: '图纸.pdf' },
    cache: { key: 'fixture', pages: [] },
    visualPages: [1, 2],
    reading: {},
  };
  const recognize = vi
    .fn()
    .mockRejectedValue(Object.assign(new Error('limit'), { code: 'AI_EXECUTION_PROVIDER_CALL_LIMIT' }));
  await expect(
    understandOrganizeFile(db, 'u', snapshot(), prepared, async () => {}, {
      metadata: async () => ({ contentLength: 7500 }),
      download: async () => Buffer.from('pdf'),
      recognize,
      render: async (_buffer, pages, each) => {
        for (const page of pages) await each(Buffer.from('image'), page);
      },
    }),
  ).rejects.toMatchObject({ code: 'AI_EXECUTION_PROVIDER_CALL_LIMIT' });
  expect(recognize).toHaveBeenCalledTimes(1);
  expect(db.query.mock.calls.at(-1)[0]).toContain('visual_lease_token=NULL');
});
it('有效视觉缓存重复整理免识图，来源变化不能复用', async () => {
  const imageFile = { ...file, file_name: '狗.jpg', file_type: 'image/jpeg' };
  const imageSource = { ...source, file_name: '狗.jpg', status: 'ready' };
  const db = { query: vi.fn(async sql => sql.startsWith('SELECT id,file_name') ? [[imageFile]] : [[imageSource]]) };
  const first = await prepareOrganizeFile(db, 'u', snapshot('狗.jpg'));
  expect(first.visualPages).toEqual([1]);
  imageSource.visual_evidence_json = JSON.stringify({ ...first.cache, pages: [{ page: 1, subject: '狗', blank: false }] });
  const second = await prepareOrganizeFile(db, 'u', snapshot('狗.jpg'));
  expect(second.visualPages).toEqual([]);
  expect(second.reading).toMatchObject({ state: 'visual', complete: true });
  imageSource.id = 'replacement-source';
  expect((await prepareOrganizeFile(db, 'u', snapshot('狗.jpg'))).visualPages).toEqual([1]);
});
