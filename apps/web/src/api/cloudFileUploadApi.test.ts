import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { apiBasePost } from '@/http/request';
import { createManagedUploadBatchRequest, ensureCloudFolder, fetchCloudFolders, uploadCloudFile, uploadManagedCloudFile } from './cloudFileUploadApi';

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

  it('确认与核验双重断网后，只核验原对象，不重复准备或 PUT', async () => {
    const file = new File(['x'], 'x.txt');
    const receipt = {};
    postMock.mockResolvedValueOnce({ status: 200, data: { objectKey: 'original', uploadUrl: 'https://upload.test/x' } })
      .mockRejectedValueOnce(new Error('confirm response lost'))
      .mockRejectedValueOnce(new Error('recovery offline'));
    putMock.mockResolvedValue({} as never);
    await expect(uploadManagedCloudFile(file, { receipt })).rejects.toThrow('confirm response lost');
    postMock.mockRejectedValueOnce(new Error('still offline'));
    await expect(uploadManagedCloudFile(file, { receipt })).rejects.toThrow('UPLOAD_RESULT_UNKNOWN');
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls.filter(([url]) => url.includes('prepareManaged'))).toHaveLength(1);
    postMock.mockResolvedValueOnce({ status: 200, data: { alreadyConfirmed: true, fileId: 42, filename: 'x.txt' } });
    await expect(uploadManagedCloudFile(file, { receipt })).resolves.toMatchObject({ fileId: '42' });
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(receipt).toEqual({ pending: undefined });
  });

  it('只有明确未落库时才重新上传；收据不能换文件使用', async () => {
    const file = new File(['x'], 'x.txt');
    const receipt = {};
    postMock.mockResolvedValueOnce({ status: 200, data: { objectKey: 'old', uploadUrl: 'https://upload.test/x' } })
      .mockRejectedValueOnce(new Error('confirm lost')).mockRejectedValueOnce(new Error('offline'));
    putMock.mockResolvedValue({} as never);
    await expect(uploadManagedCloudFile(file, { receipt })).rejects.toThrow();
    await expect(uploadManagedCloudFile(new File(['y'], 'x.txt'), { receipt })).rejects.toThrow('UPLOAD_RECEIPT_MISMATCH');
    postMock.mockResolvedValueOnce({ status: 200, data: { deleted: true, alreadyConfirmed: false } })
      .mockResolvedValueOnce({ status: 200, data: { objectKey: 'new', uploadUrl: 'https://upload.test/new' } })
      .mockResolvedValueOnce({ status: 200, data: { fileId: 43, filename: 'x.txt', status: '已上传' } });
    await expect(uploadManagedCloudFile(file, { receipt })).resolves.toMatchObject({ fileId: '43' });
    expect(putMock).toHaveBeenCalledTimes(2);
  });

});


describe('managed batch transport', () => {
  beforeEach(() => { postMock.mockReset(); putMock.mockReset(); });
  it('100 个同步小文件保持三并发，合并签名与确认至 68 次请求', async () => {
    postMock.mockImplementation(async (_url, body: any) => ({ status: 200, data: body.items.map(({ operation, payload }: any) => ({ status: 200, data: operation === 'prepareManagedUpload'
      ? { uploadUrl: 'https://obs.example/' + payload.fileName, objectKey: payload.fileName }
      : { fileId: payload.objectKey, filename: payload.fileName, status: '已上传' } })) } as any));
    putMock.mockResolvedValue({} as never);
    const batchRequest = createManagedUploadBatchRequest();
    let next = 0;const results: any[] = [];
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (next < 100) { const i = next++; results.push(await uploadManagedCloudFile(new File(['x'], i + '.txt'), { batchRequest })); }
    }));
    expect(results).toHaveLength(100);
    expect(new Set(results.map((item) => item.fileId)).size).toBe(100);
    expect(putMock).toHaveBeenCalledTimes(100);
    expect(postMock).toHaveBeenCalledTimes(68);
    expect(postMock.mock.calls.every(([url, body]: any) => url === '/api/file/managedUploadBatch' && body.items.length <= 3)).toBe(true);
  });
  it('确认整批响应丢失后按原对象恢复，不重新 PUT', async () => {
    postMock.mockImplementation(async (_url, body: any) => {
      if (body.items[0].operation === 'confirmManagedUpload') throw new Error('connection lost');
      return { status: 200, data: body.items.map(({ operation, payload }: any) => ({ status: 200, data: operation === 'prepareManagedUpload'
        ? { uploadUrl: 'https://obs.example/' + payload.fileName, objectKey: payload.fileName }
        : { alreadyConfirmed: true, fileId: payload.objectKey, filename: payload.objectKey } })) } as any;
    });
    putMock.mockResolvedValue({} as never);
    const batchRequest = createManagedUploadBatchRequest();
    const results = await Promise.all(['a','b','c'].map((name) => uploadManagedCloudFile(new File(['x'], name), { batchRequest, receipt: {} })));
    expect(results.map((item) => item.fileId)).toEqual(['a','b','c']);
    expect(putMock).toHaveBeenCalledTimes(3);
    expect(postMock).toHaveBeenCalledTimes(3);
  });
});


