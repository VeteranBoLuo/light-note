<template>
  <Teleport to="body">
    <transition name="wr-pop">
      <div v-if="visible" class="wr-overlay" @click.self="close">
        <div class="wr-card">
          <button class="wr-close" @click="close" aria-label="close">×</button>

          <!-- 渐变头图 -->
          <div class="wr-banner">
            <div class="wr-orb wr-orb-1"></div>
            <div class="wr-orb wr-orb-2"></div>
            <div class="wr-banner-inner">
              <div class="wr-banner-emoji">📊</div>
              <div class="wr-banner-title">{{ t('growth.weeklyReportTitle') }}</div>
              <div class="wr-banner-date">{{ report?.generatedAt || '' }} · {{ t('growth.weeklyReportSub') }}</div>
            </div>
          </div>

          <div class="wr-body">
            <!-- 两个大数字:经验 + 签到 -->
            <div class="wr-hero">
              <div class="wr-hero-num">
                <b class="wr-hero-exp">+{{ animExp }}</b>
                <span>{{ t('growth.wrExp') }}</span>
              </div>
              <div class="wr-hero-divider"></div>
              <div class="wr-hero-num">
                <b class="wr-hero-checkin">{{ animCheckin }}</b>
                <span>{{ t('growth.wrCheckin') }}</span>
              </div>
            </div>

            <!-- 资源条形图 -->
            <div class="wr-bars">
              <div v-for="b in bars" :key="b.key" class="wr-bar-row">
                <span class="wr-bar-label">{{ b.label }}</span>
                <div class="wr-bar-track">
                  <div class="wr-bar-fill" :style="{ width: (barsReady ? b.pct : 0) + '%', background: b.color }"></div>
                </div>
                <span class="wr-bar-val">{{ b.val }}</span>
              </div>
            </div>

            <!-- 段位徽章 + 金句 -->
            <div class="wr-level">
              <span class="wr-level-badge" :style="{ background: levelGradient }">Lv.{{ report?.level }}</span>
              <span class="wr-level-name">{{ report?.levelName }}</span>
            </div>
            <div class="wr-quote">{{ summary }}</div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, ref, watch, nextTick } from 'vue';
  import { useI18n } from 'vue-i18n';

  const props = defineProps<{ visible: boolean; report: any }>();
  const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();
  const { t } = useI18n();

  const animExp = ref(0);
  const animCheckin = ref(0);
  const barsReady = ref(false);

  function close() {
    emit('update:visible', false);
  }

  // 数字滚动(easeOutCubic),让大数字有「涨上去」的动感
  function countUp(target: number, setter: (v: number) => void, dur = 900) {
    const t0 = performance.now();
    function tick(now: number) {
      const p = Math.min(1, (now - t0) / dur);
      setter(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const bars = computed(() => {
    const r = props.report;
    if (!r) return [];
    const items = [
      { key: 'bookmark', label: t('growth.wrBookmark'), val: r.bookmarks || 0, color: 'linear-gradient(90deg, #a855f7, #6366f1)' },
      { key: 'note', label: t('growth.wrNote'), val: r.notes || 0, color: 'linear-gradient(90deg, #ec4899, #f43f5e)' },
      { key: 'file', label: t('growth.wrFile'), val: r.files || 0, color: 'linear-gradient(90deg, #22d3ee, #3b82f6)' },
    ];
    const max = Math.max(1, ...items.map((i) => i.val));
    return items.map((i) => ({ ...i, pct: Math.round((i.val / max) * 100) }));
  });

  const levelGradient = computed(() => {
    const lv = props.report?.level || 1;
    if (lv >= 13) return 'linear-gradient(135deg, #f43f5e, #fb923c)';
    if (lv >= 10) return 'linear-gradient(135deg, #f59e0b, #fbbf24)';
    if (lv >= 7) return 'linear-gradient(135deg, #a855f7, #8b5cf6)';
    if (lv >= 4) return 'linear-gradient(135deg, #3b82f6, #22d3ee)';
    return 'linear-gradient(135deg, #94a3b8, #cbd5e1)';
  });

  const summary = computed(() => {
    const r = props.report;
    if (!r) return '';
    const total = (r.bookmarks || 0) + (r.notes || 0) + (r.files || 0);
    if (total === 0 && !r.exp && !r.checkinDays) return t('growth.wrEmpty');
    return t('growth.wrSummary', { n: total, exp: r.exp });
  });

  // 每次打开:数字从 0 滚动、条形从 0 长出
  watch(
    () => props.visible,
    (v) => {
      if (v && props.report) {
        animExp.value = 0;
        animCheckin.value = 0;
        barsReady.value = false;
        countUp(props.report.exp || 0, (n) => (animExp.value = n));
        countUp(props.report.checkinDays || 0, (n) => (animCheckin.value = n));
        nextTick(() => setTimeout(() => (barsReady.value = true), 120));
      }
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .wr-overlay {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 18, 40, 0.55);
    backdrop-filter: blur(6px);
  }
  .wr-card {
    position: relative;
    width: 100%;
    max-width: 460px;
    border-radius: 24px;
    overflow: hidden;
    background: var(--background-color);
    box-shadow: 0 30px 80px -24px rgba(20, 20, 60, 0.6);
  }
  .wr-close {
    position: absolute;
    top: 12px;
    right: 14px;
    z-index: 3;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.22);
    color: #fff;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    transition: background 0.15s;
  }
  .wr-close:hover {
    background: rgba(255, 255, 255, 0.4);
  }

  /* 渐变头图 */
  .wr-banner {
    position: relative;
    padding: 30px 24px 26px;
    background: linear-gradient(135deg, #7c3aed 0%, #2563eb 55%, #06b6d4 100%);
    overflow: hidden;
    text-align: center;
    color: #fff;
  }
  .wr-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(6px);
    opacity: 0.5;
    pointer-events: none;
  }
  .wr-orb-1 {
    width: 130px;
    height: 130px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.5), transparent 70%);
    top: -40px;
    right: -20px;
  }
  .wr-orb-2 {
    width: 100px;
    height: 100px;
    background: radial-gradient(circle, rgba(236, 72, 153, 0.6), transparent 70%);
    bottom: -30px;
    left: -10px;
  }
  .wr-banner-inner {
    position: relative;
    z-index: 1;
  }
  .wr-banner-emoji {
    font-size: 40px;
    line-height: 1;
  }
  .wr-banner-title {
    margin-top: 8px;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 0.02em;
  }
  .wr-banner-date {
    margin-top: 5px;
    font-size: 12.5px;
    opacity: 0.85;
  }

  .wr-body {
    padding: 24px 24px 26px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  /* 两个大数字 */
  .wr-hero {
    display: flex;
    align-items: center;
    justify-content: space-around;
  }
  .wr-hero-num {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: 1;
  }
  .wr-hero-num b {
    font-size: 44px;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .wr-hero-exp {
    background: linear-gradient(135deg, #7c3aed, #2563eb);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .wr-hero-checkin {
    background: linear-gradient(135deg, #f43f5e, #fb923c);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .wr-hero-num span {
    font-size: 12.5px;
    color: var(--desc-color);
  }
  .wr-hero-divider {
    width: 1px;
    height: 44px;
    background: color-mix(in srgb, var(--card-border-color) 60%, transparent);
  }

  /* 资源条形图 */
  .wr-bars {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .wr-bar-row {
    display: grid;
    grid-template-columns: 52px 1fr 32px;
    align-items: center;
    gap: 10px;
  }
  .wr-bar-label {
    font-size: 12.5px;
    color: var(--desc-color);
  }
  .wr-bar-track {
    height: 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 35%, transparent);
    overflow: hidden;
  }
  .wr-bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .wr-bar-val {
    font-size: 13px;
    font-weight: 700;
    text-align: right;
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }

  /* 段位徽章 + 金句 */
  .wr-level {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .wr-level-badge {
    padding: 4px 12px;
    border-radius: 999px;
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.5);
  }
  .wr-level-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-color);
  }
  .wr-quote {
    text-align: center;
    font-size: 13.5px;
    line-height: 1.7;
    color: var(--desc-color);
    padding: 0 6px;
  }

  /* 入场动画 */
  .wr-pop-enter-active {
    transition: opacity 0.25s ease;
  }
  .wr-pop-leave-active {
    transition: opacity 0.2s ease;
  }
  .wr-pop-enter-from,
  .wr-pop-leave-to {
    opacity: 0;
  }
  .wr-pop-enter-active .wr-card {
    animation: wr-in 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes wr-in {
    from {
      transform: translateY(24px) scale(0.94);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  @media (max-width: 520px) {
    .wr-hero-num b {
      font-size: 38px;
    }
  }
</style>
