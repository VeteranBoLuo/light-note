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

const obsClient = new ObsClient({
  access_key_id: OBS_AK,
  secret_access_key: OBS_SK,
  server: OBS_ENDPOINT,
});

const bucketName = OBS_BUCKET_NAME;
const normalizeBaseUrl = () => {
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

export const createDownloadSignedUrl = ({ objectKey, expires = 900 }) => {
  const { SignedUrl } = obsClient.createSignedUrlSync({
    Method: 'GET',
    Bucket: bucketName,
    Key: objectKey,
    Expires: expires,
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
        return reject(new Error(message));
      }
      resolve(result);
    });
  });

export const deleteObjectFromObs = async (objectKey) =>
  wrapObsCall(obsClient.deleteObject.bind(obsClient), { Bucket: bucketName, Key: objectKey });

export const copyObjectInObs = async (sourceKey, targetKey) =>
  wrapObsCall(obsClient.copyObject.bind(obsClient), {
    Bucket: bucketName,
    Key: targetKey,
    CopySource: `${bucketName}/${sourceKey}`,
  });

export const putObjectToObs = async (objectKey, filePath, contentType = 'application/octet-stream') =>
  wrapObsCall(obsClient.putObject.bind(obsClient), {
    Bucket: bucketName,
    Key: objectKey,
    SourceFile: filePath,
    ContentType: contentType,
  });

export const getObjectMetadataFromObs = async (objectKey) => {
  const result = await wrapObsCall(obsClient.getObjectMetadata.bind(obsClient), {
    Bucket: bucketName,
    Key: objectKey,
  });
  return {
    contentLength: Number(result?.InterfaceResult?.ContentLength || 0),
    contentType: String(result?.InterfaceResult?.ContentType || ''),
    etag: String(result?.InterfaceResult?.ETag || ''),
  };
};

async function readObsBinaryContent(content) {
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
    chunks.push(binaryChunk);
    totalBytes += binaryChunk.length;
  }
  return Buffer.concat(chunks, totalBytes);
}

export const getObjectBufferFromObs = async (objectKey) => {
  const result = await wrapObsCall(obsClient.getObject.bind(obsClient), {
    Bucket: bucketName,
    Key: objectKey,
    // SDK 默认把响应正文解码成字符串，会破坏 PDF、DOCX、图片等二进制文件。
    SaveAsStream: true,
  });
  const interfaceResult = result?.InterfaceResult || {};
  const buffer = await readObsBinaryContent(interfaceResult.Content);
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

export const buildObjectUrl = (objectKey) => `${bucketBaseUrl}/${objectKey}`;

export default obsClient;
