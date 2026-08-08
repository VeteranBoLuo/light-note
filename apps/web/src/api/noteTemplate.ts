import { apiBasePost } from '@/http/request';
import type { NoteTemplateDetail, NoteTemplateSummary, NoteTemplateWritePayload } from '@/types/noteTemplate';

export interface NoteTemplateApiResult<T> {
  data: T;
  status: number;
  msg?: string;
}

export function queryNoteTemplates() {
  return apiBasePost('/api/note/queryNoteTemplates', {}, { silent: true }) as Promise<
    NoteTemplateApiResult<NoteTemplateSummary[]>
  >;
}

export function getNoteTemplateDetail(id: string) {
  return apiBasePost('/api/note/getNoteTemplateDetail', { id }, { silent: true }) as Promise<
    NoteTemplateApiResult<NoteTemplateDetail>
  >;
}

export function addNoteTemplate(payload: NoteTemplateWritePayload) {
  return apiBasePost('/api/note/addNoteTemplate', payload, { silent: true }) as Promise<
    NoteTemplateApiResult<{ id: string; name: string; revision: number }>
  >;
}

export function updateNoteTemplate(id: string, baseRevision: number, payload: NoteTemplateWritePayload) {
  return apiBasePost('/api/note/updateNoteTemplate', { id, baseRevision, ...payload }, { silent: true }) as Promise<
    NoteTemplateApiResult<NoteTemplateDetail>
  >;
}

export function duplicateNoteTemplate(id: string) {
  return apiBasePost('/api/note/duplicateNoteTemplate', { id }, { silent: true }) as Promise<
    NoteTemplateApiResult<{ id: string; name: string; revision: number }>
  >;
}

export function deleteNoteTemplate(id: string) {
  return apiBasePost('/api/note/delNoteTemplate', { id }, { silent: true }) as Promise<NoteTemplateApiResult<string>>;
}
