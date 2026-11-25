// Guard decoded canvas memory independently of the compressed file size.
export const MAX_REPAIR_IMAGE_PIXELS = 16_000_000;
const MAX_RESIZE_SOURCE_PIXELS = 50_000_000;
export const MAX_REPAIR_IMAGE_EDGE = 4096;

type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';
export type ImageMetadata = { width: number; height: number; type: ImageType };
type InputError = 'unsupportedImage' | 'animatedImage' | 'imageTooLarge' | 'decodeFailed';

export class RepairImageError extends Error {
  constructor(public readonly code: InputError) {
    super(code);
  }
}

function pngMetadata(bytes: DataView): ImageMetadata {
  if (bytes.byteLength < 33 || bytes.getUint32(8) !== 13 || bytes.getUint32(12) !== 0x49484452) {
    throw new RepairImageError('decodeFailed');
  }
  // APNG declares acTL before the first IDAT.
  for (let offset = 8; offset + 12 <= bytes.byteLength;) {
    const chunk = bytes.getUint32(offset + 4);
    if (chunk === 0x6163544c) throw new RepairImageError('animatedImage');
    if (chunk === 0x49444154) break;
    offset += 12 + bytes.getUint32(offset);
  }
  return { width: bytes.getUint32(16), height: bytes.getUint32(20), type: 'image/png' };
}

function jpegMetadata(bytes: DataView): ImageMetadata {
  // Read a start-of-frame segment before the compressed scan, never decode to find dimensions.
  for (let offset = 2; offset + 4 <= bytes.byteLength && bytes.getUint8(offset) === 0xff;) {
    const marker = bytes.getUint8(offset + 1);
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break;
    const length = bytes.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.byteLength) break;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 8) {
      return { width: bytes.getUint16(offset + 7), height: bytes.getUint16(offset + 5), type: 'image/jpeg' };
    }
    offset += 2 + length;
  }
  throw new RepairImageError('decodeFailed');
}

function webpMetadata(bytes: DataView): ImageMetadata {
  if (bytes.byteLength < 25) throw new RepairImageError('decodeFailed');
  const chunk = bytes.getUint32(12);
  const type = 'image/webp';
  if (chunk === 0x56503858 && bytes.byteLength >= 30) {
    if (bytes.getUint8(20) & 0x02) throw new RepairImageError('animatedImage');
    const dimension = (offset: number) => 1 + bytes.getUint16(offset, true) + (bytes.getUint8(offset + 2) << 16);
    return { width: dimension(24), height: dimension(27), type };
  }
  if (chunk === 0x56503820 && bytes.byteLength >= 30) {
    return { width: bytes.getUint16(26, true) & 0x3fff, height: bytes.getUint16(28, true) & 0x3fff, type };
  }
  if (chunk === 0x5650384c && bytes.getUint8(20) === 0x2f) {
    const size = bytes.getUint32(21, true);
    return { width: (size & 0x3fff) + 1, height: ((size >>> 14) & 0x3fff) + 1, type };
  }
  throw new RepairImageError('decodeFailed');
}

export function fitRepairImage(width: number, height: number) {
  const factor = Math.min(
    1,
    MAX_REPAIR_IMAGE_EDGE / Math.max(width, height),
    Math.sqrt(MAX_REPAIR_IMAGE_PIXELS / (width * height)),
  );
  return { width: Math.max(1, Math.floor(width * factor)), height: Math.max(1, Math.floor(height * factor)) };
}

export function canResizeRepairImage(width: number, height: number) {
  return width * height <= MAX_RESIZE_SOURCE_PIXELS;
}

export async function inspectRepairImage(file: File): Promise<ImageMetadata> {
  const bytes = new DataView(await file.arrayBuffer());
  let metadata: ImageMetadata;
  if (bytes.byteLength >= 8 && bytes.getUint32(0) === 0x89504e47 && bytes.getUint32(4) === 0x0d0a1a0a) {
    metadata = pngMetadata(bytes);
  } else if (bytes.byteLength >= 2 && bytes.getUint16(0) === 0xffd8) {
    metadata = jpegMetadata(bytes);
  } else if (bytes.byteLength >= 12 && bytes.getUint32(0) === 0x52494646 && bytes.getUint32(8) === 0x57454250) {
    metadata = webpMetadata(bytes);
  } else {
    throw new RepairImageError('unsupportedImage');
  }
  if (!metadata.width || !metadata.height) throw new RepairImageError('decodeFailed');
  return metadata;
}

async function openRepairImage(url: string) {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new RepairImageError('decodeFailed');
  return image;
}

export async function decodeRepairImage(url: string) {
  const image = await openRepairImage(url);
  const size = fitRepairImage(image.naturalWidth, image.naturalHeight);
  if (size.width !== image.naturalWidth || size.height !== image.naturalHeight) {
    throw new RepairImageError('imageTooLarge');
  }
  return image;
}

export async function resizeRepairImage(url: string) {
  const image = await openRepairImage(url);
  if (!canResizeRepairImage(image.naturalWidth, image.naturalHeight)) throw new RepairImageError('imageTooLarge');
  const { width, height } = fitRepairImage(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    return { blob: await encodeRepairImage(canvas), width, height };
  } finally {
    canvas.width = canvas.height = 1;
  }
}

export function encodeRepairImage(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
  });
}
