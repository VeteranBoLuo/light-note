import { shallowRef } from 'vue';
// Only a successful owner-scoped mutation publishes a revision. No persisted content or extra polling.
export const toolboxTaskChange = shallowRef<{ owner: string; id: string; revision: number } | null>(null);
export function notifyToolboxTaskChange(owner: string, id: string) {
  toolboxTaskChange.value = { owner, id, revision: (toolboxTaskChange.value?.revision || 0) + 1 };
}
