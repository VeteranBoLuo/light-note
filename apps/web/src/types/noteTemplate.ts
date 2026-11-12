export type NoteTemplateType = 'html' | 'markdown';

export interface NoteTemplateSummary {
  id: string;
  name: string;
  titleTemplate?: string | null;
  description?: string | null;
  type: NoteTemplateType;
  revision: number;
  createTime?: string | null;
  updateTime?: string | null;
}

export interface NoteTemplateDetail extends NoteTemplateSummary {
  content: string;
}

export interface NoteTemplateWritePayload {
  name: string;
  titleTemplate: string;
  description: string;
  type: NoteTemplateType;
  content: string;
}

export const NOTE_TEMPLATE_LIMIT = 20;
