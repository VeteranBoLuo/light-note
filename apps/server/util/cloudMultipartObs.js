import { obsClient, bucketName } from './obsClient.js';

function request(method, params, required) {
  return new Promise((resolve, reject) =>
    obsClient[method]({ Bucket: bucketName, ...params }, (error, result) => {
      const status = Number(result?.CommonMsg?.Status || 0);
      const data = result?.InterfaceResult;
      if (error || status < 200 || status >= 300 || result?.CommonMsg?.Code || (required && !data?.[required])) {
        return reject(
          Object.assign(new Error('OBS_MULTIPART_FAILED'), {
            code: 'OBS_MULTIPART_FAILED',
            obsStatus: status,
            obsCode: result?.CommonMsg?.Code || '',
            status: 503,
          }),
        );
      }
      resolve(data || {});
    }),
  );
}
export const initiateCloudMultipart = (key, sessionId, type) =>
  request(
    'initiateMultipartUpload',
    {
      Key: key,
      ContentType: type,
      Metadata: { 'ln-upload-session': sessionId },
    },
    'UploadId',
  );
export function signCloudMultipartPart(key, uploadId, partNumber, type) {
  const signed = obsClient.createSignedUrlSync({
    Method: 'PUT',
    Bucket: bucketName,
    Key: key,
    Expires: 900,
    Headers: { 'Content-Type': type },
    QueryParams: { uploadId, partNumber },
  });
  return {
    partNumber,
    uploadUrl: signed.SignedUrl,
    headers: Object.fromEntries(
      Object.entries(signed.ActualSignedRequestHeaders || {}).filter(([key]) => key.toLowerCase() !== 'host'),
    ),
    expiresIn: 900,
  };
}
export async function listCloudMultipartParts(key, uploadId) {
  const parts = [];
  let marker = 0;
  for (;;) {
    const page = await request('listParts', { Key: key, UploadId: uploadId, PartNumberMarker: marker, MaxParts: 1000 });
    parts.push(...(page.Parts || []).map(part => process.env.LIGHTNOTE_LOCAL_TEST === '1'
      // SeaweedFS 的 XML 用数字实体表示引号；OBS SDK 不会解码这类 ETag。
      ? { ...part, ETag: String(part.ETag || '').replace(/&#(?:34|x22);|&quot;/gi, '"') }
      : part));
    if (parts.length > 10000) throw Object.assign(new Error('OBS_PART_LIST_INVALID'), { status: 503 });
    if (!page.IsTruncated || page.IsTruncated === 'false') return parts;
    const next = Number(page.NextPartNumberMarker);
    if (!(next > marker)) throw Object.assign(new Error('OBS_PART_LIST_INVALID'), { status: 503 });
    marker = next;
  }
}
export const completeCloudMultipart = (key, uploadId, parts) =>
  request(
    'completeMultipartUpload',
    {
      Key: key,
      UploadId: uploadId,
      Parts: parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })),
    },
    'ETag',
  );
export async function abortCloudMultipart(key, uploadId) {
  try {
    await request('abortMultipartUpload', { Key: key, UploadId: uploadId });
  } catch (error) {
    if (error.obsCode !== 'NoSuchUpload') throw error;
  }
}
export async function findCloudMultipartUploads(key) {
  const page = await request('listMultipartUploads', { Prefix: key, MaxUploads: 1000 });
  // 每个对象由一个服务端会话独占；分页不能静默漏掉需要回收的上传。
  if (page.IsTruncated && page.IsTruncated !== 'false')
    throw Object.assign(new Error('OBS_UPLOAD_LIST_TRUNCATED'), { status: 503 });
  return (page.Uploads || []).filter((item) => item.Key === key);
}
export async function headCloudMultipart(key) {
  try {
    const data = await request('getObjectMetadata', { Key: key }, 'ETag');
    return {
      size: Number(data.ContentLength),
      etag: data.ETag,
      sessionId:
        data.Metadata?.['ln-upload-session'] ||
        data.MetadataObs?.['ln-upload-session'] ||
        data.MetadataV2?.['ln-upload-session'],
    };
  } catch (error) {
    if (error.obsStatus === 404) return null;
    throw error;
  }
}
