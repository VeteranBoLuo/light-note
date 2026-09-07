import type { RunOptions } from '@/api/organizeSuggestionApi';
import type { SelectionOperation } from '@/store/resourceSelection';
import { generateUUID } from '@/utils/common';

let pending: { token: string; identity: string; options: RunOptions } | null = null;

export function createOrganizeHandoff(operation: SelectionOperation) {
  const items = [
    ...new Map(operation.items.map(({ type, id }) => [`${type}:${id}`, { type, id: String(id) }])).values(),
  ];
  if (!items.length || items.length > 1000 || items.some((item) => !['bookmark', 'note'].includes(item.type))) {
    throw new Error('ORGANIZE_SELECTION_INVALID');
  }
  const token = generateUUID();
  pending = {
    token,
    identity: operation.identity,
    options: {
      resourceTypes: [...new Set(items.map((item) => item.type))],
      checks: ['tags'],
      scope: 'selected',
      items,
      tagMode: 'append',
    },
  };
  return token;
}

export function consumeOrganizeHandoff(token: string, identity: string): RunOptions | null {
  const current = pending;
  pending = null;
  return current?.token === token && current.identity === identity ? current.options : null;
}

export function clearOrganizeHandoff(token?: string) {
  if (!token || pending?.token === token) pending = null;
}
