import { createApp, h, ref, type Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory } from 'vue-router';
import { bookmarkStore, useUserStore } from '@/store';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
import globalDirect from '@/config/globalDirect';
import { applyUiDensity } from '@/composables/useUiDensity';
import { resolveViewportDeviceType } from '@/config/responsive';
import NoteHeader from '@/components/noteLibrary/detail/NoteHeader.vue';
const params = new URLSearchParams(location.search);
const mobile = resolveViewportDeviceType(innerWidth) !== 'desktop';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
(window as any).setDensity = (preference: string) => applyUiDensity(preference, mobile);
(window as any).setDensity(params.get('density'));
const state=params.get('state')||'plain';
const integration = params.has('integration');
let integratedDetail: Component | undefined;
(window as any).actions=[];
const app=createApp({render:()=>integratedDetail ? h(integratedDetail) : h(NoteHeader,{note:{id:'density-note',title:'密度测试笔记',tags:[]},noteType:'html',updateTime:'2026-09-23 10:00:00',readonly:state==='readonly',isStartEdit:false,saveStatus:state==='error'?'error':'saved',hasBackup:true,hasCatalog:true,childCount:3,onSaveVersion:()=>(window as any).actions.push('save'),onRetrySave:()=>(window as any).actions.push('retry'),onBrowseChildren:()=>(window as any).actions.push('children')})}),pinia=createPinia();
setActivePinia(pinia);
if (integration) integratedDetail = (await import('@/view/noteLibrary/NoteDetail.vue')).default;
app.use(pinia);
bookmarkStore(pinia).$patch({ screenWidth: innerWidth });
useUserStore(pinia).$patch({ id: integration ? 'density-fixture' : '', role: integration ? 'user' : 'visitor', preferences: {noteViewMode:'card'} as any });
const router = integration ? (await import('@/router')).default : createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/noteLibrary/:id', component: { render: () => null } }, { path: '/:pathMatch(.*)*', component: { render: () => h('p', '后台页面内容') } }],
});
app.use(router);
await router.push(integration ? '/noteLibrary/density-note' : '/noteLibrary');
await router.isReady();
(window as any).setRoute = (path: string) => router.push(path);
app.use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
app.mount('#app');

const style = document.createElement('style');
style.textContent =
  'html,body,#app{margin:0;height:100%;width:100%;} #app{box-sizing:border-box;padding:0;margin:auto;}';
document.head.append(style);
