import { createApp } from 'vue';
import App from '@/App.vue';
import router from '@/router';
import '@/assets/css/index.less';
import { Icon } from '@iconify/vue';
import globalDirect from '@/config/globalDirect';
import { createPinia } from 'pinia';
import TableMenuPlugin from '@/config/wangEditor/table-menu-plugin.ts';
import i18n from '@/i18n';
// 创建vue实例
const app = createApp(App);
const pinia = createPinia();
TableMenuPlugin(); // 全局注册一次

app.use(pinia);
app.use(router);
app.use(i18n);
app.component('Icon', Icon);
app.config.globalProperties.$t = i18n.global.t;
globalDirect(app);
// 挂载实例
app.mount('#app');
