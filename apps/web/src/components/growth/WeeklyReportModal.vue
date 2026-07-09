<template>
  <Teleport to="body">
    <transition name="wr-pop">
      <div v-if="visible" class="wr-overlay" @click.self="close">
        <div ref="cardRef" class="wr-card">
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
            <!-- 称号 + 评语 -->
            <div class="wr-verdict">
              <div class="wr-verdict-badge">{{ verdict.emoji }}</div>
              <div class="wr-verdict-title">{{ verdict.title }}</div>
              <div class="wr-verdict-quote">{{ verdict.quote }}</div>
            </div>

            <!-- 三大核心数字 + 较上周对比 -->
            <div class="wr-stats">
              <div class="wr-stat">
                <b class="wr-stat-num wr-c-exp">+{{ animExp }}</b>
                <span>{{ t('growth.wrExp') }}</span>
                <em class="wr-cmp" :class="cmpExp.dir">{{ cmpText(cmpExp) }}</em>
              </div>
              <div class="wr-stat">
                <b class="wr-stat-num wr-c-fire">{{ animCheckin }}<i v-if="(report?.checkinDays || 0) > 0" class="wr-fire">🔥</i></b>
                <span>{{ t('growth.wrCheckin') }}</span>
                <em class="wr-cmp flat">{{ t('growth.wrKeepUp') }}</em>
              </div>
              <div class="wr-stat">
                <b class="wr-stat-num wr-c-total">{{ animTotal }}</b>
                <span>{{ t('growth.wrTotal') }}</span>
                <em class="wr-cmp" :class="cmpTotal.dir">{{ cmpText(cmpTotal) }}</em>
              </div>
            </div>

            <!-- 资源条形图 + 各自较上周 -->
            <div class="wr-bars">
              <div v-for="b in bars" :key="b.key" class="wr-bar-row">
                <span class="wr-bar-label">{{ b.label }}</span>
                <div class="wr-bar-track">
                  <div class="wr-bar-fill" :style="{ width: (barsReady ? b.pct : 0) + '%', background: b.color }"></div>
                </div>
                <span class="wr-bar-val">
                  {{ b.val }}<em class="wr-bar-cmp" :class="b.dir">{{ b.cmp }}</em>
                </span>
              </div>
            </div>

            <!-- 段位 -->
            <div class="wr-level">
              <span class="wr-level-badge" :style="{ background: levelGradient }">Lv.{{ report?.level }}</span>
              <span class="wr-level-name">{{ report?.levelName }}</span>
            </div>

            <button class="wr-export" @click="exportImage" :disabled="exporting">
              📸 {{ exporting ? t('growth.wrExporting') : t('growth.wrExport') }}
            </button>
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
  const cardRef = ref<HTMLElement | null>(null);
  const exporting = ref(false);

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

  // 较上周对比
  function delta(cur: number, prev: number) {
    const d = (cur || 0) - (prev || 0);
    return { d, dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
  }
  function cmpText(c: { d: number; dir: string }) {
    if (c.dir === 'up') return `↑ ${c.d}`;
    if (c.dir === 'down') return `↓ ${-c.d}`;
    return t('growth.wrFlat');
  }
  const cmpExp = computed(() => delta(props.report?.exp, props.report?.prev?.exp));
  const cmpTotal = computed(() => {
    const r = props.report;
    if (!r) return delta(0, 0);
    const cur = (r.bookmarks || 0) + (r.notes || 0) + (r.files || 0);
    const prev = (r.prev?.bookmarks || 0) + (r.prev?.notes || 0) + (r.prev?.files || 0);
    return delta(cur, prev);
  });

  const bars = computed(() => {
    const r = props.report;
    if (!r) return [];
    const p = r.prev || {};
    const items = [
      { key: 'bookmark', label: t('growth.wrBookmark'), val: r.bookmarks || 0, prev: p.bookmarks || 0, color: 'linear-gradient(90deg, #a855f7, #6366f1)' },
      { key: 'note', label: t('growth.wrNote'), val: r.notes || 0, prev: p.notes || 0, color: 'linear-gradient(90deg, #f472b6, #f43f5e)' },
      { key: 'file', label: t('growth.wrFile'), val: r.files || 0, prev: p.files || 0, color: 'linear-gradient(90deg, #22d3ee, #3b82f6)' },
    ];
    const max = Math.max(1, ...items.map((i) => i.val));
    return items.map((i) => {
      const c = delta(i.val, i.prev);
      return { ...i, pct: Math.round((i.val / max) * 100), dir: c.dir, cmp: c.dir === 'flat' ? '' : c.dir === 'up' ? ` ↑${c.d}` : ` ↓${-c.d}` };
    });
  });

  const levelGradient = computed(() => {
    const lv = props.report?.level || 1;
    if (lv >= 13) return 'linear-gradient(135deg, #f43f5e, #fb923c)';
    if (lv >= 10) return 'linear-gradient(135deg, #f59e0b, #fbbf24)';
    if (lv >= 7) return 'linear-gradient(135deg, #a855f7, #8b5cf6)';
    if (lv >= 4) return 'linear-gradient(135deg, #3b82f6, #22d3ee)';
    return 'linear-gradient(135deg, #94a3b8, #cbd5e1)';
  });

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

  async function exportImage() {
    if (!cardRef.value || exporting.value) return;
    exporting.value = true;
    try {
      const html2canvas = (await import('html2canvas')).default; // 懒加载:仅点导出时拉取 ~48kB
      const canvas = await html2canvas(cardRef.value, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        ignoreElements: (el) => el.classList?.contains('wr-close') || el.classList?.contains('wr-export'),
        onclone: (doc: Document) => {
          // html2canvas 不支持 background-clip:text,渐变字会被渲染成矩形色块;
          // 导出时把这些渐变文字降级为对应纯色,避免数字背后出现色块。
          const map: [string, string][] = [
            ['.wr-c-exp', '#a5b4fc'],
            ['.wr-c-fire', '#fb923c'],
            ['.wr-c-total', '#38bdf8'],
            ['.wr-verdict-title', '#c4b5fd'],
          ];
          map.forEach(([sel, color]) => {
            doc.querySelectorAll<HTMLElement>(sel).forEach((el) => {
              el.style.background = 'none';
              el.style.backgroundClip = 'border-box';
              el.style.webkitBackgroundClip = 'border-box';
              el.style.webkitTextFillColor = color;
              el.style.color = color;
            });
          });
        },
      });
      const link = document.createElement('a');
      link.download = `轻笺周报-${props.report?.generatedAt || ''}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('导出周报失败:', e);
    } finally {
      exporting.value = false;
    }
  }

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
    padding: 8px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

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

  .wr-stats {
    display: flex;
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
    animation: wr-flame 0.85s ease-in-out infinite alternate;
    filter: drop-shadow(0 0 6px rgba(251, 146, 60, 0.85));
  }
  @keyframes wr-flame {
    from {
      transform: scale(1) rotate(-4deg);
    }
    to {
      transform: scale(1.22) rotate(4deg);
    }
  }
  .wr-stat span {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.6);
  }
  .wr-cmp {
    font-size: 10.5px;
    font-weight: 700;
    font-style: normal;
  }
  .wr-cmp.up {
    color: #4ade80;
  }
  .wr-cmp.down {
    color: #f87171;
  }
  .wr-cmp.flat {
    color: rgba(255, 255, 255, 0.42);
  }

  .wr-bars {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .wr-bar-row {
    display: grid;
    grid-template-columns: 48px 1fr 62px;
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
  .wr-bar-cmp {
    font-size: 10px;
    font-weight: 700;
    font-style: normal;
    margin-left: 3px;
  }
  .wr-bar-cmp.up {
    color: #4ade80;
  }
  .wr-bar-cmp.down {
    color: #f87171;
  }

  .wr-level {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
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

  .wr-export {
    align-self: center;
    margin-top: 2px;
    padding: 9px 22px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .wr-export:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }
  .wr-export:disabled {
    opacity: 0.6;
    cursor: default;
  }

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
