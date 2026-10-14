import { useUserStore } from '@/store';
import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
import type { ToolboxDataset } from './toolboxDataset';
let pending: { token: string; owner: string; expiresAt: number; dataset: ToolboxDataset } | null = null;
export function stageDataset(dataset: ToolboxDataset) {
  const token = crypto.randomUUID();
  pending = {
    token,
    owner: buildNoteDetailRequestScope(useUserStore()),
    expiresAt: Date.now() + 300000,
    dataset: { ...dataset, headers: [...dataset.headers], rows: dataset.rows.map((row) => [...row]) },
  };
  return token;
}
export function takeDataset(token: unknown) {
  const value = pending;
  pending = null;
  return value &&
    value.token === token &&
    value.expiresAt > Date.now() &&
    value.owner === buildNoteDetailRequestScope(useUserStore())
    ? value.dataset
    : null;
}
