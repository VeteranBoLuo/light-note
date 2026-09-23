import { createApp, h, ref, nextTick } from 'vue';
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
import BCard from '@/components/base/BasicComponents/BCard.vue';
import BSelect from '@/components/base/BasicComponents/BSelect.vue';
import CommonDataTable from '@/components/workbenches/CommonDataTable.vue';
const params = new URLSearchParams(location.search);
const mobile = resolveViewportDeviceType(innerWidth) !== 'desktop';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
(window as any).setDensity = (preference: string) => applyUiDensity(preference, mobile);
(window as any).setDensity('medium');
const view=ref('tables'),generation=ref(0),selected=ref('0');
const rows=Array.from({length:100},(_,i)=>({id:i,name:`示例记录 ${i} · Sample record`,count:1000-i,description:'用于比较相同内容下的样式计算与布局开销。'}));
const columns=[{key:'name',title:'名称'},{key:'count',title:'数量'},{key:'description',title:'说明'}];
(window as any).benchNavigate=async(next:string)=>{
 const start=performance.now();view.value=next;generation.value++;await nextTick();
 void document.body.offsetHeight;
 return performance.now()-start;
};
(window as any).benchMenu=async()=>{
 const start=performance.now();document.querySelector<HTMLElement>('.select-trigger')!.click();await nextTick();
 void document.querySelector<HTMLElement>('.select-dropdown')!.offsetHeight;
 return performance.now()-start;
};
const app=createApp({render:()=>h('main',[
 h(BSelect,{style:'width:240px;margin-bottom:16px',value:selected.value,'onUpdate:value':(v:string)=>selected.value=v,options:rows.map(r=>({value:String(r.id),label:r.name}))}),
 h('section',{key:generation.value,class:'bench-grid',style:'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px'},
 view.value==='tables'?Array.from({length:4},(_,i)=>h('div',{style:'height:660px'},[h(CommonDataTable,{title:`工作台列表 ${i+1}`,tableData:rows,columns})])):
 Array.from({length:160},(_,i)=>h(BCard,{title:`卡片 ${i+1}`,padding:'16px'},()=>h('p','相同的固定内容，用于对照重复挂载卡片的成本。'))))
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
