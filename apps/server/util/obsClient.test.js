import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => {
  process.env.OBS_AK = 'test-ak';
  process.env.OBS_SK = 'test-sk';
  process.env.OBS_ENDPOINT = 'https://obs.test';
  process.env.OBS_BUCKET_NAME = 'test-bucket';

  const getObject = vi.fn();
  const copyObject = vi.fn();
  const putObject = vi.fn();
  const getObjectMetadata = vi.fn();
  const sign = vi.fn(() => ({ SignedUrl: 'https://obs.test/signed' }));
  class MockObsClient {
    createSignedUrlSync(params) {
      return sign(params);
    }
    copyObject(...args) {
      return copyObject(...args);
    }
    getObject(...args) {
      return getObject(...args);
    }

    putObject(...args) {
      return putObject(...args);
    }
    getObjectMetadata(...args) {
      return getObjectMetadata(...args);
    }
  }
  return { getObject, copyObject, putObject, getObjectMetadata, sign, MockObsClient };
});

vi.mock('esdk-obs-nodejs', () => ({ default: sdk.MockObsClient }));

import {
  createDownloadSignedUrl,
  copyObjectInObs,
  getBoundedObjectBufferFromObs,
  getObjectBufferFromObs,
  getObjectRangeFromObs,
  putObjectBodyToObs,
  getObjectMetadataFromObs,
} from './obsClient.js';

it.each([undefined, '', -1, '12', '0'])('HEAD 元数据缺失不能被默认为空文件：%s', async (contentLength) => {
  sdk.getObjectMetadata.mockImplementationOnce((_params, callback) => callback(null, {
    CommonMsg: { Status: 200 }, InterfaceResult: { ContentLength: contentLength },
  }));
  const result = await getObjectMetadataFromObs('files/u/uploads/test');
  if (contentLength == null || contentLength === '') expect(result.contentLength).toBeNaN();
  else expect(result.contentLength).toBe(Number(contentLength));
});

it('download signing uses the current display name while preview URLs stay inline', () => {
  createDownloadSignedUrl({ objectKey: 'files/u/uploads/stable.pdf', fileName: '新名字 (1).pdf\r\n' });
  const signed = sdk.sign.mock.lastCall[0];
  expect(signed.Key).toBe('files/u/uploads/stable.pdf');
  expect(signed.QueryParams['response-content-disposition']).toBe(
    `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent('新名字 ')}%281%29.pdf`,
  );
  createDownloadSignedUrl({ objectKey: 'files/u/uploads/stable.pdf' });
  expect(sdk.sign.mock.lastCall[0]).not.toHaveProperty('QueryParams');
  createDownloadSignedUrl({ objectKey: 'files/u/wrong.heic', responseContentType: 'image/jpeg' });
  expect(sdk.sign.mock.lastCall[0].QueryParams).toEqual({ 'response-content-type': 'image/jpeg' });
  createDownloadSignedUrl({ objectKey: 'files/u/wrong.heic', responseContentType: 'image/jpeg\r\nX-Test: injected' });
  expect(sdk.sign.mock.lastCall[0]).not.toHaveProperty('QueryParams');
});

function mockObjectResult(content, contentLength) {
  sdk.getObject.mockImplementationOnce((params, callback) => {
    callback(null, {
      CommonMsg: { Status: 200 },
      InterfaceResult: { Content: content, ContentLength: String(contentLength) },
    });
  });
}

