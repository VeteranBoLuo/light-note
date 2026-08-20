import { createApp } from 'vue';
import App from '@/App.vue';
import router, { getPendingNavigationTarget, reloadOnceTo } from '@/router';
import '@/assets/css/index.less';
import { Icon } from '@iconify/vue';
import globalDirect from '@/config/globalDirect';
import { createPinia } from 'pinia';
import i18n, { prepareInitialLocale } from '@/i18n';
import { initializePwaInstall } from '@/composables/usePwaInstall';
import { isAndroidWebViewRuntime, isLightNoteAndroidApp } from '@/utils/androidBridge';
import { installRenderingProfileSync } from '@/config/renderingProfile';

// Android 系统 WebView 的部分旧版本会把 color-mix() 与多层阴影渲染成实心黑框。
// 原生壳会在 UA 中追加 LightNoteAndroid；`; wv)` 保留给旧调试包与系统 WebView。
const isAndroidApp = isLightNoteAndroidApp();
const isAndroidWebView = isAndroidWebViewRuntime();
// 首屏内联脚本会在 CSS 绘制前先设置同样的类；这里继续负责窗口缩放、横竖屏和
// 粗指针变化后的动态同步。Android 身份类只标记引擎，所有可见规则走共享移动基线。
installRenderingProfileSync({ androidWebView: isAndroidWebView });
// 首屏在 App.vue 读取 Pinia 断点前就可能带着上次桌面端保存的 0.9/1.1 zoom。
// 移动端必须在 Vue 挂载前回到 1，否则首屏骨架和笔记卡会暂时只占 90% 宽度。
if (document.documentElement.classList.contains('light-note-mobile-rendering')) {
  document.documentElement.style.zoom = '';
  document.documentElement.style.setProperty('--ln-aux-zoom', '1');
}

// 创建vue实例
const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(i18n);
app.component('Icon', Icon);
app.config.globalProperties.$t = i18n.global.t;
globalDirect(app);
// 必须在 mount 前监听 beforeinstallprompt，否则浏览器可能在应用组件挂载前触发事件而丢失安装入口。
// 轻笺原生 APK 已经安装完成，不再注册 PWA Service Worker 或安装提示监听。
if (!isAndroidApp) {
  initializePwaInstall();
}
async function mountApplication() {
  // 中文词典已经在主包中；只有英文用户会并行等待英文词典分包，避免先显示翻译 key 再闪变。
  await prepareInitialLocale();
  app.mount('#app');
}

void mountApplication();

// 游客访问量埋点(page_view)已移至 App.vue initApp():需等 window.fingerprint 生成后再上报,
// 否则 fingerprint 为空会导致漏斗按 DISTINCT fingerprint 统计失真。

// 部署会用新构建产物整体替换旧文件(哈希文件名不同),已打开页面若不刷新,
// 懒加载路由时会去请求已被删除的旧 chunk 导致 404。Vite 官方推荐:监听
// preload 失败事件自动刷新页面拉取最新版本,避免用户手动强制刷新。
// 跳转目标用 router.beforeEach 记录的"用户正要去哪"(见 router/index.ts),
// 而不是简单 reload 当前页——否则可能刷新回点击前的旧页面,还得用户再点一次。
window.addEventListener('vite:preloadError', () => {
  reloadOnceTo(getPendingNavigationTarget());
});
