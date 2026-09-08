import { computed, shallowRef } from 'vue';
import { useUserStore } from '@/store';
import { toolboxRecentUseIdentityKey } from '@/utils/toolboxRecentUse';
export type ProjectResourceRef = { type: 'note' | 'bookmark' | 'file'; id: string; title?: string };
export const projectResourceHandoff = shallowRef<{
  entrySource: 'resource_menu' | 'resource_batch';
  token: number;
  owner: string;
  resources: ProjectResourceRef[];
} | null>(null);
let sequence = 0;
export function useProjectResourceAction() {
  const user = useUserStore();
  const canJoinProject = computed(
    () => Boolean(user.id) && user.role !== 'visitor' && !user.adminContext && !user.visitorWorkspace,
  );
  function joinProject(
    resources: ProjectResourceRef[],
    entrySource: 'resource_menu' | 'resource_batch' = 'resource_menu',
  ) {
    if (!canJoinProject.value || !resources.length) return;
    const unique = new Map<string, ProjectResourceRef>();
    for (const item of resources) {
      if (!['note', 'bookmark', 'file'].includes(item.type) || !item.id) return;
      unique.set(`${item.type}:${item.id}`, { type: item.type, id: String(item.id), title: item.title });
    }
    projectResourceHandoff.value = {
      token: ++sequence,
      entrySource,
      owner: toolboxRecentUseIdentityKey(user),
      resources: [...unique.values()],
    };
  }
  return { canJoinProject, joinProject };
}
