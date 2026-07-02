import { createApp } from 'vue';
import App from '@/App.vue';
import router, { getPendingNavigationTarget, reloadOnceTo } from '@/router';
import '@/assets/css/index.less';
import { Icon } from '@iconify/vue';
import globalDirect from '@/config/globalDirect';
import { createPinia } from 'pinia';
import i18n from '@/i18n';
// 创建vue实例
const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(i18n);
app.component('Icon', Icon);
app.config.globalProperties.$t = i18n.global.t;
globalDirect(app);
// 挂载实例
app.mount('#app');

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