describe('OBS 二进制下载', () => {
  beforeEach(() => {
    sdk.getObject.mockReset();
    sdk.putObject.mockReset();
  });

  it('使用流模式并原样保留 PDF 等文件的高位字节', async () => {
    const original = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0x00, 0x80, 0xfe]);
    mockObjectResult(Readable.from([original.subarray(0, 5), original.subarray(5)]), original.length);

    const result = await getObjectBufferFromObs('ai-temp/user/source/sample.pdf');

    expect(result.equals(original)).toBe(true);
    expect(sdk.getObject).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'ai-temp/user/source/sample.pdf',
        SaveAsStream: true,
      }),
      expect.any(Function),
    );
  });

  it('拒绝 SDK 回退成字符串，避免再次按 UTF-8 破坏二进制内容', async () => {
    mockObjectResult('binary-looking-content', 22);

    await expect(getObjectBufferFromObs('sample.pdf')).rejects.toMatchObject({
      code: 'OBS_DOWNLOAD_INVALID_CONTENT',
    });
  });

  it('拒绝长度与 Content-Length 不一致的下载结果', async () => {
    mockObjectResult(Readable.from([Buffer.from('short')]), 10);

    await expect(getObjectBufferFromObs('sample.pdf')).rejects.toMatchObject({
      code: 'OBS_DOWNLOAD_SIZE_MISMATCH',
    });
  });

  it('可以直接上传内存中的 UTF-8 示例文档', async () => {
    sdk.putObject.mockImplementationOnce((params, callback) => {
      callback(null, { CommonMsg: { Status: 200 } });
    });

    await putObjectBodyToObs('files/user/system/onboarding-v1.md', '# 轻笺', 'text/markdown');

    expect(sdk.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'files/user/system/onboarding-v1.md',
        Body: expect.any(Readable),
        ContentLength: Buffer.byteLength('# 轻笺'),
        ContentType: 'text/markdown',
      }),
      expect.any(Function),
    );
  });
  it('上传二进制流原样保留高位字节与零字节', async () => {
    const original = Buffer.from([0x52, 0x49, 0x46, 0x46, 0xff, 0x80, 0x00, 0xfe]);
    let received;
    sdk.putObject.mockImplementationOnce(async (params, callback) => {
      const chunks = [];
      for await (const chunk of params.Body) chunks.push(chunk);
      received = Buffer.concat(chunks);
      expect(params.ContentLength).toBe(original.length);
      callback(null, { CommonMsg: { Status: 200 } });
    });
    await putObjectBodyToObs('image-previews/test.webp', original, 'image/webp');
    expect(received).toEqual(original);
  });
});

describe('OBS metadata ranges', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('propagates a caller deadline to range downloads', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url, options) => {
      controller.abort();
      expect(options.signal.aborted).toBe(true);
      options.signal.throwIfAborted();
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getObjectRangeFromObs('video.mov', 0, 9, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
  it('uses bounded Range and preserves binary data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(Buffer.from([255, 0, 128]), { status: 206 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getObjectRangeFromObs('audio.mp3', 10, 12)).toEqual(Buffer.from([255, 0, 128]));
    expect(fetchMock).toHaveBeenCalledWith(
      'https://obs.test/signed',
      expect.objectContaining({
        headers: { Range: 'bytes=10-12' },
        signal: expect.any(AbortSignal),
        redirect: 'error',
      }),
    );
  });
  it('rejects ignored ranges, truncated bytes and over-limit requests', async () => {
    const cancel = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: { cancel } })
      .mockResolvedValueOnce(new Response(Buffer.alloc(2), { status: 206 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getObjectRangeFromObs('audio.mp3', 0, 9)).rejects.toMatchObject({ code: 'OBS_RANGE_UNSUPPORTED' });
    expect(cancel).toHaveBeenCalled();
    await expect(getObjectRangeFromObs('audio.mp3', 0, 9)).rejects.toMatchObject({
      code: 'OBS_DOWNLOAD_SIZE_MISMATCH',
    });
    await expect(getObjectRangeFromObs('audio.mp3', 0, 20 * 1024 * 1024)).rejects.toMatchObject({
      code: 'OBS_RANGE_INVALID',
    });
  });
});

