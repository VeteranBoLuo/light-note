export type CloudFileCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'ppt'
  | 'text'
  | 'compress'
  | 'other';

export type CloudPreviewType = 'image' | 'video' | 'pdf' | 'word' | 'excel' | 'ppt' | 'text' | 'unsupported';

export const CLOUD_FILE_CATEGORY_ORDER: CloudFileCategory[] = [
  'image',
  'video',
  'audio',
  'pdf',
  'word',
  'excel',
  'ppt',
  'text',
  'compress',
  'other',
];

export const CLOUD_FILE_CATEGORY_LABEL_KEY: Record<CloudFileCategory, string> = {
  image: 'cloudSpace.image',
  video: 'cloudSpace.video',
  audio: 'cloudSpace.audio',
  pdf: 'cloudSpace.pdf',
  word: 'cloudSpace.word',
  excel: 'cloudSpace.excel',
  ppt: 'cloudSpace.ppt',
  text: 'cloudSpace.text',
  compress: 'cloudSpace.compress',
  other: 'cloudSpace.other',
};

export const CLOUD_FILE_PREVIEW_TYPE_MAP: Record<CloudFileCategory, CloudPreviewType> = {
  image: 'image',
  video: 'video',
  audio: 'unsupported',
  pdf: 'pdf',
  word: 'word',
  excel: 'excel',
  ppt: 'ppt',
  text: 'text',
  compress: 'unsupported',
  other: 'unsupported',
};

export function normalizeCloudFileCategory(category?: string): CloudFileCategory {
  const normalized = String(category || '').trim().toLowerCase();
  return CLOUD_FILE_CATEGORY_ORDER.includes(normalized as CloudFileCategory)
    ? (normalized as CloudFileCategory)
    : 'other';
}

export function getCloudFileCategory(file?: { category?: string }): CloudFileCategory {
  return normalizeCloudFileCategory(file?.category);
}

export function getCloudPreviewType(file?: { category?: string }): CloudPreviewType {
  const category = getCloudFileCategory(file);
  return CLOUD_FILE_PREVIEW_TYPE_MAP[category];
}
