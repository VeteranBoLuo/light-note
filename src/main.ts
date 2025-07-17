import { createApp } from 'vue';
import App from '@/App.vue';
import router from '@/router';
import '@/assets/css/index.less';
import { Icon } from '@iconify/vue';
import globalDirect from '@/config/globalDirect';
import { createPinia } from 'pinia';
// 在入口文件中（如 main.ts 或 app.ts）
import TableMenuPlugin from '@/config/wangEditor/table-menu-plugin.ts';
// 创建vue实例
const app = createApp(App);
const pinia = createPinia();
TableMenuPlugin(); // 全局注册一次

app.use(pinia);
app.use(router);
app.component('Icon', Icon);
globalDirect(app);
// 挂载实例
app.mount('#app');