describe('bounded OBS download', () => {
  let server;

  async function serve(handler) {
    server = createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    sdk.sign.mockReturnValueOnce({ SignedUrl: 'http://127.0.0.1:' + server.address().port + '/fixture' });
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    if (!server) return;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    server = undefined;
  });

  it('returns the original bytes at exactly the requested limit', async () => {
    const bytes = Buffer.from([0, 128, 255, 10]);
    await serve((_req, res) => res.end(bytes));
    await expect(getBoundedObjectBufferFromObs('fixture', { maxBytes: bytes.length })).resolves.toEqual(bytes);
  });

  it('closes the response as soon as the declared length exceeds the limit', async () => {
    const closed = Promise.withResolvers();
    await serve((_req, res) => {
      res.once('close', closed.resolve);
      res.writeHead(200, { 'Content-Length': 9 });
      res.flushHeaders();
    });
    await expect(getBoundedObjectBufferFromObs('fixture', { maxBytes: 4 })).rejects.toMatchObject({
      code: 'OBS_DOWNLOAD_SIZE_LIMIT',
    });
    await closed.promise;
  });

  it('enforces the limit on the actual stream when length is unknown', async () => {
    const closed = Promise.withResolvers();
    await serve((_req, res) => {
      res.once('close', closed.resolve);
      res.write(Buffer.alloc(3));
      setImmediate(() => res.write(Buffer.alloc(2)));
    });
    await expect(getBoundedObjectBufferFromObs('fixture', { maxBytes: 4 })).rejects.toMatchObject({
      code: 'OBS_DOWNLOAD_SIZE_LIMIT',
    });
    await closed.promise;
  });

  it('cancels the connection while waiting for headers', async () => {
    const started = Promise.withResolvers();
    const closed = Promise.withResolvers();
    await serve((_req, res) => {
      res.once('close', closed.resolve);
      started.resolve();
    });
    const controller = new AbortController();
    const rejected = expect(
      getBoundedObjectBufferFromObs('fixture', { maxBytes: 4, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    controller.abort();
    await rejected;
    await closed.promise;
  });

  it('preserves a socket failure code without the transport message', async () => {
    await serve((_req, res) => res.destroy());
    await expect(getBoundedObjectBufferFromObs('fixture', { maxBytes: 4 })).rejects.toMatchObject({
      code: 'ECONNRESET',
      message: 'ECONNRESET: 无法读取文件，请稍后重试',
    });
  });

  it('releases a stalled body when the download deadline expires', async () => {
    const started = Promise.withResolvers();
    const closed = Promise.withResolvers();
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(deadline.signal);
    await serve((_req, res) => {
      res.once('close', closed.resolve);
      res.write(Buffer.alloc(2));
      started.resolve();
    });
    const rejected = expect(getBoundedObjectBufferFromObs('fixture', { maxBytes: 4 })).rejects.toMatchObject({
      code: 'OBS_DOWNLOAD_TIMEOUT',
    });
    await started.promise;
    deadline.abort();
    await rejected;
    await closed.promise;
    expect(timeout).toHaveBeenCalledWith(60_000);
  });
});

it('uses OBS source ETag preconditions and does not retry a changed source unconditionally', async () => {
  sdk.copyObject.mockImplementationOnce((_params, callback) =>
    callback(null, { CommonMsg: { Status: 412, Code: 'PreconditionFailed' } }),
  );
  await expect(copyObjectInObs('source', 'destination', { sourceEtag: '"observed-version"' })).rejects.toThrow(
    'PreconditionFailed',
  );
  expect(sdk.copyObject).toHaveBeenCalledExactlyOnceWith(
    {
      Bucket: 'test-bucket',
      Key: 'destination',
      CopySource: 'test-bucket/source',
      CopySourceIfMatch: 'observed-version',
    },
    expect.any(Function),
  );
  sdk.copyObject.mockImplementationOnce((_params, callback) => callback(null, { CommonMsg: { Status: 200 } }));
  await copyObjectInObs('source', 'destination');
  expect(sdk.copyObject.mock.lastCall[0]).not.toHaveProperty('CopySourceIfMatch');
});

it('keeps HEAD ETag conditions intact through the real OBS SDK header encoder', async () => {
  const { default: RealObsClient } = await vi.importActual('esdk-obs-nodejs');
  const client = new RealObsClient({
    access_key_id: 'test-ak',
    secret_access_key: 'test-sk',
    server: 'https://obs.test',
  });
  try {
    for (const tag of ['0123456789abcdef0123456789abcdef', '0123456789abcdef0123456789abcdef-3']) {
      sdk.copyObject.mockImplementationOnce((_params, callback) => callback(null, { CommonMsg: { Status: 200 } }));
      await copyObjectInObs('source', 'destination', { sourceEtag: `"${tag}"` });
      const request = client.util.makeParam('CopyObject', sdk.copyObject.mock.lastCall[0]);
      const condition = Object.entries(request.headers).find(([key]) => key.endsWith('copy-source-if-match'))?.[1];
      expect(condition).toBe(tag);
    }
  } finally {
    client.close();
  }
});
