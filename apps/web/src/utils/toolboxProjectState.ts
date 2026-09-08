import { ref } from 'vue';
export const toolboxProjectRevision = ref(0);
export function invalidateToolboxProjects() {
  toolboxProjectRevision.value++;
}
