import { defineAsyncComponent, type Component } from 'vue';
import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';

const KnowledgeMaintenanceWorkbench = defineAsyncComponent(
  () => import('./components/KnowledgeMaintenanceWorkbench.vue'),
);
const KnowledgeWorkspace = defineAsyncComponent(() => import('./components/KnowledgeWorkspace.vue'));

export const TOOLBOX_SERVICE_COMPONENTS: Partial<Record<ToolboxToolId, Component>> = Object.freeze({
  research_workspace: KnowledgeWorkspace,
  learning_workspace: KnowledgeWorkspace,
  writing_workspace: KnowledgeWorkspace,
  knowledge_structure_audit: KnowledgeMaintenanceWorkbench,
  directory_index: KnowledgeMaintenanceWorkbench,
});

export function getToolboxServiceComponent(toolId: ToolboxToolId | string) {
  return TOOLBOX_SERVICE_COMPONENTS[toolId as ToolboxToolId] || null;
}