it('批次确认与核验都断网后，显式重试只核验原对象', async () => {
  postMock.mockReset();putMock.mockReset();let offline = true;
  postMock.mockImplementation(async (_url, body: any) => {
    if (body.items[0].operation === 'confirmManagedUpload' || (body.items[0].operation === 'abortManagedUpload' && offline)) throw new Error('offline');
    return { status: 200, data: body.items.map(({ operation, payload }: any) => ({ status: 200, data: operation === 'prepareManagedUpload'
      ? { uploadUrl: 'https://obs.example/' + payload.fileName, objectKey: payload.fileName }
      : { alreadyConfirmed: true, fileId: payload.objectKey, filename: payload.objectKey } })) } as any;
  });
  putMock.mockResolvedValue({} as never);
  const batchRequest = createManagedUploadBatchRequest();
  const entries = ['a','b','c'].map(name=>({file:new File(['x'],name),receipt:{}}));
  const first = await Promise.allSettled(entries.map(({file,receipt})=>uploadManagedCloudFile(file,{receipt,batchRequest})));
  expect(first.every(item=>item.status==='rejected')).toBe(true);
  offline = false;
  const recovered = await Promise.all(entries.map(({file,receipt})=>uploadManagedCloudFile(file,{receipt,batchRequest})));
  expect(recovered.map(item=>item.fileId)).toEqual(['a','b','c']);
  expect(putMock).toHaveBeenCalledTimes(3);
  expect(postMock).toHaveBeenCalledTimes(4);
});

it('批次回包数量不完整时拒绝整批，不把文件映射到别人的结果', async () => {
  postMock.mockReset();postMock.mockResolvedValue({status:200,data:[{status:200,data:{fileId:'wrong'}}]} as any);
  const batchRequest = createManagedUploadBatchRequest();
  const results = await Promise.allSettled(['a','b','c'].map(objectKey=>batchRequest('abortManagedUpload',{objectKey})));
  expect(results.every(item=>item.status==='rejected')).toBe(true);
});


describe('托管上传完成传输时取消', () => {
  it('取消后不再确认保存，清理对象并结束本次收据', async () => {
    postMock.mockReset();
    putMock.mockReset();
    const controller = new AbortController();
    const receipt = {};
    postMock.mockImplementation(async (url) => {
      if (url === '/api/file/prepareManagedUpload') return { status: 200, data: { objectKey: 'cancelled-object', uploadUrl: 'https://obs.example/upload' } } as any;
      if (url === '/api/file/abortManagedUpload') return { status: 200, data: { deleted: true } } as any;
      return { status: 200, data: { status: '已上传', fileId: 'unexpected' } } as any;
    });
    putMock.mockImplementation(async () => { controller.abort(); return {} as never; });
    await expect(uploadManagedCloudFile(new File(['test'], 'test.txt'), { signal: controller.signal, receipt })).rejects.toMatchObject({ name: 'AbortError' });
    expect(postMock.mock.calls.map(([url]) => url)).toEqual(['/api/file/prepareManagedUpload', '/api/file/abortManagedUpload']);
    expect(receipt).toEqual({ pending: undefined });
  });
});
