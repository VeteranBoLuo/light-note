import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => {
  process.env.OBS_AK = 'test-ak';
  process.env.OBS_SK = 'test-sk';
  process.env.OBS_ENDPOINT = 'https://obs.test';
  process.env.OBS_BUCKET_NAME = 'test-bucket';

  const getObject = vi.fn();
  const putObject = vi.fn();
  class MockObsClient {
    getObject(...args) {
      return getObject(...args);
    }

    putObject(...args) {
      return putObject(...args);
    }
  }
  return { getObject, putObject, MockObsClient };
});

vi.mock('esdk-obs-nodejs', () => ({ default: sdk.MockObsClient }));

import { getObjectBufferFromObs, putObjectBodyToObs } from './obsClient.js';

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
        Body: Buffer.from('# 轻笺', 'utf8'),
        ContentType: 'text/markdown',
      }),
      expect.any(Function),
    );
  });
});
