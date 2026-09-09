import { buildRichTextDemoContent } from '../../util/services/richTextDemoContent.js';
export const version = 'visitor-resources-v2';
export const images = [
  { key: 'welcome', path: './assets/v2/welcome-bookmark.png' },
  { key: 'weekend', path: './assets/v2/weekend-walk.png' },
  { key: 'inspiration', path: './assets/v2/visual-inspiration.png' },
];
export const noteThemes = {
  欢迎使用轻笺笔记: ['使用指南'],
  富文本样式示例: ['创作排版'],
  手绘笔记示例: ['视觉灵感'],
  'Markdown 语法速查表': ['学习提升', '创作排版'],
  思维导图示例: ['学习提升'],
  日报示例: ['项目研究'],
  周报示例: ['写作表达'],
  会议纪要示例: ['项目研究'],
  访谈提纲与记录方法: ['项目研究'],
  访谈发现与相反证据: ['项目研究'],
  小团队知识协作比较表: ['项目研究'],
  'Markdown 实践作业': ['学习提升'],
  阅读理解与反例笔记: ['学习提升'],
  复习记录与错误分析: ['学习提升'],
  周报改写前后对照: [],
  教程大纲与读者反馈: ['写作表达'],
  '周末散步：把生活留在一页里': ['生活记录'],
  一张灵感板的配色观察: [],
};
export const pendingNotes = ['周报改写前后对照', '教程大纲与读者反馈', '周末散步：把生活留在一页里'];
export const pinnedNotes = ['手绘笔记示例', '富文本样式示例', '欢迎使用轻笺笔记'];
export const folders = [
  ['research', '研究资料', null],
  ['interviews', '访谈材料', 'research'],
  ['learning', '学习资料', null],
  ['writing', '写作与模板', null],
  ['images', '图片素材', null],
];
export const filePlacement = {
  '访谈摘要.pdf': ['interviews', '项目研究'],
  '访谈编码.csv': ['interviews', '项目研究'],
  '访谈记录扫描示例.png': ['interviews', '项目研究'],
  '阅读与复习计划表.xlsx': ['learning', '学习提升'],
  '研究报告模板.docx': ['writing', '写作表达'],
  '研究结论演示稿.pptx': ['writing', '写作表达'],
  '每周知识回顾指南.md': ['writing', '学习提升'],
  'eg_bookmark.png': ['images', '使用指南'],
};
export const lists = ['学习提升', '项目推进', '生活安排'];
export const todos = [
  ['reading', '整理读书笔记', 2, 0, 0, '学习提升', '阅读理解与反例笔记'],
  ['summary', '完成项目摘要', 2, -1, 1, '项目研究', '周报示例'],
  ['study', '制定本周学习计划', 2, 3, 0, '学习提升', 'Markdown 实践作业'],
  ['research', '准备下一轮研究提纲', 2, 7, 1, '项目研究', '访谈提纲与记录方法'],
  ['attachments', '整理会议附件', 1, 0, 1, '项目研究', '会议纪要示例'],
  ['verify', '核对资料出处', 0, 0, 1, '写作表达', '教程大纲与读者反馈'],
  ['inspiration', '收集周末灵感', 1, 5, 2, '视觉灵感', '一张灵感板的配色观察'],
  ['walk', '安排一次公园散步', 0, null, 2, '生活记录', '周末散步：把生活留在一页里'],
  ['unsorted', '记下一个还没归类的想法', 0, null, null, '视觉灵感', null],
  ['done-reading', '完成一轮闭卷复述', 1, -1, 0, '学习提升', '复习记录与错误分析', 'completed'],
  ['done-material', '整理示例材料入口', 1, -2, 1, '项目研究', null, 'completed'],
].map(([key, title, priority, offset, list, tag, note, status = 'pending']) => ({
  key,
  title,
  priority,
  offset,
  list,
  tag,
  note,
  status,
}));
const esc = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const img = (url, alt) => `<p><img src="${esc(url)}" alt="${esc(alt)}" width="960"></p>`;
export function buildNoteBodies(urls) {
  const media = `<section class="ln-media-text" data-ln-media-position="left" data-ln-media-width="42"><div class="ln-media-text__item"><figure class="ln-media-text__media"><img src="${esc(urls.inspiration)}" alt="紫绿纸片与玻璃组成的原创灵感板"></figure><div class="ln-media-text__content"><h2>让图片与文字一起说话</h2><p>紫色留给想象，绿色带来安静，珊瑚色为重点留一个位置。图文组合可以同时保留视觉线索和自己的解释。</p></div></div></section>`;
  return {
    欢迎使用轻笺笔记: `<h1>你的想法，可以有很多种样子</h1><p>打开图文、手绘或富文本，从一份资料走进一个项目。</p>${img(urls.welcome, '轻笺书签工作区示例')}<h2>从这里开始</h2><ul><li>笔记：记录文字、图片与草图。</li><li>云空间：按目录保存资料，用标签连接主题。</li><li>待办与工坊：将想法变成下一步行动。</li></ul><blockquote>共享只读教学示例。注册后可以创建自己的内容。</blockquote>`,
    富文本样式示例:
      buildRichTextDemoContent({
        referencesHtml: '<ul><li>导览：{{ref:note:welcome}}</li><li>草图：{{ref:note:drawing}}</li></ul>',
      }).replace('<hr>', img(urls.inspiration, '原创配色灵感板') + '<hr>') +
      media +
      '<p>教学演示 · 插画由 AI 生成。</p>',
    '周末散步：把生活留在一页里': `<h1>慢一点，看看身边的颜色</h1>${img(urls.weekend, '湖边散步、树影和一杯茶的原创插画')}<p>教学演示 · AI 插画，不对应真实出行记录。</p><h2>这一路想留下什么</h2><p>树影落在石板上，远处的水面变成浅紫色。不急着写完整游记，先记住三个小细节：风、光线、停下来的地方。</p><ul><li>带一本小笔记和水。</li><li>找一处能坐下观察的地方。</li><li>回家后挑一张图，补一句自己的感受。</li></ul><blockquote>这篇还在待整理中：可以补充路线与主题标签。</blockquote>`,
    一张灵感板的配色观察: `<h1>从一张图里借一点灵感</h1>${img(urls.inspiration, '纸片、植物和玻璃构成的原创灵感板')}<p>教学演示 · AI 插画。先收集视觉线索，再决定它属于哪个主题。</p><h2>我看见了什么</h2><table><tr><th>线索</th><th>尝试</th></tr><tr><td>深绿与浅紫</td><td>用在标题与留白之间</td></tr><tr><td>珊瑚色</td><td>只强调一处重点</td></tr><tr><td>纸张纹理</td><td>保留温柔、不完全整齐的边缘</td></tr></table><p>下一次把这些颜色放进一页手帐，看看它们是否仍然协调。</p>`,
  };
}
