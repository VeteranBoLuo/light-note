import { defineAsyncComponent, type Component } from 'vue';
import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';

const KnowledgeWorkspace = defineAsyncComponent(() => import('./components/KnowledgeWorkspace.vue'));

export const TOOLBOX_SERVICE_COMPONENTS: Partial<Record<ToolboxToolId, Component>> = Object.freeze({
  research_workspace: KnowledgeWorkspace,
  learning_workspace: KnowledgeWorkspace,
  writing_workspace: KnowledgeWorkspace,
});

export function getToolboxServiceComponent(toolId: ToolboxToolId | string) {
  return TOOLBOX_SERVICE_COMPONENTS[toolId as ToolboxToolId] || null;
}
