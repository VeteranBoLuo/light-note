import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, readonly, ref, shallowReactive } from 'vue';
const owners = shallowReactive(new Set<symbol>());
export const communityChatWorkspaceActive = computed(() => owners.size > 0);
/** Mounted alone is insufficient under KeepAlive: a hidden workspace must yield to the global unread runtime. */
export function useCommunityChatActivation() {
  const token = Symbol('chat-workspace');
  const active = ref(true);
  function activate() {
    active.value = true;
    owners.add(token);
  }
  function deactivate() {
    active.value = false;
    owners.delete(token);
  }
  onMounted(activate);
  onActivated(activate);
  onDeactivated(deactivate);
  onBeforeUnmount(deactivate);
  return readonly(active);
}
