<template>
  <teleport to="body">
    <div v-if="guideActive && rect" class="bguide">
      <!-- 高亮框:box-shadow 大扩散把框外压暗,形成「挖洞」聚焦;pointer-events:none 让目标可被点击(跟着操作) -->
      <div class="bguide-spotlight" :style="spotlightStyle"></div>
      <!-- 气泡 -->
      <div class="bguide-pop" :style="popStyle">
        <div class="bguide-pop-title">{{ current?.title }}</div>
        <div class="bguide-pop-content">{{ current?.content }}</div>
        <div class="bguide-pop-foot">
          <span class="bguide-step">{{ guideStepIndex + 1 }} / {{ guideSteps.length }}</span>
          <div class="bguide-btns">
            <button class="bguide-btn bguide-btn--text" @click="onSkip">{{ t('guide.skip') }}</button>
            <button v-if="guideStepIndex > 0" class="bguide-btn" @click="prevGuideStep">{{ t('guide.prev') }}</button>
            <button class="bguide-btn bguide-btn--primary" @click="nextGuideStep">
              {{ isLast ? t('guide.done') : t('guide.next') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
  import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import {
    guideActive,
    guideSteps,
    guideStepIndex,
    nextGuideStep,
    prevGuideStep,
    endGuide,
  } from '@/composables/useGuide';

  const { t } = useI18n();
  const router = useRouter();

  const rect = ref<DOMRect | null>(null);
  const current = computed(() => guideSteps.value[guideStepIndex.value] || null);
  const isLast = computed(() => guideStepIndex.value >= guideSteps.value.length - 1);

  let pollTimer = 0;
  function clearPoll() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = 0;
    }
  }

  // 定位当前步:必要时先跨路由跳转,再轮询等目标元素渲染出来,滚动到可视区并取其位置
  async function locate() {
    const step = current.value;
    if (!step) return;
    rect.value = null;
    clearPoll();
    if (step.route && router.currentRoute.value.path !== step.route) {
      router.push(step.route).catch(() => {});
    }
    await nextTick();
    findTarget(step.target, 0);
  }

  function findTarget(selector: string, attempt: number) {
    if (!guideActive.value) return;
    const el = document.querySelector(selector) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // 等滚动稳定再取位置,避免高亮框错位
      pollTimer = window.setTimeout(() => {
        rect.value = el.getBoundingClientRect();
      }, 280);
    } else if (attempt < 40) {
      pollTimer = window.setTimeout(() => findTarget(selector, attempt + 1), 150); // 最多约 6s
    } else {
      // 目标始终找不到(元素被移除/路由异常):结束引导,不卡住用户
      endGuide(false);
    }
  }

  function reposition() {
    const step = current.value;
    if (!step) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (el) rect.value = el.getBoundingClientRect();
  }

  function onSkip() {
    endGuide(true); // 跳过也算「引导过」,不再自动弹
  }

  watch(
    [guideActive, guideStepIndex],
    () => {
      if (guideActive.value) {
        locate();
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
      } else {
        rect.value = null;
        clearPoll();
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    clearPoll();
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
  });

  const PAD = computed(() => current.value?.spotlightPadding ?? 6);

  const spotlightStyle = computed(() => {
    const r = rect.value;
    if (!r) return {};
    const p = PAD.value;
    return {
      left: `${r.left - p}px`,
      top: `${r.top - p}px`,
      width: `${r.width + p * 2}px`,
      height: `${r.height + p * 2}px`,
    };
  });

  // 气泡定位:默认目标下方;下方空间不足则翻到上方;水平方向 clamp 在视口内
  const popStyle = computed(() => {
    const r = rect.value;
    if (!r) return {};
    const POP_W = 300;
    const GAP = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const placement = current.value?.placement || 'auto';
    const below = placement === 'bottom' || (placement === 'auto' && vh - r.bottom > 180);
    const left = Math.min(Math.max(r.left, 12), vw - POP_W - 12);
    const style: Record<string, string> = { left: `${left}px`, width: `${POP_W}px` };
    if (below) style.top = `${r.bottom + GAP}px`;
    else style.bottom = `${vh - r.top + GAP}px`;
    return style;
  });
</script>

<style scoped lang="less">
  .bguide {
    position: fixed;
    inset: 0;
    z-index: 4000;
    /* 遮罩整体拦截点击:引导期间点蒙版/高亮区都不会穿透到底层、误触打断;推进只走气泡上的「下一步/上一步/跳过」,跨页由 step.route 自动跳转 */
    pointer-events: auto;
  }
  .bguide-spotlight {
    position: fixed;
    border-radius: 10px;
    box-shadow: 0 0 0 9999px rgba(15, 18, 38, 0.6);
    outline: 2px solid var(--primary-color);
    outline-offset: 0;
    transition:
      left 0.25s,
      top 0.25s,
      width 0.25s,
      height 0.25s;
    pointer-events: none;
  }
  .bguide-pop {
    position: fixed;
    z-index: 4001;
    pointer-events: auto;
    box-sizing: border-box;
    padding: 16px;
    border-radius: 14px;
    background: var(--card-background, #fff);
    border: 1px solid var(--card-border-color);
    box-shadow: 0 16px 44px -12px rgba(15, 18, 38, 0.4);
    color: var(--text-color);
  }
  .bguide-pop-title {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .bguide-pop-content {
    font-size: 13px;
    line-height: 1.6;
    color: var(--desc-color);
  }
  .bguide-pop-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 14px;
  }
  .bguide-step {
    font-size: 12px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  .bguide-btns {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bguide-btn {
    height: 30px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid var(--card-border-color);
    background: transparent;
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    transition:
      opacity 0.15s,
      background 0.15s;
  }
  .bguide-btn:hover {
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  }
  .bguide-btn--text {
    border-color: transparent;
    color: var(--desc-color);
    padding: 0 6px;
  }
  .bguide-btn--primary {
    border-color: transparent;
    background: var(--primary-color);
    color: #fff;
  }
  .bguide-btn--primary:hover {
    background: var(--primary-color);
    opacity: 0.9;
  }
</style>
