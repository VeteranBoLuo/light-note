export type ResourceType = 'bookmark' | 'note' | 'file' | 'tag';

export const RESOURCE_TYPES: ResourceType[] = ['bookmark', 'note', 'file', 'tag'];

export const RESOURCE_COLOR_HEX: Record<ResourceType, string> = {
  bookmark: '#615ced',
  note: '#00a884',
  file: '#ff8a00',
  tag: '#ec4899',
};

export const RESOURCE_COLOR_CSS_VAR: Record<ResourceType, string> = {
  bookmark: '--resource-bookmark-color',
  note: '--resource-note-color',
  file: '--resource-file-color',
  tag: '--resource-tag-color',
};

export const FILE_TYPE_COLOR_HEX = {
  image: '#ff8a00',
  video: '#615ced',
  audio: '#00a884',
  pdf: '#ef4444',
  word: '#3b82f6',
  excel: '#22c55e',
  ppt: '#f97316',
  text: '#eab308',
  compress: '#8b5cf6',
  other: '#8c8f99',
} as const;
