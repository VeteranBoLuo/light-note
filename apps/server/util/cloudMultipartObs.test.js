import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  client: {
    initiateMultipartUpload: vi.fn(),
    completeMultipartUpload: vi.fn(),
    listParts: vi.fn(),
    abortMultipartUpload: vi.fn(),
    getObjectMetadata: vi.fn(),
    listMultipartUploads: vi.fn(),
    createSignedUrlSync: vi.fn(),
  },
}));
vi.mock('./obsClient.js', () => ({ obsClient: mock.client, bucketName: 'fixture' }));
import {
  initiateCloudMultipart,
  completeCloudMultipart,
  listCloudMultipartParts,
  abortCloudMultipart,
  headCloudMultipart,
  signCloudMultipartPart,
} from './cloudMultipartObs.js';
const response = (InterfaceResult, status = 200, code = '') => ({
  CommonMsg: { Status: status, Code: code },
  InterfaceResult,
});
beforeEach(() => {
  Object.values(mock.client).forEach((fn) => fn.mockReset());
});
afterEach(() => vi.unstubAllEnvs());
describe('OBS 分片响应与签名边界', () => {
  it('本机 S3 的 XML 引号实体还原后能作为同一分片的 ETag 提交', async () => {
    vi.stubEnv('LIGHTNOTE_LOCAL_TEST', '1');
    mock.client.listParts.mockImplementation((_p, cb) => cb(null, response({ Parts: [{ PartNumber: 1, ETag: '&#34;abc123&#34;' }] })));
    expect(await listCloudMultipartParts('key', 'upload')).toEqual([{ PartNumber: 1, ETag: '"abc123"' }]);
    vi.stubEnv('LIGHTNOTE_LOCAL_TEST', undefined);
    expect(await listCloudMultipartParts('key', 'upload')).toEqual([{ PartNumber: 1, ETag: '&#34;abc123&#34;' }]);
  });
  it('不能把 HTTP 200 但无合并结果当成功', async () => {
    mock.client.completeMultipartUpload.mockImplementation((_p, cb) => cb(null, response({})));
    await expect(completeCloudMultipart('key', 'upload', [{ PartNumber: 1, ETag: 'tag' }])).rejects.toMatchObject({
      code: 'OBS_MULTIPART_FAILED',
      status: 503,
    });
    mock.client.completeMultipartUpload.mockImplementation((_p, cb) =>
      cb(null, response({ ETag: 'valid' }, 200, 'InternalError')),
    );
    await expect(completeCloudMultipart('key', 'upload', [])).rejects.toMatchObject({ code: 'OBS_MULTIPART_FAILED' });
  });
  it('初始化绑定服务端会话；签名只授权指定对象、上传ID和段号', async () => {
    mock.client.initiateMultipartUpload.mockImplementation((p, cb) => {
      expect(p.Metadata).toEqual({ 'ln-upload-session': 'session' });
      cb(null, response({ UploadId: 'upload' }));
    });
    expect(await initiateCloudMultipart('key', 'session', 'application/zip')).toEqual({ UploadId: 'upload' });
    mock.client.createSignedUrlSync.mockReturnValue({
      SignedUrl: 'https://example.invalid/part',
      ActualSignedRequestHeaders: { Host: 'forbidden', 'Content-Type': 'application/zip' },
    });
    const ticket = signCloudMultipartPart('key', 'upload', 640, 'application/zip');
    expect(mock.client.createSignedUrlSync).toHaveBeenCalledWith(
      expect.objectContaining({ Method: 'PUT', Key: 'key', QueryParams: { uploadId: 'upload', partNumber: 640 } }),
    );
    expect(ticket.headers).toEqual({ 'Content-Type': 'application/zip' });
  });
  it('分片列表完整分页，分页游标不前进时失败关闭', async () => {
    mock.client.listParts
      .mockImplementationOnce((_p, cb) =>
        cb(null, response({ Parts: [{ PartNumber: 1 }], IsTruncated: true, NextPartNumberMarker: '1' })),
      )
      .mockImplementationOnce((_p, cb) => cb(null, response({ Parts: [{ PartNumber: 2 }], IsTruncated: false })));
    expect(await listCloudMultipartParts('key', 'upload')).toHaveLength(2);
    mock.client.listParts.mockImplementation((_p, cb) =>
      cb(null, response({ Parts: [], IsTruncated: true, NextPartNumberMarker: 0 })),
    );
    await expect(listCloudMultipartParts('key', 'upload')).rejects.toThrow('OBS_PART_LIST_INVALID');
  });
  it('已失效上传ID的终止可重放；HEAD 保留大整数与服务端标记', async () => {
    mock.client.abortMultipartUpload.mockImplementation((_p, cb) => cb(null, response({}, 404, 'NoSuchUpload')));
    await expect(abortCloudMultipart('key', 'upload')).resolves.toBeUndefined();
    mock.client.getObjectMetadata.mockImplementation((_p, cb) =>
      cb(null, response({ ContentLength: '10737418240', ETag: 'tag', Metadata: { 'ln-upload-session': 'session' } })),
    );
    expect(await headCloudMultipart('key')).toEqual({ size: 10737418240, etag: 'tag', sessionId: 'session' });
  });
});
