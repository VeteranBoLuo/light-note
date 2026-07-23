export const AI_WRITE_TOOL_NAMES = new Set([
  'create_note',
  'create_image_note',
  'save_attachment_to_cloud',
  'create_bookmark',
  'add_tag',
  'set_todo_status',
  'restore_trash',
  'write_knowledge_base',
]);

export const AI_EDITABLE_ATTACHMENT_TOOL_NAMES = new Set(['save_attachment_to_cloud', 'create_image_note']);

export type AiAttachmentDirectActionName = 'save_attachment_to_cloud' | 'create_image_note';

export function isEditableAttachmentTool(name: string): name is AiAttachmentDirectActionName {
  return AI_EDITABLE_ATTACHMENT_TOOL_NAMES.has(name);
}
