import fs from 'node:fs/promises';
import path from 'node:path';
import { imageSize } from 'image-size';

export const NOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const NOTE_IMAGE_MAX_PIXELS = 64_000_000;

const IMAGE_TYPES = Object.freeze({
  gif: { extension: '.gif', contentType: 'image/gif' },
  jpg: { extension: '.jpg', contentType: 'image/jpeg' },
  png: { extension: '.png', contentType: 'image/png' },
  webp: { extension: '.webp', contentType: 'image/webp' },
});

function uploadError(code, status, zh, en) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.zh = zh;
  error.en = en;
  return error;
}

export function noteImageExtensionForMimeType(mimeType) {
  const match = Object.values(IMAGE_TYPES).find((item) => item.contentType === String(mimeType || '').toLowerCase());
  return match?.extension || '';
}

export async function validateNoteImageUpload(file, { readFile = fs.readFile } = {}) {
  if (!file?.path) {
    throw uploadError('NOTE_IMAGE_REQUIRED', 400, '请选择要上传的图片', 'Select an image to upload');
  }
  if (Number(file.size || 0) <= 0 || Number(file.size) > NOTE_IMAGE_MAX_BYTES) {
    throw uploadError('NOTE_IMAGE_TOO_LARGE', 413, '单张图片不能超过 20MB', 'Each image must be 20MB or smaller');
  }
  let buffer;
  try {
    buffer = await readFile(file.path);
  } catch {
    throw uploadError('NOTE_IMAGE_UNREADABLE', 400, '图片读取失败，请重新选择', 'The image could not be read');
  }
  if (!buffer.length || buffer.length !== Number(file.size) || buffer.length > NOTE_IMAGE_MAX_BYTES) {
    throw uploadError('NOTE_IMAGE_INCOMPLETE', 400, '图片内容不完整，请重新选择', 'The image is incomplete');
  }
  let dimensions;
  try {
    dimensions = imageSize(buffer);
  } catch {
    throw uploadError(
      'NOTE_IMAGE_CONTENT_INVALID',
      400,
      '仅支持真实的 JPG、PNG、WebP 或 GIF 图片',
      'Only valid JPG, PNG, WebP, or GIF images are supported',
    );
  }
  const imageType = IMAGE_TYPES[String(dimensions.type || '').toLowerCase()];
  const width = Number(dimensions.width || 0);
  const height = Number(dimensions.height || 0);
  if (
    !imageType ||
    imageType.contentType !== String(file.mimetype || '').toLowerCase() ||
    imageType.extension !== path.extname(String(file.filename || '')).toLowerCase() ||
    !width ||
    !height
  ) {
    throw uploadError(
      'NOTE_IMAGE_CONTENT_INVALID',
      400,
      '图片格式与实际内容不一致',
      'The image format does not match its content',
    );
  }
  if (width * height > NOTE_IMAGE_MAX_PIXELS) {
    throw uploadError(
      'NOTE_IMAGE_PIXELS_EXCEEDED',
      413,
      '图片尺寸过大，请压缩后重试',
      'The image dimensions are too large. Compress it and try again',
    );
  }
  return { width, height, type: dimensions.type, fileSize: buffer.length };
}
