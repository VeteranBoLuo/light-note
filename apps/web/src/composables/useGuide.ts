import { ref } from 'vue';

// 跨页面新手引导的全局状态与控制。命令式 startGuide 启动,BGuide.vue(挂在 App 根)负责渲染高亮+气泡。
// 支持:分步、每步可指定所在路由(跨页面自动跳转并等目标出现)、localStorage 记住已引导不重复。

export interface GuideStep {
  target: string; // CSS selector,建议用 [data-guide="xxx"] 稳定锚点
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'auto'; // 气泡相对目标的位置,默认 auto
  route?: string; // 该步所在路由;与当前不同则先跳转再高亮
  spotlightPadding?: number; // 高亮框相对目标的外扩像素,默认 6
  allowClickTarget?: boolean; // 是否允许点击高亮的目标元素(默认 true,便于「跟着点」)
}

export const guideActive = ref(false);
export const guideSteps = ref<GuideStep[]>([]);
export const guideStepIndex = ref(0);

let storageKey = '';

export function guideDone(key: string): boolean {
  try {
    return localStorage.getItem('ln_guide_' + key) === 'done';
  } catch {
    return false;
  }
}

export function startGuide(key: string, list: GuideStep[]): void {
  if (!list.length || guideActive.value) return;
  if (key && guideDone(key)) return; // 已引导过,不重复
  storageKey = key;
  guideSteps.value = list;
  guideStepIndex.value = 0;
  guideActive.value = true;
}

export function endGuide(markDone = true): void {
  guideActive.value = false;
  if (markDone && storageKey) {
    try {
      localStorage.setItem('ln_guide_' + storageKey, 'done');
    } catch {
      /* 隐私模式等写入失败,忽略 */
    }
  }
  storageKey = '';
  guideSteps.value = [];
  guideStepIndex.value = 0;
}

export function nextGuideStep(): void {
  if (guideStepIndex.value >= guideSteps.value.length - 1) {
    endGuide(true);
    return;
  }
  guideStepIndex.value += 1;
}

export function prevGuideStep(): void {
  if (guideStepIndex.value > 0) guideStepIndex.value -= 1;
}
