import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory } from 'vue-router';
import { bookmarkStore, useUserStore } from '@/store';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
import globalDirect from '@/config/globalDirect';
import { applyUiDensity } from '@/composables/useUiDensity';
import { resolveViewportDeviceType } from '@/config/responsive';
import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
const params = new URLSearchParams(location.search);
const mobile = resolveViewportDeviceType(innerWidth) !== 'desktop';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
(window as any).setDensity = (preference: string) => applyUiDensity(preference, mobile);
(window as any).setDensity(params.get('density'));
const state=params.get('state')||'plain';
const listRef=ref<InstanceType<typeof BVirtualList>|null>(null);
const rows=Array.from({length:state==='placeholder'?3:100},(_,i)=>({id:String(i),name:`记录 Row ${i}`}));
(window as any).scrollToRow=(index:number)=>listRef.value?.scrollToIndex(index,'start');
const app=createApp({render:()=>h('main',{style:'height:600px;max-width:900px;margin:auto;overflow:auto'},[
 h(BVirtualList,{ref:listRef,items:rows,totalCount:state==='placeholder'?100:0,itemHeight:60,gap:8,loading:state!=='ready',loadingText:'正在加载 Loading',scrollMode:state==='ancestor'?'ancestor':'self',style:state==='ancestor'?'':'height:100%'},
 {default:({item}:any)=>h('div',{style:'height:100%;box-sizing:border-box;padding:var(--ui-space-8,8px);background:var(--card-background);font-size:var(--ui-font-14,14px)'},item.name)})
])}),pinia=createPinia();
app.use(pinia);
bookmarkStore(pinia).$patch({ screenWidth: innerWidth });
useUserStore(pinia).$patch({ id: '', role: 'visitor', preferences: {noteViewMode:'card'} as any });
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => h('p', '后台页面内容') } }],
});
app.use(router);
await router.push('/noteLibrary');
await router.isReady();
(window as any).setRoute = (path: string) => router.push(path);
app.use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
app.mount('#app');

const style = document.createElement('style');
style.textContent =
  'html,body,#app{margin:0;height:100%;width:100%;} #app{box-sizing:border-box;padding:16px;margin:auto;}';
document.head.append(style);
