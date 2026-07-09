<template>
  <Teleport to="body">
    <transition name="wr-pop">
      <div v-if="visible" class="wr-overlay" @click.self="close">
        <div class="wr-card">
          <button class="wr-close" @click="close" aria-label="close">×</button>

          <!-- 星空 + 渐变头图 -->
          <div class="wr-banner">
            <span v-for="s in stars" :key="s.i" class="wr-star" :style="s.style">✦</span>
            <div class="wr-orb wr-orb-1"></div>
            <div class="wr-orb wr-orb-2"></div>
            <div class="wr-banner-inner">
              <div class="wr-banner-kicker">{{ report?.generatedAt || '' }} · {{ t('growth.weeklyReportSub') }}</div>
              <div class="wr-banner-title">{{ t('growth.weeklyReportTitle') }}</div>
            </div>
          </div>

          <div class="wr-body">
            <!-- 称号 + 评语(核心)-->
            <div class="wr-verdict">
              <div class="wr-verdict-badge">{{ verdict.emoji }}</div>
              <div class="wr-verdict-title">{{ verdict.title }}</div>
              <div class="wr-verdict-quote">{{ verdict.quote }}</div>
            </div>

            <!-- 三大核心数字:经验 / 签到 / 总产出 -->
            <div class="wr-stats">
              <div class="wr-stat">
                <b class="wr-stat-num wr-c-exp">+{{ animExp }}</b>
                <span>{{ t('growth.wrExp') }}</span>
              </div>
              <div class="wr-stat">
                <b class="wr-stat-num wr-c-fire">{{ animCheckin }}<i class="wr-fire">🔥</i></b>
                <span>{{ t('growth.wrCheckin') }}</span>
              </div>
              <div class="wr-stat">
                <b class="wr-stat-num wr-c-total">{{ animTotal }}</b>
                <span>{{ t('growth.wrTotal') }}</span>
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

            <!-- 段位 -->
            <div class="wr-level">
              <span class="wr-level-badge" :style="{ background: levelGradient }">Lv.{{ report?.level }}</span>
              <span class="wr-level-name">{{ report?.levelName }}</span>
            </div>
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
  const animTotal = ref(0);
  const barsReady = ref(false);

  // 头图星点(固定伪随机,不用 Math.random 以免每帧抖动)
  const stars = Array.from({ length: 9 }, (_, i) => {
    const top = (i * 37) % 90;
    const left = (i * 53 + 7) % 96;
    const size = 8 + ((i * 5) % 8);
    const op = 0.3 + ((i * 3) % 5) / 10;
    return { i, style: `top:${top}%;left:${left}%;font-size:${size}px;opacity:${op};animation-delay:${i * 0.2}s` };
  });

  function close() {
    emit('update:visible', false);
  }

  function countUp(target: number, setter: (v: number) => void, dur = 950) {
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
      { key: 'note', label: t('growth.wrNote'), val: r.notes || 0, color: 'linear-gradient(90deg, #f472b6, #f43f5e)' },
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

  // 动态称号 + 评语:按数据优先级判定,给个性化点评(9 档)
  const verdict = computed(() => {
    const r = props.report || {};
    const b = r.bookmarks || 0;
    const n = r.notes || 0;
    const f = r.files || 0;
    const e = r.exp || 0;
    const c = r.checkinDays || 0;
    const total = b + n + f;
    if (c >= 7) return { emoji: '🔥', title: '全勤标兵', quote: '连续 7 天从未缺席,自律就是你的超能力!' };
    if (total === 0 && !e && !c) return { emoji: '🌊', title: '静水流深', quote: '本周小憩了一下,新的一周,期待你的第一条记录~' };
    if (b >= 20) return { emoji: '📚', title: '收藏家', quote: `一周收入 ${b} 条书签,你的知识库正在疯狂生长!` };
    if (n >= 10) return { emoji: '✍️', title: '笔耕不辍', quote: `${n} 篇笔记落笔,思考的深度令人佩服!` };
    if (f >= 10) return { emoji: '🗂️', title: '归档大师', quote: `${f} 个文件收纳有序,整理力拉满!` };
    if (e >= 200) return { emoji: '🚀', title: '成长飞速', quote: `本周狂揽 ${e} 点经验,火箭般的上升势头!` };
    if (total >= 10) return { emoji: '⭐', title: '稳步前行', quote: `新增 ${total} 项内容,积累的力量不可小觑!` };
    if (c >= 3) return { emoji: '📅', title: '节奏大师', quote: `本周签到 ${c} 天,好习惯正在养成!` };
    return { emoji: '🌱', title: '成长新芽', quote: '每一次记录都是成长的种子,继续加油!' };
  });

  watch(
    () => props.visible,
    (v) => {
      if (v && props.report) {
        const r = props.report;
        const total = (r.bookmarks || 0) + (r.notes || 0) + (r.files || 0);
        animExp.value = 0;
        animCheckin.value = 0;
        animTotal.value = 0;
        barsReady.value = false;
        countUp(r.exp || 0, (x) => (animExp.value = x));
        countUp(r.checkinDays || 0, (x) => (animCheckin.value = x));
        countUp(total, (x) => (animTotal.value = x));
        nextTick(() => setTimeout(() => (barsReady.value = true), 150));
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
    background: rgba(8, 10, 25, 0.66);
    backdrop-filter: blur(7px);
  }
  /* 深色沉浸卡片(不跟随主题,周报是特殊时刻) */
  .wr-card {
    position: relative;
    width: 100%;
    max-width: 468px;
    border-radius: 26px;
    overflow: hidden;
    background: linear-gradient(168deg, #221a4d 0%, #14132e 46%, #0c1024 100%);
    box-shadow:
      0 34px 90px -26px rgba(10, 8, 40, 0.85),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    color: #fff;
  }
  .wr-close {
    position: absolute;
    top: 12px;
    right: 14px;
    z-index: 4;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    transition: background 0.15s;
  }
  .wr-close:hover {
    background: rgba(255, 255, 255, 0.32);
  }

  /* 头图 */
  .wr-banner {
    position: relative;
    padding: 26px 24px 20px;
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.5), rgba(37, 99, 235, 0.4) 55%, rgba(6, 182, 212, 0.35));
    overflow: hidden;
    text-align: center;
  }
  .wr-star {
    position: absolute;
    color: #fff;
    animation: wr-twinkle 2.6s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes wr-twinkle {
    0%,
    100% {
      opacity: 0.25;
      transform: scale(0.8);
    }
    50% {
      opacity: 0.9;
      transform: scale(1.15);
    }
  }
  .wr-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(10px);
    opacity: 0.55;
    pointer-events: none;
  }
  .wr-orb-1 {
    width: 150px;
    height: 150px;
    background: radial-gradient(circle, rgba(168, 85, 247, 0.7), transparent 70%);
    top: -54px;
    right: -30px;
  }
  .wr-orb-2 {
    width: 120px;
    height: 120px;
    background: radial-gradient(circle, rgba(34, 211, 238, 0.6), transparent 70%);
    bottom: -46px;
    left: -20px;
  }
  .wr-banner-inner {
    position: relative;
    z-index: 1;
  }
  .wr-banner-kicker {
    font-size: 12px;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.78);
  }
  .wr-banner-title {
    margin-top: 4px;
    font-size: 21px;
    font-weight: 800;
    letter-spacing: 0.02em;
    text-shadow: 0 2px 14px rgba(124, 58, 237, 0.6);
  }

  .wr-body {
    padding: 8px 24px 26px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* 称号 + 评语 */
  .wr-verdict {
    text-align: center;
    padding: 6px 0 2px;
  }
  .wr-verdict-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 76px;
    height: 76px;
    border-radius: 24px;
    font-size: 42px;
    background: radial-gradient(circle at 30% 25%, rgba(168, 85, 247, 0.45), rgba(37, 99, 235, 0.25));
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.12),
      0 12px 30px -8px rgba(124, 58, 237, 0.7);
    animation: wr-float 3s ease-in-out infinite;
  }
  @keyframes wr-float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-6px);
    }
  }
  .wr-verdict-title {
    margin-top: 12px;
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 0.01em;
    background: linear-gradient(100deg, #c4b5fd, #a5b4fc 40%, #67e8f9);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .wr-verdict-quote {
    margin-top: 8px;
    font-size: 13.5px;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.72);
    padding: 0 8px;
  }

  /* 三大数字 */
  .wr-stats {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    padding: 14px 4px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .wr-stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .wr-stat-num {
    font-size: 30px;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    display: inline-flex;
    align-items: baseline;
  }
  .wr-c-exp {
    background: linear-gradient(135deg, #c4b5fd, #818cf8);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .wr-c-fire {
    background: linear-gradient(135deg, #fb923c, #f43f5e);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .wr-c-total {
    background: linear-gradient(135deg, #67e8f9, #38bdf8);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .wr-fire {
    font-size: 15px;
    margin-left: 2px;
    -webkit-text-fill-color: initial;
  }
  .wr-stat span {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.6);
  }

  /* 条形图 */
  .wr-bars {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .wr-bar-row {
    display: grid;
    grid-template-columns: 48px 1fr 30px;
    align-items: center;
    gap: 10px;
  }
  .wr-bar-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.62);
  }
  .wr-bar-track {
    height: 11px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .wr-bar-fill {
    height: 100%;
    border-radius: 999px;
    box-shadow: 0 0 12px -2px currentColor;
    transition: width 0.95s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .wr-bar-val {
    font-size: 13px;
    font-weight: 700;
    text-align: right;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }

  /* 段位 */
  .wr-level {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding-top: 2px;
  }
  .wr-level-badge {
    padding: 4px 13px;
    border-radius: 999px;
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    box-shadow: 0 6px 18px -6px rgba(0, 0, 0, 0.6);
  }
  .wr-level-name {
    font-size: 15px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.92);
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
    animation: wr-in 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes wr-in {
    from {
      transform: translateY(28px) scale(0.92);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  @media (max-width: 520px) {
    .wr-stat-num {
      font-size: 25px;
    }
    .wr-verdict-title {
      font-size: 21px;
    }
  }
</style>
