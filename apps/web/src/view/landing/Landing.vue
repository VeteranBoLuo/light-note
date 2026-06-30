<template>
  <div class="landing" :data-theme="theme">
    <canvas ref="canvasRef" class="bg-canvas"></canvas>

    <div class="slides" ref="slidesRef" @scroll="onScroll">
      <!-- ==================== Slide 1: Cover ==================== -->
      <section class="slide s-cover" data-index="0">
        <div class="slide-bg">
          <div class="orb o1"></div>
          <div class="orb o2"></div>
          <div class="orb o3"></div>
          <div class="grid-overlay"></div>
        </div>
        <div class="slide-inner center">
          <div class="float-elements">
            <span class="float-el el-1">🔖</span>
            <span class="float-el el-2">📝</span>
            <span class="float-el el-3">☁️</span>
            <span class="float-el el-4">🏷️</span>
          </div>
          <div class="cover-layout">
            <div class="cover-text">
              <div class="logo-badge" ref="badgeRef">LIGHT NOTE</div>
              <h1 class="hero-title" ref="titleRef">
                <span class="hero-brand">轻 笺</span>
                <span class="hero-tagline">你的数字生活收纳盒</span>
              </h1>
              <div class="hero-actions">
                <button class="btn-primary" @click="goHome" v-click-log="{ module: '官网首页', operation: '免费体验' }">
                  <span>免费体验</span>
                  <svg class="btn-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 12h14M13 5l7 7-7 7"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
                <button
                  class="btn-ghost"
                  @click="scrollTo(1)"
                  v-click-log="{ module: '官网首页', operation: '看看功能' }"
                  >看看功能</button
                >
              </div>
            </div>
            <div class="cover-mockup">
              <div class="mockup-wrapper">
                <!-- Browser window frame -->
                <div class="mockup-header">
                  <div class="win-dots">
                    <span class="dot d-red"></span>
                    <span class="dot d-yellow"></span>
                    <span class="dot d-green"></span>
                  </div>
                  <div class="win-url">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3.5 9h17M3.5 15h17"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>
                    <span>轻笺 · {{ ['书签', '笔记', '云空间'][previewIndex] }}</span>
                  </div>
                </div>
                <div class="mockup-carousel">
                  <div class="mockup-slides" :style="{ transform: `translateX(-${previewIndex * 100}%)` }">
                    <div class="mockup-screen">
                      <div class="screen-glare"></div>
                      <img src="/eg-bookamrk.png" alt="书签管理" />
                    </div>
                    <div class="mockup-screen">
                      <div class="screen-glare"></div>
                      <img src="/eg-note.png" alt="笔记库" />
                    </div>
                    <div class="mockup-screen">
                      <div class="screen-glare"></div>
                      <img src="/eg-cloudSpace.png" alt="云空间" />
                    </div>
                  </div>
                </div>
                <div class="mockup-notch"></div>
                <div class="carousel-dots">
                  <button
                    v-for="(_, i) in 3"
                    :key="i"
                    :class="['carousel-dot', { active: previewIndex === i }]"
                    @click="previewIndex = i"
                    v-click-log="{ module: '官网首页', operation: '切换预览图' }"
                  >
                    <span class="dot-indicator"></span>
                    <span class="dot-label">{{ ['书签', '笔记', '云空间'][i] }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ==================== Slide 2: 三个核心 ==================== -->
      <section class="slide s-modules" data-index="1">
        <div class="slide-bg">
          <div class="orb o4"></div>
          <div class="orb o5"></div>
        </div>
        <div class="slide-inner center">
          <div class="section-badge">CORE</div>
          <h2>一站式收纳</h2>
          <p class="section-sub">替代浏览器收藏夹 + 笔记软件 + 网盘，三合一的数字生活空间</p>
          <div class="core-grid">
            <div
              v-for="(c, i) in cores"
              :key="i"
              class="core-card"
              :class="{ visible: visible[1] }"
              @mousemove="onCardMove($event, i)"
              @mouseleave="onCardLeave(i)"
              :ref="
                (el) => {
                  if (el) cardRefs[i] = el as HTMLElement;
                }
              "
            >
              <div class="core-glow" :class="c.color"></div>
              <div class="core-icon-wrap" :class="c.color">
                <span class="core-icon">{{ c.icon }}</span>
              </div>
              <h3>{{ c.title }}</h3>
              <p>{{ c.desc }}</p>
              <div class="core-tags">
                <span v-for="f in c.tags" :key="f" class="tag">{{ f }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ==================== Slide 3: 功能展示 ==================== -->
      <section class="slide s-features" data-index="2">
        <div class="slide-bg">
          <div class="orb o6"></div>
        </div>
        <div class="slide-inner center">
          <div class="section-badge">FEATURES</div>
          <h2>更多好用的能力</h2>
          <p class="section-sub">不止是存储，给你更多</p>
          <div class="features-grid">
            <div v-for="(f, i) in features" :key="i" class="feat-card" :class="{ visible: visible[2] }">
              <div class="feat-icon">{{ f.icon }}</div>
              <div class="feat-info">
                <div class="feat-title">{{ f.title }}</div>
                <div class="feat-desc">{{ f.desc }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ==================== Slide 4: 为什么选 ==================== -->
      <section class="slide s-why" data-index="3">
        <div class="slide-bg">
          <div class="orb o7"></div>
          <div class="orb o8"></div>
        </div>
        <div class="slide-inner center" :style="{ maxWidth: 'max(800px, min(42vw, 1050px))' }">
          <div class="section-badge">WHY</div>
          <h2>为什么选轻笺</h2>
          <div class="reasons-wrap">
            <div
              v-for="(r, i) in reasons"
              :key="i"
              class="reason-card"
              :class="{ visible: visible[3] }"
              :style="{ transitionDelay: `${i * 0.1}s` }"
            >
              <div class="reason-icon" :style="{ background: r.bg }">{{ r.icon }}</div>
              <div>
                <div class="reason-title">{{ r.title }}</div>
                <div class="reason-desc">{{ r.desc }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ==================== Slide 5: CTA ==================== -->
      <section class="slide s-cta" data-index="4">
        <div class="slide-bg">
          <div class="orb o9"></div>
          <div class="orb o10"></div>
        </div>
        <div class="slide-inner center">
          <div class="cta-glass">
            <div class="cta-particle p1"></div>
            <div class="cta-particle p2"></div>
            <div class="cta-particle p3"></div>
            <div class="cta-emoji">✨</div>
            <h2 class="cta-title">准备好了吗？</h2>
            <p class="cta-desc">无需下载，打开浏览器就能用</p>
            <button
              class="btn-primary btn-large"
              @click="goHome"
              v-click-log="{ module: '官网首页', operation: '开始使用' }"
            >
              开始使用
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12h14M13 5l7 7-7 7"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
          <div class="cta-foot">boluo66.top</div>
          <div class="landing-footer">
            <span>© 2024 轻笺</span>
            <span class="footer-sep">|</span>
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">蜀ICP备2026017699号-1</a>
            <span class="footer-sep">|</span>
            <a href="#" @click.prevent="handleContact">联系我们</a>
            <span class="footer-sep">|</span>
            <a href="https://github.com/VeteranBoLuo" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </div>
      </section>
    </div>

    <!-- Nav -->
    <div class="nav-dots">
      <button
        v-for="(_, i) in 5"
        :key="i"
        :class="['nav-dot', { active: current === i }]"
        @click="goTo(i)"
        v-click-log="{ module: '官网首页', operation: '切换幻灯片' }"
      >
        <span class="dot-tooltip">{{ ['封面', '核心', '功能', '理由', '开始'][i] }}</span>
      </button>
    </div>
    <div class="slide-counter" :class="{ pulse: animating }">{{
      ['封面', '核心', '功能', '理由', '开始'][current]
    }}</div>

    <!-- Contact Modal -->
    <div v-if="showContactModal" class="contact-overlay" @click.self="showContactModal = false">
      <div class="contact-dialog">
        <button class="contact-dialog__close" @click="showContactModal = false">×</button>
        <div class="contact-dialog__header">联系我们</div>
        <div class="contact-dialog__email">邮箱：1902013368@qq.com</div>
        <div class="contact-dialog__field">
          <label>写下你的反馈意见</label>
          <textarea
            v-model="feedbackContent"
            class="contact-dialog__input"
            placeholder="功能建议、问题反馈、任何你想说的…"
            rows="4"
          ></textarea>
        </div>
        <button
          class="contact-dialog__submit"
          :disabled="!feedbackContent.trim() || submitting"
          @click="submitFeedback"
        >
          {{ submitting ? '提交中…' : '提交反馈' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted, onBeforeUnmount } from 'vue';
  import { useRouter } from 'vue-router';
  import { useUserStore } from '@/store';
  import { apiBasePost } from '@/http/request';

  const router = useRouter();
  const user = useUserStore();
  const theme = ref(user.preferences?.theme || 'day');
  const slidesRef = ref<HTMLElement>();
  const canvasRef = ref<HTMLCanvasElement>();
  const badgeRef = ref<HTMLElement>();
  const titleRef = ref<HTMLElement>();
  const cardRefs = ref<HTMLElement[]>([]);
  const current = ref(0);
  const previewIndex = ref(0);
  const visible = ref({ 1: false, 2: false, 3: false });
  const animating = ref(false);
  const showContactModal = ref(false);
  const feedbackContent = ref('');
  const submitting = ref(false);

  function goTo(i: number) {
    slidesRef.value?.children[i]?.scrollIntoView({ behavior: 'smooth' });
  }
  function scrollTo(i: number) {
    goTo(i);
  }
  function goHome() {
    router.push('/home');
  }
  function handleContact() {
    showContactModal.value = true;
    feedbackContent.value = '';
  }
  function showToast(msg: string) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    Object.assign(toast.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(0,0,0,.78)',
      color: '#eee',
      padding: '14px 28px',
      borderRadius: '8px',
      fontSize: '14px',
      zIndex: '9999',
      transition: 'opacity .3s',
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 1800);
  }
  async function submitFeedback() {
    const content = feedbackContent.value.trim();
    if (!content) return;
    submitting.value = true;
    try {
      const res = await apiBasePost('/api/opinion/recordOpinion', {
        type: '官网反馈',
        content,
        imgArray: '[]',
      });
      if (res.status === 200) {
        showContactModal.value = false;
        feedbackContent.value = '';
        showToast('反馈已提交，感谢你的建议');
      } else {
        showToast('提交失败，请稍后重试');
      }
    } catch {
      showToast('网络错误，请稍后重试');
    } finally {
      submitting.value = false;
    }
  }

  const cores = [
    {
      icon: '🔖',
      title: '书签',
      color: 'purple',
      desc: '看到好文章一键收藏，打标签随手搜',
      tags: ['自动抓取', '标签树', '多标签过滤'],
    },
    {
      icon: '📝',
      title: '笔记',
      color: 'green',
      desc: '富文本编辑器，文件夹归类，目录导航',
      tags: ['图文表格', '代码高亮', '导出 PDF'],
    },
    {
      icon: '☁️',
      title: '云空间',
      color: 'orange',
      desc: '文件上传预览分享，卡片列表双视图',
      tags: ['Office 预览', '批量操作', '外部分享'],
    },
  ];

  const features = [
    { icon: '🏷️', title: '统一标签', desc: '书签·笔记·文件共享标签体系，一个标签关联所有' },
    { icon: '🔍', title: '全局搜索', desc: '跨模块统一检索，关键词+标签联合过滤' },
    { icon: '🤖', title: 'AI 助手', desc: '内嵌 AI 对话，辅助知识处理，上下文问答' },
    { icon: '🌙', title: '深色主题', desc: '浅色/深色一键切换，CSS 变量体系，护眼舒适' },
    { icon: '📱', title: '移动端', desc: '两套独立布局，触控优化，路上也能用' },
    { icon: '🌐', title: '中英文', desc: '完整双语支持，vue-i18n，切换无感' },
  ];

  const reasons = [
    {
      icon: '💪',
      title: '持续更新',
      desc: '功能不断迭代，每次打开都有新惊喜',
      bg: 'rgba(99,92,237,.12)',
    },
    { icon: '🆓', title: '完全免费', desc: '无需付费，打开浏览器就能使用所有功能', bg: 'rgba(0,168,132,.12)' },
    { icon: '🌱', title: '越用越聪明', desc: '标签串联内容，知识网络越来越密', bg: 'rgba(255,138,0,.12)' },
    {
      icon: '⚡',
      title: '快，不废话',
      desc: 'SPA 单页应用，即搜即得，不像大平台那样慢吞吞',
      bg: 'rgba(236,72,153,.12)',
    },
  ];

  // Card 3D tilt
  function onCardMove(e: MouseEvent, i: number) {
    const card = cardRefs.value[i];
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const mx = (x / rect.width - 0.5) * 12;
    const my = (y / rect.height - 0.5) * -12;
    card.style.transform = `perspective(600px) rotateY(${mx}deg) rotateX(${my}deg) translateY(-8px)`;
  }
  function onCardLeave(i: number) {
    const card = cardRefs.value[i];
    if (!card) return;
    card.style.transform = 'perspective(600px) rotateY(0) rotateX(0) translateY(0)';
  }

  // Canvas particles
  let animId = 0;
  function onScroll() {
    const s = slidesRef.value;
    if (!s) return;
    const idx = Math.round(s.scrollTop / s.clientHeight);
    current.value = idx;
    // Toggle visibility for each section
    visible.value = { 1: idx >= 1, 2: idx >= 2, 3: idx >= 3 } as any;
  }

  onMounted(() => {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let w = 0,
      h = 0;

    const pts: { x: number; y: number; vx: number; vy: number; r: number; a: number }[] = [];
    const COUNT = 50;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < COUNT; i++) {
      pts.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.3,
        a: Math.random() * 0.25 + 0.05,
      });
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(150,140,255,${p.a})`;
        ctx.fill();
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x,
            dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(150,140,255,${0.04 * (1 - d / 120)})`;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    }
    draw();

    // Scroll listener
    onScroll();
  });

  onBeforeUnmount(() => {
    cancelAnimationFrame(animId);
  });
</script>

<style scoped>
  .landing {
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', sans-serif;
    color: #e0e0e0;
    background: #08080e;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 9999;
  }
  .landing,
  .landing * {
    box-sizing: border-box;
  }
  .bg-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  /* Slides */
  .slides {
    height: 100vh;
    overflow-y: auto;
    scroll-behavior: smooth;
    position: relative;
    z-index: 1;
  }
  .slides::-webkit-scrollbar {
    display: none;
  }
  .slide {
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 40px 60px;
    position: relative;
    overflow: hidden;
  }
  .slide::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: linear-gradient(to bottom, #08080e, transparent);
    z-index: 3;
    pointer-events: none;
  }
  .slide:first-child::before {
    display: none;
  }
  .slide-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  /* Orbs */
  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(120px);
    animation: orbFloat 12s ease-in-out infinite alternate;
  }
  @keyframes orbFloat {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.12;
    }
    50% {
      transform: translate(30px, -30px) scale(1.1);
      opacity: 0.18;
    }
    100% {
      transform: translate(-20px, 20px) scale(0.95);
      opacity: 0.1;
    }
  }
  .o1 {
    width: 500px;
    height: 500px;
    top: -200px;
    right: -120px;
    background: #615ced;
  }
  .o2 {
    width: 350px;
    height: 350px;
    bottom: -80px;
    left: -80px;
    background: #00a884;
    animation-delay: -3s;
  }
  .o3 {
    width: 200px;
    height: 200px;
    top: 40%;
    left: 30%;
    background: #8a85ff;
    animation-delay: -6s;
  }
  .grid-overlay {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
    background-size: 60px 60px;
  }
  .o4 {
    width: 400px;
    height: 400px;
    top: 10%;
    left: -120px;
    background: #615ced;
  }
  .o5 {
    width: 250px;
    height: 250px;
    bottom: 10%;
    right: -60px;
    background: #8a85ff;
    animation-delay: -4s;
  }
  .o6 {
    width: 350px;
    height: 350px;
    bottom: 5%;
    right: -80px;
    background: #3ddcbd;
    animation-delay: -2s;
  }
  .o7 {
    width: 300px;
    height: 300px;
    top: 5%;
    right: -80px;
    background: #00a884;
    animation-delay: -5s;
  }
  .o8 {
    width: 400px;
    height: 400px;
    bottom: -100px;
    left: -100px;
    background: #615ced;
    animation-delay: -1s;
  }
  .o9 {
    width: 500px;
    height: 500px;
    top: -150px;
    right: -100px;
    background: #615ced;
  }
  .o10 {
    width: 400px;
    height: 400px;
    bottom: -100px;
    left: -120px;
    background: #00a884;
    animation-delay: -3s;
  }

  .slide-inner {
    position: relative;
    z-index: 2;
    max-width: max(1000px, min(52vw, 1330px));
    width: 100%;
  }
  .center {
    text-align: center;
  }
  .section-badge {
    display: inline-block;
    padding: 5px 18px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 3px;
    color: #8a85ff;
    background: rgba(99, 92, 237, 0.1);
    border: 1px solid rgba(99, 92, 237, 0.2);
    margin-bottom: 16px;
  }
  h2 {
    font-size: clamp(26px, 3vw, 40px);
    font-weight: 700;
    margin-bottom: 6px;
  }
  .section-sub {
    font-size: 15px;
    color: #777;
    margin-bottom: 32px;
  }

  /* ============ Cover ============ */
  .cover-layout {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 48px;
    width: 100%;
    max-width: max(1200px, min(62.5vw, 1600px));
    margin: 0 auto;
  }
  .cover-text {
    flex: 1;
    min-width: 0;
    text-align: left;
  }
  .cover-text .hero-actions {
    justify-content: flex-start;
  }
  .cover-mockup {
    flex: 0 0 auto;
    width: 58%;
    max-width: max(680px, min(35vw, 900px));
    position: relative;
  }
  .mockup-wrapper {
    position: relative;
    width: 100%;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    overflow: hidden;
    box-shadow:
      0 24px 64px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  }
  .mockup-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: #12121e;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .win-dots {
    display: flex;
    gap: 7px;
    flex-shrink: 0;
  }
  .win-dots .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: block;
  }
  .dot.d-red {
    background: #ff5f57;
  }
  .dot.d-yellow {
    background: #ffbd2e;
  }
  .dot.d-green {
    background: #28c840;
  }
  .win-url {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 6px;
    color: #666;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
  }
  .win-url svg {
    flex-shrink: 0;
    color: #555;
  }
  .mockup-carousel {
    overflow: hidden;
    width: 100%;
  }
  .mockup-slides {
    display: flex;
    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .mockup-screen {
    flex: 0 0 100%;
    overflow: hidden;
    background: #0a0a14;
    position: relative;
  }
  .mockup-screen img {
    width: 100%;
    display: block;
  }
  .screen-glare {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 40%, transparent 70%, rgba(255,255,255,0.02) 100%);
    pointer-events: none;
    z-index: 2;
  }
  .mockup-notch {
    height: 18px;
    background: #1a1a2e;
    border-radius: 0 0 8px 8px;
    position: relative;
  }
  .mockup-notch::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 60px;
    height: 4px;
    background: #333;
    border-radius: 2px;
  }
  .carousel-dots {
    position: absolute;
    bottom: 5.5%;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 6px;
    z-index: 10;
  }
  .carousel-dot {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.15);
    cursor: pointer;
    transition: all 0.3s ease;
    backdrop-filter: blur(4px);
  }
  .carousel-dot:hover {
    background: rgba(0, 0, 0, 0.5);
    border-color: rgba(255, 255, 255, 0.3);
  }
  .carousel-dot.active {
    background: rgba(99, 92, 237, 0.7);
    border-color: #615ced;
    box-shadow: 0 0 12px rgba(99, 92, 237, 0.4);
  }
  .dot-indicator {
    display: block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.4);
    transition: all 0.3s ease;
    flex-shrink: 0;
  }
  .carousel-dot.active .dot-indicator {
    background: #fff;
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.5);
  }
  .dot-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
    transition: color 0.3s ease;
    line-height: 1;
  }
  .carousel-dot.active .dot-label {
    color: #fff;
  }
  @media (max-width: 1024px) {
    .cover-layout {
      flex-direction: column;
      gap: 32px;
    }
    .cover-text {
      text-align: center;
    }
    .cover-text .hero-actions {
      justify-content: center;
    }
    .cover-mockup {
      width: 80%;
      max-width: 480px;
    }
  }
  @media (max-width: 768px) {
    .cover-mockup {
      width: 100%;
    }
  }
  .float-elements {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .float-el {
    position: absolute;
    font-size: 32px;
    animation: floatAround 8s ease-in-out infinite;
    opacity: 0.15;
  }
  .float-el.el-1 {
    top: 15%;
    left: 10%;
    animation-delay: 0s;
  }
  .float-el.el-2 {
    top: 20%;
    left: 25%;
    animation-delay: -2s;
  }
  .float-el.el-3 {
    bottom: auto;
    top: 55%;
    left: 8%;
    animation-delay: -4s;
  }
  .float-el.el-4 {
    bottom: auto;
    top: 35%;
    left: 35%;
    animation-delay: -6s;
  }
  @keyframes floatAround {
    0%,
    100% {
      transform: translateY(0) rotate(0deg);
    }
    50% {
      transform: translateY(-20px) rotate(5deg);
    }
  }

  .logo-badge {
    display: inline-block;
    padding: 6px 22px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 3px;
    color: #615ced;
    background: rgba(99, 92, 237, 0.08);
    border: 1px solid rgba(99, 92, 237, 0.15);
    margin-bottom: 32px;
  }
  .hero-title {
    margin-bottom: 32px;
  }
  .hero-brand {
    display: block;
    font-size: clamp(56px, 8vw, 110px);
    font-weight: 900;
    letter-spacing: 16px;
    background: linear-gradient(135deg, #615ced 0%, #00a884 30%, #ff8a00 60%, #ec4899 100%);
    background-size: 300% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: shimmer 5s ease-in-out infinite;
    line-height: 1.2;
    padding: 16px 0;
  }
  .hero-tagline {
    display: block;
    font-size: clamp(18px, 1.6vw, 24px);
    font-weight: 400;
    color: #888;
    letter-spacing: 8px;
    margin-bottom: 16px;
  }
  @keyframes shimmer {
    0% {
      background-position: 0% center;
    }
    50% {
      background-position: 100% center;
    }
  }

  .hero-actions {
    display: flex;
    gap: 14px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 14px 32px;
    border-radius: 999px;
    background: linear-gradient(135deg, #615ced, #7c78ff);
    color: #fff;
    font-size: 16px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: all 0.3s ease;
  }
  .btn-primary:hover {
    transform: translateY(-3px) scale(1.02);
    box-shadow: 0 16px 40px rgba(99, 92, 237, 0.4);
  }
  .btn-primary:active {
    transform: scale(0.97);
  }
  .btn-arrow {
    transition: transform 0.3s ease;
  }
  .btn-primary:hover .btn-arrow {
    transform: translateX(4px);
  }
  .btn-large {
    padding: 16px 44px;
    font-size: 18px;
    gap: 10px;
  }

  .btn-ghost {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 14px 32px;
    border-radius: 999px;
    background: transparent;
    color: #bbb;
    font-size: 16px;
    font-weight: 500;
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
    transition: all 0.3s ease;
  }
  .btn-ghost:hover {
    border-color: rgba(99, 92, 237, 0.4);
    color: #fff;
    transform: translateY(-2px);
  }

  /* ============ Core Cards ============ */
  .core-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    max-width: max(900px, min(47vw, 1200px));
    margin: 0 auto;
  }
  .core-card {
    position: relative;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 24px;
    padding: 40px 24px 28px;
    text-align: center;
    overflow: hidden;
    transition: all 0.6s cubic-bezier(0.22, 1, 0.36, 1);
    opacity: 0;
    transform: translateY(40px) perspective(600px) rotateX(5deg);
    cursor: default;
  }
  .core-card.visible {
    opacity: 1;
    transform: translateY(0) perspective(600px) rotateX(0);
  }
  .core-glow {
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    border-radius: 50%;
    opacity: 0;
    transition: opacity 0.5s ease;
    pointer-events: none;
  }
  .core-card:hover .core-glow {
    opacity: 0.08;
  }
  .core-glow.purple {
    background: radial-gradient(circle, #615ced, transparent 70%);
  }
  .core-glow.green {
    background: radial-gradient(circle, #00a884, transparent 70%);
  }
  .core-glow.orange {
    background: radial-gradient(circle, #ff8a00, transparent 70%);
  }
  .core-icon-wrap {
    width: 60px;
    height: 60px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    font-size: 28px;
    transition: transform 0.3s ease;
  }
  .core-card:hover .core-icon-wrap {
    transform: scale(1.1) rotate(-5deg);
  }
  .core-icon-wrap.purple {
    background: rgba(99, 92, 237, 0.12);
  }
  .core-icon-wrap.green {
    background: rgba(0, 168, 132, 0.12);
  }
  .core-icon-wrap.orange {
    background: rgba(255, 138, 0, 0.12);
  }
  .core-card h3 {
    font-size: 20px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 8px;
  }
  .core-card p {
    font-size: 14px;
    color: #888;
    line-height: 1.6;
    margin: 0 0 14px;
  }
  .core-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
  }
  .tag {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    background: rgba(255, 255, 255, 0.04);
    color: #777;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  /* ============ Features ============ */
  .features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    max-width: max(900px, min(47vw, 1200px));
    margin: 0 auto;
  }
  .feat-card {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 20px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.015);
    border: 1px solid rgba(255, 255, 255, 0.04);
    text-align: left;
    transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    opacity: 0;
    transform: translateY(20px);
  }
  .feat-card.visible {
    opacity: 1;
    transform: translateY(0);
  }
  .feat-card:hover {
    border-color: rgba(99, 92, 237, 0.2);
    background: rgba(255, 255, 255, 0.03);
    transform: translateY(-3px);
  }
  .feat-icon {
    font-size: 28px;
    flex-shrink: 0;
    line-height: 1;
    margin-top: 2px;
  }
  .feat-info {
    flex: 1;
    min-width: 0;
  }
  .feat-title {
    font-size: 15px;
    font-weight: 600;
    color: #eee;
    margin-bottom: 4px;
  }
  .feat-desc {
    font-size: 13px;
    color: #888;
    line-height: 1.5;
  }

  /* ============ Reasons ============ */
  .reasons-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 24px;
  }
  .reason-card {
    display: flex;
    gap: 18px;
    align-items: flex-start;
    padding: 20px 24px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.015);
    border: 1px solid rgba(255, 255, 255, 0.04);
    text-align: left;
    transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    opacity: 0;
    transform: translateX(-20px);
  }
  .reason-card.visible {
    opacity: 1;
    transform: translateX(0);
  }
  .reason-card:hover {
    border-color: rgba(99, 92, 237, 0.15);
    background: rgba(255, 255, 255, 0.03);
  }
  .reason-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    flex-shrink: 0;
  }
  .reason-title {
    font-weight: 600;
    color: #eee;
    margin-bottom: 3px;
    font-size: 16px;
  }
  .reason-desc {
    font-size: 14px;
    color: #888;
    line-height: 1.5;
  }

  /* ============ CTA ============ */
  .cta-glass {
    position: relative;
    max-width: max(480px, min(25vw, 600px));
    margin: 0 auto;
    padding: 32px 36px;
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(20px);
    overflow: hidden;
  }
  .cta-particle {
    position: absolute;
    border-radius: 50%;
    animation: particleFloat 6s ease-in-out infinite;
  }
  .p1 {
    width: 80px;
    height: 80px;
    top: -20px;
    right: -10px;
    background: radial-gradient(circle, #615ced, transparent);
    opacity: 0.2;
    animation-delay: 0s;
  }
  .p2 {
    width: 60px;
    height: 60px;
    bottom: -10px;
    left: -5px;
    background: radial-gradient(circle, #00a884, transparent);
    opacity: 0.15;
    animation-delay: -2s;
  }
  .p3 {
    width: 40px;
    height: 40px;
    top: 40%;
    left: 50%;
    background: radial-gradient(circle, #8a85ff, transparent);
    opacity: 0.1;
    animation-delay: -4s;
  }
  @keyframes particleFloat {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
    }
    50% {
      transform: translate(15px, -15px) scale(1.2);
    }
  }
  .cta-emoji {
    font-size: 48px;
    margin-bottom: 12px;
    position: relative;
    z-index: 1;
  }
  .cta-title {
    margin-bottom: 6px;
    position: relative;
    z-index: 1;
  }
  .cta-desc {
    font-size: 16px;
    color: #888;
    margin-bottom: 24px;
    position: relative;
    z-index: 1;
  }
  .cta-foot {
    margin-top: 20px;
    font-size: 13px;
    color: #444;
    letter-spacing: 2px;
  }
  .landing-footer {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 12px;
    color: #555;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .landing-footer a {
    color: #666;
    text-decoration: none;
    transition: color 0.3s ease;
  }
  .landing-footer a:hover {
    color: #615ced;
  }
  .footer-sep {
    color: #333;
  }

  /* ============ Nav ============ */
  .nav-dots {
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 14px;
    z-index: 100;
  }
  .nav-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #333;
    border: none;
    cursor: pointer;
    transition: all 0.4s ease;
    padding: 0;
    position: relative;
  }
  .nav-dot:hover {
    background: #555;
  }
  .nav-dot.active {
    background: #615ced;
    width: 12px;
    height: 12px;
    box-shadow: 0 0 16px rgba(99, 92, 237, 0.4);
  }
  .dot-tooltip {
    position: absolute;
    right: 18px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 11px;
    color: #666;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }
  .nav-dot:hover .dot-tooltip {
    opacity: 1;
  }
  .slide-counter {
    position: fixed;
    bottom: 28px;
    right: 28px;
    font-size: 12px;
    color: #333;
    z-index: 100;
    letter-spacing: 2px;
    text-transform: uppercase;
    transition: all 0.3s ease;
  }
  .slide-counter.pulse {
    color: #615ced;
  }

  @media (max-width: 768px) {
    .slide {
      padding: 30px 20px;
    }
    .core-grid {
      grid-template-columns: 1fr;
    }
    .features-grid {
      grid-template-columns: 1fr;
    }
    .nav-dots {
      right: 10px;
    }
    .float-el {
      display: none;
    }
    .dot-tooltip {
      display: none;
    }
  }
  @media (max-width: 1024px) and (min-width: 769px) {
    .core-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .features-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* ============ Contact Modal ============ */
  .contact-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .contact-dialog {
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 14px;
    padding: 32px;
    width: min(420px, calc(100vw - 40px));
    position: relative;
  }
  .contact-dialog__close {
    position: absolute;
    top: 12px;
    right: 16px;
    background: none;
    border: none;
    color: #666;
    font-size: 22px;
    cursor: pointer;
    line-height: 1;
    transition: color .2s;
  }
  .contact-dialog__close:hover {
    color: #eee;
  }
  .contact-dialog__header {
    font-size: 18px;
    font-weight: 600;
    color: #eee;
    margin-bottom: 6px;
  }
  .contact-dialog__email {
    font-size: 13px;
    color: #888;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .contact-dialog__field label {
    display: block;
    font-size: 13px;
    color: #aaa;
    margin-bottom: 8px;
  }
  .contact-dialog__input {
    width: 100%;
    box-sizing: border-box;
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px;
    padding: 10px 12px;
    color: #ddd;
    font-size: 13px;
    resize: none;
    outline: none;
    transition: border-color .2s;
    font-family: inherit;
  }
  .contact-dialog__input:focus {
    border-color: #615ced;
  }
  .contact-dialog__input::placeholder {
    color: #555;
  }
  .contact-dialog__submit {
    margin-top: 16px;
    width: 100%;
    padding: 10px 0;
    background: #615ced;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity .2s;
  }
  .contact-dialog__submit:disabled {
    opacity: .35;
    cursor: not-allowed;
  }
  .contact-dialog__submit:not(:disabled):hover {
    opacity: .85;
  }
</style>
