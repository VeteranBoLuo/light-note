import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import globalDirect from '@/config/globalDirect';
import { densityCssVariables, resolveUiDensity } from '@/config/uiDensity';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import NoteReferenceHarness from './NoteReferenceHarness.vue';

// 真实组件 + 假接口：工作区外壳、页面树、右侧页签与参考栏，不访问业务 API。
// 参数：theme=day|night、density=small|large、ref=note:<id>|file:<id>、tab=ai|reference、locale=en-US
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') || 'day';
for (const [key, value] of Object.entries(densityCssVariables(resolveUiDensity(params.get('density')))))
  document.documentElement.style.setProperty(key, value);

const notes: Record<string, { title: string; content: string }> = {
  n1: {
    title: '访谈发现与相反证据',
    content: '<h2>01 · 三位受访者的共同点</h2><p>A、B、C 都提到「收藏之后很少回看」。</p>',
  },
  n2: {
    title: '访谈提纲与记录方法',
    content: `<h2>访谈提纲与记录方法</h2><p>每场 40 分钟，先问行为再问态度；记录时把原话和自己的解读分开写。</p>
      <h3>提纲</h3>
      <table><tbody><tr><th>#</th><th>问题</th><th>追问</th></tr>
      <tr><td>1</td><td>平时怎么收藏资料？</td><td>用什么工具</td></tr>
      <tr><td>2</td><td>收藏后多久整理一次？</td><td>整理会做什么</td></tr>
      <tr><td>3</td><td>最近一次回看是什么时候？</td><td>为什么回看</td></tr>
      <tr><td>4</td><td>找不到资料时怎么办？</td><td>放弃还是重找</td></tr>
      <tr><td>5</td><td>请描述最近一次回看的具体场景</td><td>日期、起因</td></tr></tbody></table>
      <h3>记录规则</h3><p>原话用引号；推测前加「我认为」；相反证据单独列出，不合并进结论。</p>
      <p>相关：<a href="/noteLibrary/n3">会议纪要示例</a> · <a href="/cloudSpace?fileId=f1">访谈摘要.md</a></p>`,
  },
  n3: { title: '会议纪要示例', content: '<h2>会议纪要</h2><p>本周确认参考栏原型，下周进入开发。</p>' },
  n4: { title: '小团队知识协作比较表', content: '<p>比较表内容。</p>' },
};
const markdown = `# 访谈摘要与证据边界

轻笺示例资料 · 演示内容

## 这份材料如何使用

教学演示。对象 A、B、C 均为虚构，不对应真实个人。先阅读模拟原话，再比较研究者解释。

## 模拟记录 A

“我记得存过一篇文章，但忘了当时准备用它解决什么。”
`;
const files: Record<string, { fileName: string; fileType: string; category: string; fileUrl: string }> = {
  f1: {
    fileName: '访谈摘要.md',
    fileType: 'text/markdown',
    category: 'text',
    fileUrl: `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`,
  },
};

function respond(config: any, data: unknown, status = 200) {
  return { status: 200, statusText: 'OK', headers: {}, config, data: { status, msg: status === 200 ? '' : 'fail', data } };
}

request.defaults.adapter = async (config) => {
  const path = new URL(config.url || '', 'http://fixture.invalid').pathname;
  const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : config.data || {};
  if (path.endsWith('/note/getNoteDetail')) {
    const note = notes[String(body.id)];
    if (!note) return respond(config, null, 404);
    return respond(config, { id: body.id, title: note.title, content: note.content, type: 'html', createBy: 'u1', breadcrumb: [] });
  }
  if (path.endsWith('/file/getFileInfo')) {
    const file = files[String(body.id)];
    return file ? respond(config, { id: body.id, ...file }) : respond(config, null, 404);
  }
  if (path.endsWith('/search/global')) {
    const keyword = String(body.keyword || '').trim();
    const types: string[] = body.types?.length ? body.types : body.type && body.type !== 'all' ? [body.type] : ['note', 'file'];
    const items = [
      ...Object.entries(notes).map(([id, note]) => ({ id, type: 'note', title: note.title, description: '' })),
      ...Object.entries(files).map(([id, file]) => ({ id, type: 'file', title: file.fileName, description: '访谈材料' })),
    ].filter((item) => types.includes(item.type) && (!keyword || item.title.includes(keyword)));
    const groups = ['note', 'file']
      .map((type) => ({ type, label: type, items: items.filter((item) => item.type === type) }))
      .filter((group) => group.items.length);
    return respond(config, { keyword, items, groups, total: items.length, hasMore: false });
  }
  console.info('[note-reference harness] unhandled', path);
  return respond(config, []);
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
await router.push('/noteLibrary/n1');

const app = createApp(NoteReferenceHarness);
app.use(createPinia());
app.use(router);
app.use(
  createI18n({
    legacy: false,
    locale: params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN',
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, 'en-US': enUS },
  }),
);
globalDirect(app);
app.mount('#app');
