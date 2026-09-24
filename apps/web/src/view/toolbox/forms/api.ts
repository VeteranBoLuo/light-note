import i18n from '@/i18n';
import { apiBaseGet, apiBasePost, apiBasePatch } from '@/http/request';
import type { FormDefinition, FormAnswers } from '@lightnote/shared/collection-forms';
export interface CollectionForm {
  id: string;
  title: string;
  public_id: string;
  status: 'draft' | 'collecting' | 'paused' | 'ended';
  version: number;
  published: number;
  definition: FormDefinition;
  tagIds: string[];
  total?: number;
  unread?: number;
}
export interface Submission {
  id: string;
  answers: FormAnswers;
  created_at: string;
  updated_at?: string;
  is_read: number;
  processed: number;
  spam: number;
  private_note: string;
}
export async function formsApi<T = any>(path = '', method = 'GET', data?: any, signal?: AbortSignal): Promise<T> {
  const url = '/api/toolbox/forms' + path;
  const result =
    method === 'POST'
      ? await apiBasePost(url, data, { silent: true, signal })
      : method === 'PATCH'
        ? await apiBasePatch(url, data, { silent: true, signal })
        : await apiBaseGet(url, data, { silent: true, signal });
  if (result.status !== 200) throw new Error(result.msg || i18n.global.t('collectionForms.operationError'));
  return result.data as T;
}
export const statusLabel: Record<string, string> = {
  draft: 'collectionForms.draft',
  collecting: 'collectionForms.collecting',
  paused: 'collectionForms.paused',
  ended: 'collectionForms.ended',
};
export const typeLabels = {
  short: 'collectionForms.short',
  long: 'collectionForms.long',
  single: 'collectionForms.single',
  multiple: 'collectionForms.multiple',
  rating: 'collectionForms.rating',
  number: 'collectionForms.number',
  date: 'collectionForms.date',
};
