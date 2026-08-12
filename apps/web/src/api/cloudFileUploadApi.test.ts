import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { apiBasePost } from '@/http/request';
import { ensureCloudFolder, uploadCloudFile } from './cloudFileUploadApi';

vi.mock('axios', () => ({ default: { put: vi.fn() } }));
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));

const postMock = vi.mocked(apiBasePost);
const putMock = vi.mocked(axios.put);

describe('cloudFileUploadApi', () => {
  beforeEach(() => {
    postMock.mockReset();
    putMock.mockReset();
  });

  it('查找或创建同名目录并规范化返回值', async () => {
    postMock.mockResolvedValue({ status: 200, msg: '', data: { id: 7, name: '周报', created: true } });

    await expect(ensureCloudFolder('周报')).resolves.toEqual({ id: '7', name: '周报', created: true });
    expect(postMock).toHaveBeenCalledWith('/api/file/ensureFolder', { name: '周报' }, { silent: true });
  });

  it('通过预签名地址上传后确认到指定目录', async () => {
    postMock
      .mockResolvedValueOnce({
        status: 200,
        msg: '',
        data: [{ filename: '周报.png', fileType: 'image/png', uploadUrl: 'https://obs.example/upload', headers: {} }],
      })
      .mockResolvedValueOnce({
        status: 200,
        msg: '',
        data: [{ filename: '周报.png', status: '已上传', fileId: 19 }],
      });
    putMock.mockResolvedValue({} as never);
    const file = new File(['poster'], '周报.png', { type: 'image/png' });

    await expect(uploadCloudFile(file, '7')).resolves.toEqual({
      filename: '周报.png',
      status: '已上传',
      fileId: '19',
    });
    expect(putMock).toHaveBeenCalledWith('https://obs.example/upload', file, {
      headers: { 'Content-Type': 'image/png' },
    });
    expect(postMock).toHaveBeenLastCalledWith(
      '/api/file/confirmUpload',
      { files: [{ fileName: '周报.png', fileType: 'image/png', fileSize: file.size }], folderId: '7' },
      { silent: true },
    );
  });

  it('确认响应没有落库结果时拒绝成功', async () => {
    postMock
      .mockResolvedValueOnce({
        status: 200,
        msg: '',
        data: [{ filename: '周报.png', fileType: 'image/png', uploadUrl: 'https://obs.example/upload' }],
      })
      .mockResolvedValueOnce({ status: 200, msg: '', data: [{ status: '处理失败', error: 'invalid' }] });
    putMock.mockResolvedValue({} as never);

    await expect(uploadCloudFile(new File(['poster'], '周报.png', { type: 'image/png' }), '7')).rejects.toThrow(
      'invalid',
    );
  });
});
