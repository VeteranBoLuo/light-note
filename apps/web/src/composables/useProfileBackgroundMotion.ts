import { readonly, ref } from 'vue';

// 查看者在当前会话中的展示偏好，同时控制名片、主页和商店预览，不修改作者的装扮。
const paused = ref(false);

export function useProfileBackgroundMotion() {
  return { paused: readonly(paused), toggle: () => (paused.value = !paused.value) };
}
