const MAX_AVATAR_DIMENSION = 256;
const AVATAR_WEBP_QUALITY = 0.82;
const AVATAR_JPEG_QUALITY = 0.84;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('AVATAR_IMAGE_DECODE_FAILED'));
    };
    image.src = objectUrl;
  });
}

/**
 * 头像只在 30~100px 的小尺寸展示，保存前统一缩放到 256px 以内并压缩。
 * 优先使用 WebP，老 WebView 不支持时回退到 JPEG，避免把原图 Base64 写入 user.head_picture。
 */
export async function compressAvatarFile(file: File): Promise<string> {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('AVATAR_IMAGE_TYPE_INVALID');
  }

  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error('AVATAR_IMAGE_SIZE_INVALID');
  }

  const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('AVATAR_CANVAS_UNAVAILABLE');
  }

  context.drawImage(image, 0, 0, width, height);

  const webp = canvas.toDataURL('image/webp', AVATAR_WEBP_QUALITY);
  if (webp.startsWith('data:image/webp')) {
    return webp;
  }

  // JPEG 不支持透明色，只有在 WebP 不可用时才使用白色底回退。
  context.globalCompositeOperation = 'destination-over';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  return canvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY);
}
