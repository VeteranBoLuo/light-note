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
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BSelect from '@/components/base/BasicComponents/BSelect.vue';
import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
import icon from '@/config/icon';
const params = new URLSearchParams(location.search);
const mobile = resolveViewportDeviceType(innerWidth) !== 'desktop';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
(window as any).setDensity = (preference: string) => applyUiDensity(preference, mobile);
(window as any).setDensity(params.get('density'));
const state=params.get('state')||'single';
const multiple=['multiple','tag'].includes(state);
const selection=ref<any>(multiple?['0','1','2']:'0'),text=ref('输入内容 Input text');
const options=Array.from({length:30},(_,i)=>({value:String(i),label:i===0?'长标签 Long label for testing truncation':`选项 Option ${i}`}));
(window as any).values=()=>({selection:selection.value,text:text.value});
(window as any).resetValue=()=>{selection.value=multiple?['0','1','2']:'0';text.value='输入内容 Input text';};
const glyph=()=>h(SvgIcon,{src:icon.navigation.search,size:16});
const app=createApp({render:()=>h('main',{style:'width:300px;max-width:100%;margin-left:auto;display:grid;gap:16px'},[
 h(BInput,{value:text.value,'onUpdate:value':(v:string)=>text.value=v,clearable:true,disabled:state==='disabled'},{prefix:glyph}),
 h(BInput,{type:'textarea',value:'多行输入 Text area',readonly:true},{prefix:glyph,suffix:glyph}),
 h(BSelect,{style:'width:100%',value:selection.value,'onUpdate:value':(v:any)=>selection.value=v,options:state==='empty'?[]:options,mode:multiple?'multiple':'single',chipTone:state==='tag'?'tag':'default',maxTagCount:2,showSearch:true,allowClear:true,loading:state==='loading',disabled:state==='disabled'})
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
