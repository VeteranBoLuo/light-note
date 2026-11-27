import { localTestPorts } from './localTestPorts.js';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import ObsClientSdk from 'esdk-obs-nodejs';
import 'dotenv/config';

const ObsClient = ObsClientSdk?.default || ObsClientSdk;
const OBS_AK = process.env.OBS_AK;
const OBS_SK = process.env.OBS_SK;
const OBS_ENDPOINT = process.env.OBS_ENDPOINT;
const OBS_BUCKET_NAME = process.env.OBS_BUCKET_NAME;
if (!OBS_AK || !OBS_SK || !OBS_ENDPOINT || !OBS_BUCKET_NAME) {
  console.warn('[OBS] Missing OBS env config, signed URL generation will fail until configured.');
}

export const obsClient = new ObsClient({
  access_key_id: OBS_AK,
  secret_access_key: OBS_SK,
  server: OBS_ENDPOINT,
});

export const bucketName = OBS_BUCKET_NAME;
const normalizeBaseUrl = () => {
  if (process.env.LIGHTNOTE_LOCAL_TEST === '1') {
    const endpoint = new URL(OBS_ENDPOINT);
    if (endpoint.origin !== `http://127.0.0.1:${localTestPorts().storage}`) throw new Error('LOCAL_TEST_STORAGE_ENDPOINT_INVALID');
    return `${endpoint.origin}/${bucketName}`;
  }
  const endpointHost = (OBS_ENDPOINT || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${bucketName}.${endpointHost}`;
};

export const bucketBaseUrl = normalizeBaseUrl();

export const buildObjectKey = (userId, fileName) => `files/${userId}/${fileName}`;

export const buildAiTemporaryObjectKey = (userId, sourceId, fileName) =>
  `ai-temp/${userId}/${sourceId}/${encodeURIComponent(fileName)}`;

export const createUploadSignedUrl = ({ objectKey, contentType, expires = 900 }) => {
  const fallbackContentType = contentType || 'application/octet-stream';
  const { SignedUrl, ActualSignedRequestHeaders } = obsClient.createSignedUrlSync({
    Method: 'PUT',
    Bucket: bucketName,
    Key: objectKey,
    Expires: expires,
    Headers: {
      'Content-Type': fallbackContentType,
    },
  });

  const sanitizedHeaders = Object.entries(ActualSignedRequestHeaders || {}).reduce((acc, [key, value]) => {
    if (key && key.toLowerCase() === 'host') {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});

  return {
    url: SignedUrl,
    headers: Object.keys(sanitizedHeaders).length > 0 ? sanitizedHeaders : { 'Content-Type': fallbackContentType },
    expiresIn: expires,
  };
};

export const createDownloadSignedUrl = ({ objectKey, expires = 900, fileName, responseContentType }) => {
  const downloadName = String(fileName || '')
    .replace(/[\r\n\x00]/gu, '')
    .toWellFormed();
  const disposition = downloadName
    ? `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(downloadName).replace(/[!'()*]/gu, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`
    : null;
  const queryParams = {
    ...(disposition ? { 'response-content-disposition': disposition } : {}),
    ...(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/iu.test(String(responseContentType || ''))
      ? { 'response-content-type': responseContentType } : {}),
  };
  const { SignedUrl } = obsClient.createSignedUrlSync({
    Method: 'GET',
    Bucket: bucketName,
    Key: objectKey,
    Expires: expires,
    ...(Object.keys(queryParams).length ? { QueryParams: queryParams } : {}),
  });

  return { url: SignedUrl, expiresIn: expires };
};

const wrapObsCall = (fn, params) =>
  new Promise((resolve, reject) => {
    fn(params, (err, result) => {
      if (err) {
        return reject(err);
      }
      if (result?.CommonMsg?.Status && result.CommonMsg.Status >= 300) {
        const message = result.CommonMsg.Message || result.CommonMsg.Code || `OBS error ${result.CommonMsg.Status}`;
        return reject(Object.assign(new Error(message), { obsStatus: Number(result.CommonMsg.Status) }));
      }
      resolve(result);
    });
  });

export const deleteObjectFromObs = async (objectKey) =>
  wrapObsCall(obsClient.deleteObject.bind(obsClient), { Bucket: bucketName, Key: objectKey });

export const copyObjectInObs = async (sourceKey, targetKey, { sourceEtag } = {}) =>
  wrapObsCall(obsClient.copyObject.bind(obsClient), {
    Bucket: bucketName,
    Key: targetKey,
    CopySource: `${bucketName}/${sourceKey}`,
    // HEAD returns a quoted ETag, but the OBS SDK URL-encodes header values.
    // Send the opaque tag without its HTTP quotes so %22 cannot break If-Match.
    ...(sourceEtag ? { CopySourceIfMatch: String(sourceEtag).replace(/^"([^"]+)"$/u, '$1') } : {}),
  });

export const putObjectToObs = async (objectKey, filePath, contentType = 'application/octet-stream') =>
  wrapObsCall(obsClient.putObject.bind(obsClient), {
    Bucket: bucketName,
    Key: objectKey,
    SourceFile: filePath,
    ContentType: contentType,
  });

export const putObjectBodyToObs = async (objectKey, body, contentType = 'application/octet-stream') => {
  const bytes = Buffer.isBuffer(body)
    ? body
    : body instanceof Uint8Array
      ? Buffer.from(body)
      : Buffer.from(String(body ?? ''), 'utf8');
  // OBS SDK converts non-stream Body values through String(), corrupting binary bytes.
  return wrapObsCall(obsClient.putObject.bind(obsClient), {
    Bucket: bucketName,
    Key: objectKey,
    Body: Readable.from([bytes]),
    ContentLength: bytes.length,
    ContentMD5: createHash('md5').update(bytes).digest('base64'),
    ContentType: contentType,
  });
};

export const getObjectMetadataFromObs = async (objectKey) => {
  const result = await wrapObsCall(obsClient.getObjectMetadata.bind(obsClient), {
    Bucket: bucketName,
    Key: objectKey,
  });
  return {
    contentLength:
      result?.InterfaceResult?.ContentLength == null || result.InterfaceResult.ContentLength === ''
        ? NaN
        : Number(result.InterfaceResult.ContentLength),
    contentType: String(result?.InterfaceResult?.ContentType || ''),
    etag: String(result?.InterfaceResult?.ETag || ''),
  };
};

async function readObsBinaryContent(content, maxBytes = Infinity) {
  if (content?.byteLength > maxBytes)
    throw Object.assign(new Error('OBS_DOWNLOAD_SIZE_LIMIT'), { code: 'OBS_DOWNLOAD_SIZE_LIMIT' });
  if (Buffer.isBuffer(content)) return Buffer.from(content);
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (!content || typeof content[Symbol.asyncIterator] !== 'function') {
    const error = new Error('OBS_DOWNLOAD_INVALID_CONTENT: OBS 未返回二进制下载流');
    error.code = 'OBS_DOWNLOAD_INVALID_CONTENT';
    throw error;
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of content) {
    if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) {
      const error = new Error('OBS_DOWNLOAD_INVALID_CONTENT: OBS 下载流包含非二进制数据');
      error.code = 'OBS_DOWNLOAD_INVALID_CONTENT';
      throw error;
    }
    const binaryChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += binaryChunk.length;
    if (totalBytes > maxBytes) {
      content.destroy?.();
      throw Object.assign(new Error('OBS_DOWNLOAD_SIZE_LIMIT'), { code: 'OBS_DOWNLOAD_SIZE_LIMIT' });
    }
    chunks.push(binaryChunk);
  }
  return Buffer.concat(chunks, totalBytes);
}

export const getObjectBufferFromObs = async (objectKey, { maxBytes = Infinity } = {}) => {
  const result = await wrapObsCall(obsClient.getObject.bind(obsClient), {
    Bucket: bucketName,
    Key: objectKey,
    // SDK 默认把响应正文解码成字符串，会破坏 PDF、DOCX、图片等二进制文件。
    SaveAsStream: true,
  });
  const interfaceResult = result?.InterfaceResult || {};
  const buffer = await readObsBinaryContent(interfaceResult.Content, maxBytes);
  const contentLength = Number(interfaceResult.ContentLength);
  if (Number.isFinite(contentLength) && contentLength >= 0 && buffer.length !== contentLength) {
    const error = new Error(
      `OBS_DOWNLOAD_SIZE_MISMATCH: OBS 文件下载不完整（应为 ${contentLength} 字节，实际 ${buffer.length} 字节）`,
    );
    error.code = 'OBS_DOWNLOAD_SIZE_MISMATCH';
    throw error;
  }
  return buffer;
};

const BOUNDED_OBS_DOWNLOAD_TIMEOUT_MS = 60_000;

function obsDownloadError(code, message, status) {
  return Object.assign(new Error(code + ': ' + message), { code, ...(status ? { obsStatus: status } : {}) });
}

export async function getBoundedObjectBufferFromObs(objectKey, { maxBytes, signal, expectedEtag } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw obsDownloadError('OBS_DOWNLOAD_LIMIT_INVALID', '文件读取上限无效');
  }
  const timeout = AbortSignal.timeout(BOUNDED_OBS_DOWNLOAD_TIMEOUT_MS);
  const downloadSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    downloadSignal.throwIfAborted();
    const { url } = createDownloadSignedUrl({ objectKey, expires: 90 });
    const target = new URL(url);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw obsDownloadError('OBS_DOWNLOAD_FAILED', '文件读取地址无效');
    }
    const get = target.protocol === 'https:' ? httpsGet : httpGet;
    // A signed GET gives the caller control over the request before headers and
    // throughout the raw binary stream, without following redirects.
    response = await new Promise((resolve, reject) => {
      get(target, { signal: downloadSignal }, resolve).once('error', reject);
    });
    if (response.statusCode !== 200) {
      throw obsDownloadError('OBS_DOWNLOAD_FAILED', '无法读取文件，请稍后重试', response.statusCode);
    }
    if (expectedEtag && String(response.headers.etag || '').replace(/^"|"$/gu, '') !== expectedEtag) {
      throw obsDownloadError('OBS_DOWNLOAD_SOURCE_CHANGED', '文件已发生变化，请重新读取');
    }
    const declaredBytes = Number(response.headers['content-length']);
    if (declaredBytes > maxBytes) {
      throw obsDownloadError('OBS_DOWNLOAD_SIZE_LIMIT', '文件超过读取上限');
    }
    const buffer = await readObsBinaryContent(response, maxBytes);
    if (Number.isSafeInteger(declaredBytes) && declaredBytes >= 0 && buffer.length !== declaredBytes) {
      throw obsDownloadError('OBS_DOWNLOAD_SIZE_MISMATCH', '文件下载不完整，请稍后重试');
    }
    return buffer;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw obsDownloadError('OBS_DOWNLOAD_TIMEOUT', '文件读取超时，请稍后重试');
    const code = String(error?.code || '');
    if (code.startsWith('OBS_DOWNLOAD_')) throw error;
    // Preserve socket error codes for existing retry policies, without the request URL or transport message.
    throw obsDownloadError(/^[A-Z][A-Z0-9_]+$/u.test(code) ? code : 'OBS_DOWNLOAD_FAILED', '无法读取文件，请稍后重试');
  } finally {
    if (response && !response.complete) response.destroy();
  }
}

/** Read only a bounded metadata range; reject servers that ignore Range. */
export const getObjectRangeFromObs = async (objectKey, start, end, { signal } = {}) => {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end - start + 1 > 16 * 1024 * 1024
  ) {
    throw Object.assign(new Error('OBS_RANGE_INVALID'), { code: 'OBS_RANGE_INVALID' });
  }
  const { url } = createDownloadSignedUrl({ objectKey, expires: 60 });
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${end}` },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    redirect: 'error',
  });
  if (response.status !== 206) {
    await response.body?.cancel();
    throw Object.assign(new Error('OBS_RANGE_UNSUPPORTED'), { code: 'OBS_RANGE_UNSUPPORTED' });
  }
  const body = await readObsBinaryContent(response.body, end - start + 1);
  if (body.length !== end - start + 1) {
    throw Object.assign(new Error('OBS_DOWNLOAD_SIZE_MISMATCH'), { code: 'OBS_DOWNLOAD_SIZE_MISMATCH' });
  }
  return body;
};

export const buildObjectUrl = (objectKey) => `${bucketBaseUrl}/${objectKey}`;

export default obsClient;
