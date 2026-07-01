import { createApp } from 'vue';
import App from '@/App.vue';
import router from '@/router';
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
