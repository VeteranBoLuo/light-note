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

// 游客访问量埋点:每个浏览器会话上报一次 page_view(后端按登录态打 visitor_type,漏斗只算 visitor)
try {
  if (!sessionStorage.getItem('ln_pv_sent')) {
    sessionStorage.setItem('ln_pv_sent', '1');
    import('@/http/request').then(({ apiBasePost }) => {
      setTimeout(() => {
        apiBasePost('/api/common/recordConversion', { event: 'page_view', source: location.pathname }).catch(() => {});
      }, 1500);
    });
  }
} catch (e) {
  /* 隐私模式 sessionStorage 不可用时忽略 */
}
