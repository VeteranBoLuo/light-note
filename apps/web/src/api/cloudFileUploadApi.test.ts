import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { apiBasePost } from '@/http/request';
import { ensureCloudFolder, fetchCloudFolders, uploadCloudFile, uploadManagedCloudFile } from './cloudFileUploadApi';

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

  it('读取可选云空间文件夹并过滤无效项', async () => {
    postMock.mockResolvedValue({
      status: 200,
      msg: '',
      data: {
        items: [
          { id: 7, name: '资料', fullPath: '工作 / 资料' },
          { id: null, name: '无效' },
          { id: 9, name: '  ' },
        ],
      },
    });

    await expect(fetchCloudFolders()).resolves.toEqual([{ id: '7', name: '工作 / 资料' }]);
    expect(postMock).toHaveBeenCalledWith('/api/file/queryFolder', { filters: {}, treeVersion: 2 }, { silent: true });
  });

  it('托管上传把自定义名称、随机对象键、目录和上传进度带入安全确认链路', async () => {
    postMock
      .mockResolvedValueOnce({
        status: 200,
        msg: '',
        data: {
          filename: '项目资料.pdf',
          fileType: 'application/pdf',
          objectKey: 'files/user-1/uploads/random.pdf',
          uploadUrl: 'https://obs.example/managed',
          headers: { 'x-test': '1' },
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        msg: '',
        data: { filename: '项目资料 (1).pdf', status: '已上传', fileId: 27 },
      });
    putMock.mockImplementation(async (_url, _file, config: any) => {
      config.onUploadProgress({ loaded: 5, total: 10 });
      return {} as never;
    });
    const progress = vi.fn();
    const file = new File(['document'], '原始名称.pdf', { type: 'application/pdf' });

    await expect(
      uploadManagedCloudFile(file, {
        fileName: '项目资料.pdf',
        folderId: '7',
        onProgress: progress,
        addToInbox: true,
        inboxSource: 'browser_extension',
      }),
    ).resolves.toEqual({ filename: '项目资料 (1).pdf', status: '已上传', fileId: '27' });
    expect(progress).toHaveBeenCalledWith(50);
    expect(progress).toHaveBeenLastCalledWith(100);
    expect(postMock).toHaveBeenLastCalledWith(
      '/api/file/confirmManagedUpload',
      {
        objectKey: 'files/user-1/uploads/random.pdf',
        fileName: '项目资料.pdf',
        fileType: 'application/pdf',
        folderId: '7',
        addToInbox: true,
        inboxSource: 'browser_extension',
      },
      { silent: true },
    );
  });

  it('托管上传确认失败时调用安全中止接口清理未落库对象', async () => {
    postMock
      .mockResolvedValueOnce({
        status: 200,
        data: {
          fileType: 'text/plain',
          objectKey: 'files/user-1/uploads/random.txt',
          uploadUrl: 'https://obs.example/managed',
        },
      })
      .mockResolvedValueOnce({ status: 409, msg: '确认失败', data: null })
      .mockResolvedValueOnce({ status: 200, data: { deleted: true } });
    putMock.mockResolvedValue({} as never);

    await expect(uploadManagedCloudFile(new File(['x'], 'x.txt'), {})).rejects.toThrow('确认失败');
    expect(postMock).toHaveBeenLastCalledWith(
      '/api/file/abortManagedUpload',
      { objectKey: 'files/user-1/uploads/random.txt' },
      { silent: true },
    );
  });

  it('托管上传确认回包丢失但对象已落库时从中止核验恢复原文件', async () => {
    postMock
      .mockResolvedValueOnce({
        status: 200,
        data: {
          fileType: 'text/plain',
          objectKey: 'files/user-1/uploads/random.txt',
          uploadUrl: 'https://obs.example/managed',
        },
      })
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        status: 200,
        data: { deleted: false, alreadyConfirmed: true, fileId: 32, filename: 'x.txt' },
      });
    putMock.mockResolvedValue({} as never);

    await expect(uploadManagedCloudFile(new File(['x'], 'x.txt'), {})).resolves.toEqual({
      filename: 'x.txt',
      status: '已上传',
      fileId: '32',
    });
  });
});
