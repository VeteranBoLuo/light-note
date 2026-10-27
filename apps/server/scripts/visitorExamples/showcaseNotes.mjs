import { BUILTIN_NOTE_BODIES } from '@lightnote/shared/note-templates';
import { noteMathHtml } from '@lightnote/shared/note-math';

const esc = (text) =>
  String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const p = (text) => `<p>${text}</p>`;
const list = (items, ordered = false) =>
  `<${ordered ? 'ol' : 'ul'}>${items.map((text) => `<li>${text}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
const table = (headers, rows) =>
  `<table class="note-template-table"><thead><tr>${headers.map((text) => `<th>${text}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((text) => `<td>${text}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const card = (title, body) => `<div class="ln-note-reading-section"><h2>${title}</h2>${body}</div>`;
const grid = (...cards) => cards.join('');
const hero = (eyebrow, title, lead) =>
  `<div class="ln-note-head"><div><p>${eyebrow}</p><h1>${title}</h1><p>${lead}</p></div></div>`;
const page = (body, theme = 'reading') =>
  `<div class="note-template-page ln-note-layout ln-note-layout--${theme}">${body}</div>`;
const tasks = (items) =>
  items
    .map(
      ([done, text]) =>
        `<p><input type="checkbox" class="note-todo-checkbox" data-note-task="true"${done ? ' checked' : ''}> ${text}</p>`,
    )
    .join('');
const picture = (url, alt, size = 'full') =>
  `<p><img src="${esc(url)}" alt="${esc(alt)}" data-ln-size="${size}" width="960"></p>`;
const media = (url, alt, title, body, position = 'left') =>
  `<section class="ln-media-text" data-ln-media-position="${position}" data-ln-media-width="42"><div class="ln-media-text__item"><figure class="ln-media-text__media"><img src="${esc(url)}" alt="${esc(alt)}"></figure><div class="ln-media-text__content"><h2>${title}</h2>${body}</div></div></section>`;
const gradient = (text) =>
  `<span class="ln-text-gradient" data-ln-text-gradient="true" style="--ln-gradient-from:#615ced;--ln-gradient-to:#00a884;--ln-gradient-angle:90deg;">${text}</span>`;
const quote = (text) => `<blockquote>${p(text)}</blockquote>`;
const tick = '`';
const md = (body) => ({ type: 'markdown', body: body.trim() });
const html = (body) => ({
  type: 'html',
  body: body.startsWith('<div class="note-template-page') ? body : `<div class="note-template-page">${body}</div>`,
});

export const SHOWCASE_TITLES = [
  '日报示例',
  '周报示例',
  '会议纪要示例',
  '欢迎使用轻笺笔记',
  '富文本样式示例',
  'Markdown 语法速查表',
  '思维导图示例',
  '访谈提纲与记录方法',
  '访谈发现与相反证据',
  '小团队知识协作比较表',
  'Markdown 实践作业',
  '阅读理解与反例笔记',
  '复习记录与错误分析',
  '周报改写前后对照',
  '教程大纲与读者反馈',
  '周末散步：把生活留在一页里',
  '一张灵感板的配色观察',
];

// Content only: document layouts are shared with built-in templates; legacy seed manifests remain immutable.
// Resource IDs and hosted image locations are resolved from the inspected visitor account.
export function buildShowcaseNotes({ note, mdNote, images }) {
  const sample = (key) =>
    BUILTIN_NOTE_BODIES[key].exampleContent['zh-CN']
      .replaceAll('{{datetime}}', '演示日 14:00')
      .replaceAll('{{date}}', key === 'daily' ? '2026-10-26' : '演示日')
      .replaceAll('{{weekStart}}', '2026-10-26')
      .replaceAll('{{weekEnd}}', '2026-11-01')
      .replaceAll('{{weekday}}', '星期一');
  return {
    日报示例: html(
      sample('daily') +
        p('相关记录：' + note('会议纪要示例') + ' · ' + note('周报示例')) +
        p('虚构教学示例，用于演示日报分块与正文清单。'),
    ),
    周报示例: html(
      sample('weekly') +
        p('相关记录：' + note('日报示例') + ' · ' + note('周报改写前后对照')) +
        p('虚构教学示例，不代表真实工作进度。'),
    ),
    会议纪要示例: html(
      sample('meeting') +
        p('相关记录：' + note('日报示例') + ' · ' + note('访谈提纲与记录方法')) +
        p('虚构教学示例；参与角色与行动安排均用于演示。'),
    ),
    欢迎使用轻笺笔记: html(
      page(
        hero('轻笺笔记', '从一篇与你有关的笔记开始', '工作、学习或生活，都可以找到适合自己的记录方式。') +
          media(
            images.welcome,
            '轻笺书签工作区示例',
            '把想法与资料放在一起',
            p('文字、图片、清单、图表和手绘，可以各自承担不同的表达。正文中的资源引用还能连到已有笔记、书签和文件。'),
          ) +
          grid(
            card(
              '日常工作',
              p(
                note('日报示例', '记录今天') +
                  ' · ' +
                  note('周报示例', '回顾一周') +
                  ' · ' +
                  note('会议纪要示例', '记住决定'),
              ) + p('重点、进展和下一步各有位置，写完以后也容易回看。'),
            ),
            card(
              '阅读与学习',
              p(
                note('阅读理解与反例笔记', '读完想一想') +
                  ' · ' +
                  note('思维导图示例', '理清关系') +
                  ' · ' +
                  note('Markdown 实践作业', '做一次练习'),
              ) + p('摘录、自己的理解和练习记录，按需要慢慢补充。'),
            ),
          ) +
          grid(
            card(
              '生活与灵感',
              p(
                note('周末散步：把生活留在一页里', '周末图文手账') +
                  ' · ' +
                  note('一张灵感板的配色观察', '灵感板') +
                  ' · ' +
                  note('手绘笔记示例', '自由画布'),
              ) + p('用图片、颜色与笔触，留住值得记下的小事。'),
            ),
            card(
              '想了解更多写法',
              p(note('富文本样式示例', '富文本功能样本') + ' · ' + note('Markdown 语法速查表', 'Markdown 速查')) +
                p('需要时再查格式；公式、代码、图文组合与装饰效果集中放在样本页。'),
            ),
          ) +
          '<h2>也可以继续探索</h2>' +
          p(
            note('访谈提纲与记录方法', '访谈工作纸') +
              ' · ' +
              note('访谈发现与相反证据', '证据整理') +
              ' · ' +
              note('小团队知识协作比较表', '比较表'),
          ) +
          '<p class="ln-note-closing">游客空间只读。登录后，在自己的空间新建一篇笔记开始记录。示例内容为虚构教学材料，插画由 AI 生成。</p>',
        'welcome',
      ),
    ),
    富文本样式示例: html(
      `<h1 style="font-size:1.9em;line-height:1.35;">${gradient('一页笔记的多种表达')}</h1>` +
        p('先让内容读得清楚，再为重点增加一点颜色。这篇集中展示轻笺富文本编辑器的常用格式与进阶样式。') +
        '<h2>01 · 让重点有层次</h2>' +
        p(
          '<strong>粗体表达结论</strong>，<em>斜体补充语气</em>，<u>下划线标记需要回看的一句</u>，<s>删除线保留被修正的旧判断</s>。<mark>高亮只圈出一个关键点。</mark>例如 H<sub>2</sub>O 与 x<sup>2</sup>，也能保留上下标。',
        ) +
        quote('“我记得收藏过，却想不起当时准备拿来做什么。”——虚构访谈对象 A') +
        p('引用保留原话；解释另起一段。正文中的 ' + note('访谈发现与相反证据', '证据笔记') + '可以继续追溯上下文。') +
        '<h2>02 · 清单把想法落到行动</h2>' +
        tasks([
          [true, '区分原话、观察与解释'],
          [false, '为下一轮观察写好中性任务说明'],
          [false, '记录一个与预期相反的案例'],
        ]) +
        p('这些是笔记正文里的示例勾选框，与待办模块的任务、提醒相互独立。游客浏览不会改变它们。') +
        '<h2>03 · 表格用来比较，代码保留原样</h2>' +
        table(
          ['记录层级', '例子', '怎么检查'],
          [
            ['原话', '“忘了保存时的用途”', '能回到原记录'],
            ['解释', '可能缺少使用情境', '仍需观察验证'],
            ['行动', '观察一次资料回找', '有明确完成条件'],
          ],
        ) +
        '<pre class="language-javascript"><code>const record = {\n  observation: "停在资料列表",\n  hypothesis: "可能缺少情境线索",\n  nextStep: "观察一次回找过程"\n};\nconsole.log(record.nextStep);</code></pre>' +
        '<h2>04 · 公式写源码，阅读时看排版</h2>' +
        p(`用行内公式 ${noteMathHtml('r = c / n', 'inline')} 记录闭卷完成比例，独立公式写清演示计算：`) +
        noteMathHtml(String.raw`r = \frac{3}{4} = 75\%`, 'block') +
        p('这里仅表示虚构练习中四项任务完成三项，不是学习能力评分，也不预测记忆效果。公式可从编辑器插入数学公式。') +
        '<h2>05 · 让图片与文字形成一组</h2>' +
        media(
          images.inspiration,
          '纸片、植物和玻璃组成的原创灵感板',
          '把视觉线索留在旁边',
          p(
            '图片负责呈现颜色与质感，文字说明自己看到了什么。图文组合可调整图片位置和比例；窄屏会按正文空间重新排列。',
          ) + p('观察更多细节：' + note('一张灵感板的配色观察') + '。'),
        ) +
        '<h2>06 · 给少量重点加上样式</h2>' +
        `<p class="ln-rich-card" style="--ln-gradient-from:#5145ad;--ln-gradient-to:#305d7b;--ln-gradient-angle:135deg;color:#ffffff;padding:20px 24px;"><strong>一张结论卡</strong><br>先写有依据的结论，再写适用边界。渐变只用于这一处重点。</p>` +
        '<p class="ln-rich-gradient-border" style="padding:16px 20px;">渐变边框：适合放一条需要回看的判断，而不是给每段都加一个框。</p>' +
        `<p>${gradient('自定义渐变文字')} · <span class="ln-rich-text-glow" style="font-weight:bold;">柔和发光</span></p>` +
        '<p>动画演示：<span class="ln-rich-effect-breathe" style="--ln-gradient-from:#5145ad;--ln-gradient-to:#305d7b;--ln-gradient-angle:90deg;color:#ffffff;padding:6px 14px;">呼吸强调</span>　<span class="ln-rich-effect-float">🍃</span> 漂浮　<span class="ln-rich-effect-spin">&nbsp;</span> 旋转</p>' +
        p('这些是装饰效果，不表示真实任务正在运行。系统减少动态效果时，内容仍可正常阅读。') +
        '<hr><h2>继续看看其他表达</h2>' +
        p(`${note('Markdown 语法速查表')} · ${note('思维导图示例')} · ${note('手绘笔记示例')}`) +
        p('教学演示 · 插画由 AI 生成。'),
    ),
    'Markdown 语法速查表': md(String.raw`# Markdown：边写边看懂格式

> 这篇保留 Markdown 格式。进入个人笔记后，可以在编辑、预览或桌面分栏中对照源码与结果；游客只读。

## 常用写法速查

| 源码 | 效果 / 用途 |
| --- | --- |
| ${tick}## 标题${tick} | 章节标题 |
| ${tick}**重点**${tick} | **重点** |
| ${tick}> 引用${tick} | 保留原话 |
| ${tick}- [ ] 下一步${tick} | 正文任务清单 |
| ${tick}[来源](网址)${tick} | 链接到出处 |
| ${tick}![说明](图片地址)${tick} | 插入图片 |

## 1. 标题、段落与强调

用二级标题分组，三级标题补充细节。段落之间留一行，目录才有清楚的层级。

**关键结论**、*补充语气*、~~已经修正的旧说法~~，以及行内代码 ${tick}nextStep${tick}，各自有不同用途。

## 2. 列表和任务清单

- 保存资料
  - 记录原始来源
  - 补一句准备怎么用
- 再用自己的话解释

1. 读一段材料。
2. 合上材料，写出要点。
3. 对照原文，修正遗漏。

- [x] 写下自己的例子
- [ ] 找到一个反例
- [ ] 用一个小任务检验理解

任务清单是正文里的勾选状态，不会自动创建待办提醒。

## 3. 引用与比较表

> 引用只放原话。
>
> 解释和判断写在引用之外，并保留来源。

| 需要表达什么 | 选择的格式 | 自检 |
| :--- | :---: | ---: |
| 并列信息 | 列表 | 层级一致 |
| 操作顺序 | 编号 | 可以照做 |
| 同维度比较 | 表格 | 列名明确 |

## 4. 带语言的代码块

~~~javascript
const checklist = [true, true, false];
const completed = checklist.filter(Boolean).length;
console.log(completed); // 2
~~~

上面是真正的代码块；行内代码适合变量名，不用多个空格模拟缩进。

## 5. 行内和独立公式

行内公式写成 $r=c/n$；独立公式单独成段：

$$
r = \frac{3}{4} = 75\%
$$

这里只是演示“完成三项 / 四项练习”的算式，不是通用学习效果指标。

## 6. 链接与下一步

链接语法是 ${tick}[名称](地址)${tick}。站内资料可通过引用资源插入，避免只留下没有上下文的裸地址。

接着打开 ${mdNote('Markdown 实践作业')}，独立写一遍；图表语法见 ${mdNote('思维导图示例')}。

---

**记住：** 先写内容，再选格式；只使用能帮助读者理解的那几种。`),
    思维导图示例: md(String.raw`# 同一个问题，用四种图表达

> 教学演示：资料如何从“收藏过”变成“下次能找到”。这里的流程和时间均为虚构安排，不是产品内部架构。

## 1. 思维导图：拆开一个主题

~~~mermaid
mindmap
  root((让资料再次派上用场))
    保存时
      留下来源
      记录用途
    理解时
      用自己的话解释
      找一个反例
    再次使用
      根据任务回找
      记录哪里卡住
~~~

先看问题由哪些部分组成。分支表达思考结构，不代表已经证明因果。

## 2. 流程图：把判断和回路画出来

~~~mermaid
flowchart TD
  A[保存一份资料] --> B[补一句使用情境]
  B --> C[按当前任务回找]
  C --> D{能找到并解释用途吗}
  D -->|可以| E[用于输出或实践]
  D -->|还不行| F[记录缺少的线索]
  F --> B
~~~

菱形是判断，箭头是下一步；失败分支也要有出口。

## 3. 时序图：看清角色之间的交接

~~~mermaid
sequenceDiagram
  participant P as 参与者
  participant R as 研究者
  participant N as 记录者
  R->>P: 请找回上周的一份资料
  P-->>N: 描述入口与搜索词
  N->>R: 保留原话和可观察动作
  R-->>P: 核对记录是否准确
~~~

这张图表示演示访谈的交接顺序，不把真实账号或私密资料写进图中。

## 4. 时间线：保留阶段和产出

~~~mermaid
timeline
  title 虚构研究练习的三个阶段
  section 准备
    第一天 : 写研究问题 : 整理已有材料
  section 观察
    第二天 : 记录操作过程 : 保留相反证据
  section 复盘
    第三天 : 修正解释 : 确定下一步
~~~

## 选哪一种

| 想回答的问题 | 图表 |
| --- | --- |
| 这个主题由什么组成 | 思维导图 |
| 下一步怎么走，失败怎么办 | 流程图 |
| 谁先做什么，交给谁 | 时序图 |
| 哪个阶段形成什么 | 时间线 |

在个人笔记中可用“插入图表”开始，再修改节点。图表帮助表达关系，不能替代证据。`),
    访谈提纲与记录方法: html(
      page(
        '<h1>最近一次找资料，是怎么发生的？</h1><p class="ln-note-hint">访谈提纲 · 虚构教学场景 · 匿名记录</p><p>目的：理解回找过程。开场说明用途、记录方式与退出选择。</p><div class="ln-note-reading-section"><h2>1. 当时要完成什么？</h2><p class="ln-note-hint">追问：是什么让你想起需要这份资料？</p><blockquote>“要准备讨论，想起之前收藏过一篇相关材料。”</blockquote></div><div class="ln-note-reading-section"><h2>2. 你先去了哪里？</h2><p class="ln-note-hint">追问：接下来做了什么？方便的话，描述当时的顺序。</p><blockquote>记录：先翻列表，再尝试搜索关键词。</blockquote></div><div class="ln-note-reading-section"><h2>3. 有过顺利找到的经历吗？</h2><p class="ln-note-hint">保留相反案例，不把“加标签”放进问题里。</p></div><p class="ln-note-closing">结束前核对原话与后续使用约定。解释留到证据笔记，不混在回答里。</p>',
        'interview',
      ),
    ),

    访谈发现与相反证据: html(
      page(
        '<h1>“忘了用途”是唯一原因吗？</h1><p class="ln-note-hint">证据札记 · A、B、C 均为虚构角色</p><div class="ln-note-margin"><div><blockquote>“存了文章，却忘了准备用来解决什么。”</blockquote><p>暂时解释：保存时的情境可能影响回找。</p></div><div class="ln-note-annotation">片段 A<br>支持情境缺失<br>不能推及所有人</div></div><div class="ln-note-margin"><div><blockquote>“记得关键词，搜索一下就找到了。”</blockquote><p>这是相反证据。困难并非人人都有。</p></div><div class="ln-note-annotation">片段 B<br>关键词策略有效</div></div><div class="ln-note-reading-section"><h2>当前判断</h2><p>先保留不同回找方式，不急着得出统一结论。下一次观察入口、关键词和中断点。</p></div><p class="ln-note-closing">证据不足时写“未确认”，再回到访谈记录核对。</p>',
        'evidence',
      ),
    ),

    小团队知识协作比较表: html(
      page(
        '<h1>选之前，做同一个小任务</h1><p class="ln-note-hint">候选 A / B 为虚构占位，不对应真实产品</p><p><strong>硬约束：</strong>能导出资料，区分公开与内部内容，在主要设备阅读。</p><div class="ln-note-reading-section"><table><tr><th>同一项任务</th><th>候选 A</th><th>候选 B</th></tr><tr><td>导出带附件的笔记</td><td>待实测</td><td>待实测</td></tr><tr><td>第二账号打开受限资料</td><td>待核验</td><td>待核验</td></tr><tr><td>找回一周前的决定</td><td>记录查找路径</td><td>记录查找路径</td></tr><tr><td>导入同一组样本</td><td>记录遗漏</td><td>记录遗漏</td></tr></table></div><div class="ln-note-reading-section"><h2>结论与代价</h2><p>先写最重要的两项需求，再记录愿意接受的限制。没有实测的地方保持“未知”。</p></div><p class="ln-note-closing">当权限需求或附件类型变化时，重新核验。</p>',
        'comparison',
      ),
    ),

    'Markdown 实践作业': md(String.raw`# 把一份旅行清单写清楚

> Markdown 动手练习 · 虚构出行场景。目标：独立写出两层列表和正文勾选框。

## 先自己试一次

写一份“出发前”的清单，包括确认交通和整理行李。充电器、雨具属于行李的子项。

## 对照源码

~~~markdown
## 出发前

- [x] 确认交通
- [ ] 整理行李
  - 充电器
  - 雨具
~~~

## 实际效果

- [x] 确认交通
- [ ] 整理行李
  - 充电器
  - 雨具

## 检查结果

1. 标题是否概括了这一组任务？
2. 行李与子项的层级是否正确？
3. 能解释为什么这里使用列表吗？

> 缩进提示：子项比父项多缩进一级，同层使用相同数量的空格。

正文勾选框不会自动创建待办提醒。把卡住的一处记录到 ${mdNote('复习记录与错误分析')}，语法需要时查 ${mdNote('Markdown 语法速查表')}。`),
    阅读理解与反例笔记: html(
      page(
        '<h1>每一条收藏，都需要写成长笔记吗？</h1><p class="ln-note-hint">思考练习 · 一次观点检验</p><p class="ln-note-summary">暂时判断：需要深入理解的材料，值得留下自己的解释。</p><div class="ln-note-reading-section"><h2>支持它的例子</h2><p>学会一种写作方法后，尝试写一篇自己的短文，比只保存教程更容易发现问题。</p></div><div class="ln-note-reading-section"><h2>让它不成立的反例</h2><p>车次查询入口只需及时打开。为了证明“学到了”，给它写一篇总结并没有必要。</p></div><div class="ln-note-reading-section"><h2>修正后的说法</h2><p><mark>记录深度由用途决定。</mark>需要判断和迁移时多解释，只需访问时保留好入口就够了。</p></div>',
        'reflection',
      ),
    ),

    复习记录与错误分析: md(String.raw`# 两层列表为什么变成了同一层？

> 复习记录 · 虚构的第一次独立尝试。

## 看到的现象

~~~markdown
- 整理行李
- 充电器
- 雨具
~~~

三个条目同级，未表达“属于行李”的关系。

## 修正与原因

~~~markdown
- 整理行李
  - 充电器
  - 雨具
~~~

**缩进表达父子关系**，不只是让文字好看。看示例时能认出来，不代表合上提示也能写对。

## 下一次重试

换成阅读清单，合上提示独立写一遍。记录是否又出现同类错误；仍然卡住时回看 ${mdNote('Markdown 实践作业')}。

保留每次尝试与原因，不用一个百分比代替对原因的理解。`),
    周报改写前后对照: html(
      page(
        '<h1>把“做了很多”改成看得懂的进展</h1><p class="ln-note-hint">写作练习 · 虚构素材</p><div class="ln-note-proof"><div class="ln-note-proof-before"><h2>原稿</h2><p>本周开了几次会，整理了<s>很多资料</s>，优化了体验，<s>效率明显提高</s>。</p><p class="ln-note-hint">活动有了，结果与依据还没有。</p></div><div><h2>改写</h2><p><mark>项目说明已完成初稿，常用资料入口已整理。</mark>历史方案尚需补齐，下周先进行一次小范围试用。</p><p class="ln-note-hint">交付物、缺口、下一步，分别说清楚。</p></div></div><div class="ln-note-reading-section"><h2>三处修改</h2><ol><li>“开会”后面补上形成的决定。</li><li>把“很多”换成可以打开的成果。</li><li>没有测量的效果，保留为待验证。</li></ol></div>',
        'rewrite',
      ),
    ),

    教程大纲与读者反馈: html(
      page(
        '<h1>一篇周末出行指南，先写什么？</h1><p class="ln-note-hint">内容创作 · 大纲草稿</p><div class="ln-note-margin"><div><h2>文章大纲</h2><ol><li><strong>先判断适不适合自己</strong><ul><li>时间与步行强度</li><li>交通条件</li></ul></li><li><strong>出发前准备</strong><ul><li>携带物品</li><li>查天气与营业信息</li></ul></li><li><strong>当天怎样安排</strong><ul><li>从起点到返程</li><li>下雨时的替代方案</li></ul></li></ol></div><div class="ln-note-annotation"><strong>读者反馈 · 演示</strong><p>“能先告诉我需要多久吗？”</p><p>修订：把时间与强度前移。</p></div></div><p class="ln-note-closing">日期、路线和营业时间需写作时核实；本页仅展示大纲结构。</p>',
        'outline',
      ),
    ),

    '周末散步：把生活留在一页里': html(
      '<h1 style="font-size:1.9em;line-height:1.35;">慢一点，看看身边的颜色</h1>' +
        p('<em>生活图文示例 · 一段虚构的周末散步，插画由 AI 生成。</em>') +
        picture(images.weekend, '湖边散步、树影和一杯茶的原创插画') +
        '<h2>不急着写一篇完整游记</h2>' +
        p(
          '树影落在石板上，远处的水面变成浅紫色。停下来时，先留下<strong>风、光线和坐过的地方</strong>，回家后再补充想法。',
        ) +
        quote('这一次不追求走多远，只想记得：是什么让我愿意停下来。') +
        '<h2>三个小细节</h2>' +
        list([
          '<strong>看见：</strong>树叶把阳光切成不规则的形状。',
          '<strong>听见：</strong>水声之外，还有翻动书页的声音。',
          '<strong>想起：</strong>有些灵感要慢一点才会出现。',
        ]) +
        '<hr>' +
        p('本篇仍保留在待整理中。可以先记录，再决定路线与主题标签；不必为了排版完整而编造真实地点或行程。') +
        p('继续看看 ' + note('一张灵感板的配色观察') + '，或用 ' + note('手绘笔记示例', '手绘') + '留下当时的线条。'),
    ),
    一张灵感板的配色观察: html(
      page(
        '<h1>从一张图里借一点灵感</h1>' +
          p('视觉观察 · AI 插画') +
          media(
            images.inspiration,
            '纸张和植物组成的原创灵感板',
            '我先看到了什么',
            p('纸张的暖色把不同材料连接起来。深绿色不多，却让画面有了落点。') +
              p(
                '<span style="background-color:#e7d9b9;color:#352d20;">　暖纸色　</span>　<span style="background-color:#476653;color:#ffffff;">　植物绿　</span>　<span style="background-color:#bb705b;color:#ffffff;">　陶土色　</span>',
              ) +
              p('<strong>想尝试：</strong>大面积留白，只在一个重点处用深色。') +
              p('先说明为什么喜欢，再决定是否复用到自己的设计里。'),
            'left',
          ) +
          p(
            '这些颜色是创作观察，不是界面主题规范。另一种表达见 ' +
              note('周末散步：把生活留在一页里', '生活手账') +
              '。',
          ),
        'inspiration',
      ),
    ),
  };
}
