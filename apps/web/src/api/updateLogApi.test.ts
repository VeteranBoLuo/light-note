import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiBasePost = vi.hoisted(() => vi.fn());

vi.mock('@/http/request', () => ({ apiBasePost }));

const { listUpdateLogs, updateLogMarkdownSummaryItems } = await import('./updateLogApi');

describe('updateLogApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('优先使用新更新日志接口', async () => {
    const response = { status: 200, msg: '', data: { items: [{ id: 'log-1' }], source: 'update_logs' } };
    apiBasePost.mockResolvedValueOnce(response);

    await expect(listUpdateLogs()).resolves.toBe(response);
    expect(apiBasePost).toHaveBeenCalledTimes(1);
  });

  it('滚动发布期间新接口不存在时回退旧配置，并清洗旧 HTML 字段', async () => {
    apiBasePost.mockRejectedValueOnce({ response: { status: 404 } }).mockResolvedValueOnce({
      status: 200,
      msg: '',
      data: {
        jsonContent: JSON.stringify([
          { label: '<strong>旧版本</strong>', time: '2026-07-01', list: ['修复 <em>A</em>'] },
          { label: '新版本', time: '2026-07-28', list: ['新增 B'] },
        ]),
      },
    });

    const response = await listUpdateLogs();

    expect(apiBasePost).toHaveBeenNthCalledWith(2, '/api/json/getConfigByName', { name: '更新日志' }, { silent: true });
    expect(response.data.items).toEqual([
      expect.objectContaining({
        title: '新版本',
        publishDate: '2026-07-28',
        summary: '',
        highlights: ['新增 B'],
      }),
      expect.objectContaining({ title: '旧版本', summary: '', highlights: ['修复 A'] }),
    ]);
  });

  it('从 Markdown 列表生成兼容摘要，并忽略独立图片', () => {
    expect(
      updateLogMarkdownSummaryItems(
        ['## 更新内容', '1. **新增** [图片上传](https://example.com)', '- [x] 修复编辑回显', '![截图](/image.png)'].join(
          '\n',
        ),
        4,
      ),
    ).toEqual(['新增 图片上传', '修复编辑回显']);
  });
});
