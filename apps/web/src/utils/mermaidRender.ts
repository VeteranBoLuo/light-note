import i18n from '@/i18n';
import icon from '@/config/icon.ts';

/**
 * Markdown 里的 ```mermaid 代码块 → 图（思维导图/流程图/时序图…）。
 *
 * 设计要点(都是实测踩出来的):
 * - **不改 marked/DOMPurify 管线**:渲染后的 HTML 里 mermaid 仍是普通代码块,挂载后再就地换成 SVG。
 *   这样 Markdown 的消毒口径不用为图表开口子,渲染失败也天然退回代码块。
 * - **htmlLabels: false**:mermaid 默认用 <foreignObject> 画节点文字,而 DOMPurify 会把 foreignObject
 *   整个剥掉(实测 ADD_TAGS 也救不回来)、导出 PDF 的 html2canvas 同样不渲染它,APK WebView 亦有风险 ——
 *   三处都会变成"有框没字"。改用纯 SVG <text> 后各路径一致。
 * - **按需加载**:只有内容真的出现 mermaid 代码块时才 import('mermaid'),首屏不受影响。
 */

/** marked 产出 `<pre><code class="language-mermaid">`;hljs 管线会多带一个 hljs class */
const MERMAID_CODE_SELECTOR = 'pre > code[class*="language-mermaid"]';
/** TinyMCE codesample 存的是 `<pre class="language-mermaid">` */
const MERMAID_PRE_SELECTOR = 'pre[class*="language-mermaid"]';

const FIGURE_CLASS = 'mermaid-figure';
/** 伴随模式生成的图(挂在源码块后面,不进笔记内容) */
const COMPANION_CLASS = 'mermaid-figure--companion';
/**
 * 伴随图存在时给源码块加的编辑期标记。
 *
 * 旧版 Android WebView 不支持 `:has()`，不能再靠相邻结构隐藏源码。该 class 会在
 * TinyMCE 的 GetContent/BeforeSetContent 管线里由 stripTransientMermaidMarkers 剥离，
 * 因此只属于当前编辑器 DOM，不会写入笔记正文。
 */
export const MERMAID_COMPANION_SOURCE_CLASS = 'mermaid-source--has-companion';
/** 富文本图表的编辑按钮/双击手势向 Vue 编辑器派发的受控事件。 */
export const MERMAID_EDIT_EVENT = 'lightnote:mermaid-edit';
const RENDERED_FLAG = 'data-mermaid-source';

/** 从持久化 HTML 中移除 Mermaid 的编辑期源码标记，同时保留其他 class。 */
export function stripTransientMermaidMarkers(html: string): string {
  if (!html.includes(MERMAID_COMPANION_SOURCE_CLASS)) return html;
  return html.replace(/\sclass=(['"])(.*?)\1/giu, (attribute, quote: string, value: string) => {
    const classes = value
      .split(/\s+/u)
      .filter(Boolean)
      .filter((className) => className !== MERMAID_COMPANION_SOURCE_CLASS);
    return classes.length ? ` class=${quote}${classes.join(' ')}${quote}` : '';
  });
}

/** 同一段源码在编辑器里会被反复重渲染(每次输入都刷新预览),缓存避免重复调用 mermaid */
const svgCache = new Map<string, string>();
const SVG_CACHE_LIMIT = 60;

let mermaidPromise: Promise<any> | null = null;
/** 上次 initialize 用的「主题+紧凑度+风格」签名 */
let initializedSignature: string | null = null;
let renderSeq = 0;
/** 每个图表容器最近一次渲染批次,用于作废上一次的异步结果 */
const figureRuns = new WeakMap<HTMLElement, number>();

/*
 * 图表色板。mermaid 自带主题(default/dark)是高饱和的荧光黄绿紫,混在笔记正文里很刺眼,
 * 所以走 base 主题自己配色:低饱和填充 + 同色系深/浅文字,和轻笺界面同一套观感。
 *
 * cScaleN / cScaleLabelN / cScalePeerN 是思维导图各层分支的填充/文字/描边;
 * mainBkg / nodeBorder / nodeTextColor 管流程图等其他图表的节点。
 * 根节点单独用 CSS 覆盖成品牌色(见 common.less)——mermaid 会把 primaryColor 自行加深,改不动。
 */
const MERMAID_THEME_DAY = {
  fontSize: '14px',
  lineColor: '#9aa1b1',
  textColor: '#1f2329',
  mainBkg: '#EEF0FE',
  nodeBorder: '#C0C3F0',
  nodeTextColor: '#2B2A6B',
  primaryColor: '#615ced',
  primaryBorderColor: '#4f4ad6',
  primaryTextColor: '#ffffff',
  cScale0: '#E4E7FC',
  cScaleLabel0: '#2B2A6B',
  cScalePeer0: '#A9AEF0',
  cScale1: '#D9F0E8',
  cScaleLabel1: '#0F6E58',
  cScalePeer1: '#8FD3BF',
  cScale2: '#FDE8D5',
  cScaleLabel2: '#8A4A13',
  cScalePeer2: '#F0BE8C',
  cScale3: '#DDEBFC',
  cScaleLabel3: '#1E5AA8',
  cScalePeer3: '#9CC3EF',
  cScale4: '#F8E2EE',
  cScaleLabel4: '#8E3A68',
  cScalePeer4: '#E5AECB',
  cScale5: '#EBE9DF',
  cScaleLabel5: '#5F5947',
  cScalePeer5: '#CFC9B2',
  // 时序图单独一组:不配的话参与者框的文字会取到和底色一样的值(实测两者都是 rgb(238,240,254)),
  // 框里的字等于隐形
  actorBkg: '#EEF0FE',
  actorBorder: '#C0C3F0',
  actorTextColor: '#2B2A6B',
  actorLineColor: '#9aa1b1',
  signalColor: '#5b6270',
  signalTextColor: '#1f2329',
  labelBoxBkgColor: '#E4E7FC',
  labelBoxBorderColor: '#C0C3F0',
  labelTextColor: '#2B2A6B',
  loopTextColor: '#1f2329',
  noteBkgColor: '#FDF3DE',
  noteBorderColor: '#E8D9A8',
  noteTextColor: '#6b5b3d',
};

/** 思维导图根节点:品牌紫底 + 白字(对比度 5.4:1),两套主题统一 */
const ROOT_NODE_FILL = '#615ced';
const ROOT_NODE_TEXT = '#ffffff';

const MERMAID_THEME_NIGHT = {
  fontSize: '14px',
  lineColor: '#6b7280',
  textColor: '#f2f4f7',
  mainBkg: '#2E3050',
  nodeBorder: '#4A4D80',
  nodeTextColor: '#E6E8F5',
  primaryColor: '#615ced',
  primaryBorderColor: '#7b77f0',
  primaryTextColor: '#ffffff',
  cScale0: '#2E3050',
  cScaleLabel0: '#C7C9F5',
  cScalePeer0: '#4A4D80',
  cScale1: '#22403A',
  cScaleLabel1: '#9EE0CC',
  cScalePeer1: '#35604F',
  cScale2: '#43342A',
  cScaleLabel2: '#F2C79B',
  cScalePeer2: '#6A5340',
  cScale3: '#22364F',
  cScaleLabel3: '#A8CBF0',
  cScalePeer3: '#35506F',
  cScale4: '#43293A',
  cScaleLabel4: '#EDAFCE',
  cScalePeer4: '#6A4058',
  cScale5: '#383830',
  cScaleLabel5: '#D8D3BE',
  cScalePeer5: '#55523F',
  actorBkg: '#2E3050',
  actorBorder: '#4A4D80',
  actorTextColor: '#E6E8F5',
  actorLineColor: '#6b7280',
  signalColor: '#a7adba',
  signalTextColor: '#f2f4f7',
  labelBoxBkgColor: '#33365C',
  labelBoxBorderColor: '#4A4D80',
  labelTextColor: '#E6E8F5',
  loopTextColor: '#f2f4f7',
  noteBkgColor: '#3A3527',
  noteBorderColor: '#5A5340',
  noteTextColor: '#E8E0C8',
};

function currentTheme(): 'day' | 'night' {
  if (typeof document === 'undefined') return 'day';
  return document.documentElement.getAttribute('data-theme') === 'night' ? 'night' : 'day';
}

/*
 * 连线样式偏好。默认圆滑(mermaid 原生曲线),用户可以在图上的工具条切成折线。
 * 存 localStorage 而不是写进笔记内容:这是"我想怎么看",不是笔记的一部分,
 * 只读页面也能自己调;而且同一篇笔记里的图应该统一,不该一张弯一张直。
 */
export type MermaidEdgeStyle = 'curved' | 'orthogonal';
const EDGE_STYLE_KEY = 'ln-mermaid-edge-style';
let edgeStyleCache: MermaidEdgeStyle | null = null;

export function getMermaidEdgeStyle(): MermaidEdgeStyle {
  if (edgeStyleCache) return edgeStyleCache;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(EDGE_STYLE_KEY);
  } catch {
    /* 存储不可用时用默认值 */
  }
  edgeStyleCache = stored === 'orthogonal' ? 'orthogonal' : 'curved';
  return edgeStyleCache;
}

/** 换连线样式并把页面上所有图按新样式重画 */
export function setMermaidEdgeStyle(style: MermaidEdgeStyle): void {
  edgeStyleCache = style;
  try {
    window.localStorage.setItem(EDGE_STYLE_KEY, style);
  } catch {
    /* 无痕模式等场景写不进去,不影响本次会话 */
  }
  refreshMermaidTheme();
}

function cacheKey(code: string): string {
  return `${currentTheme()}::${getMermaidEdgeStyle()}::${code}`;
}

function rememberSvg(key: string, svg: string) {
  if (svgCache.size >= SVG_CACHE_LIMIT) {
    const oldest = svgCache.keys().next().value;
    if (oldest !== undefined) svgCache.delete(oldest);
  }
  svgCache.set(key, svg);
}

async function loadMermaid(): Promise<any> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod: any) => mod.default || mod);
  }
  const mermaid = await mermaidPromise;
  const theme = currentTheme();
  const edgeStyle = getMermaidEdgeStyle();
  // 主题或连线样式一变就要重新 initialize;签名一致则跳过,免得每张图都重配一遍
  const signature = `${theme}::${edgeStyle}`;
  if (initializedSignature !== signature) {
    mermaid.initialize({
      startOnLoad: false,
      // strict:节点文本里的 HTML 会被转义,不执行 click 交互 —— 笔记内容是用户输入,必须收着
      securityLevel: 'strict',
      // 走 base 主题 + 自定义色板:mermaid 自带的 default/dark 主题是荧光黄绿紫,
      // 放进笔记里非常刺眼,和轻笺的界面完全不是一套东西
      theme: 'base',
      htmlLabels: false,
      flowchart: {
        htmlLabels: false,
        useMaxWidth: true,
        curve: edgeStyle === 'orthogonal' ? 'step' : 'basis',
      },
      mindmap: { useMaxWidth: true },
      fontFamily: 'inherit',
      themeVariables: theme === 'night' ? MERMAID_THEME_NIGHT : MERMAID_THEME_DAY,
    });
    initializedSignature = signature;
  }
  return mermaid;
}

/**
 * 把已经渲染过的图**同步**塞回 HTML 里(编辑器预览专用)。
 *
 * 预览是每次输入都整片重建 v-html 的,重建出来的又是代码块,要等指令异步渲染完才变回图 ——
 * 用户看到的就是「改一个字,右边的图先闪成一段代码再变回来」。这里在 HTML 交给 v-html 之前,
 * 直接用缓存里的 SVG 顶上,已经画过的图不再经历那一下闪烁。
 * 只做同步的缓存命中,没缓存的照旧走异步渲染。
 */
export function inlineCachedMermaid(html: string, previous?: HTMLElement | null): string {
  if (typeof document === 'undefined' || !html) return html;
  const holder = document.createElement('div');
  holder.innerHTML = html;
  // 上一版预览里的图,按出现顺序对位:改了图表内容时先拿旧图顶着,不要退回代码块
  const previousSvgs = previous
    ? Array.from(previous.querySelectorAll<HTMLElement>(`.${FIGURE_CLASS}__canvas`)).map((el) => el.innerHTML)
    : [];
  let replaced = false;

  collectPendingBlocks(holder).forEach(({ pre, code }, index) => {
    const cached = svgCache.get(cacheKey(code));
    // 缓存没有(源码刚被改过)就沿用同一位置的旧图,标成 stale 等异步渲染出新的来换。
    // 少了这一步就是用户看到的:改节点文字时图先闪成一段代码,而删回原样反倒不闪
    // —— 因为删回去正好命中了缓存。
    const svg = cached || previousSvgs[index];
    const figure = buildFigure(code);

    if (svg) {
      figure.dataset.mermaidState = cached ? 'ready' : 'stale';
      const canvas = document.createElement('div');
      canvas.className = `${FIGURE_CLASS}__canvas`;
      canvas.innerHTML = svg;
      figure.appendChild(canvas);
    } else {
      /*
       * 全新的图表(比如刚点了「插入图表」),既没缓存也没有旧图可顶。
       * 这时也不要把源码摊开 —— 用户看到的是"先冒出一段代码块,再变成图"。
       * 给一个等大的占位,渲染好了直接换成图。
       */
      figure.dataset.mermaidState = 'queued';
      const placeholder = document.createElement('div');
      placeholder.className = `${FIGURE_CLASS}__placeholder`;
      figure.appendChild(placeholder);
    }

    pre.replaceWith(figure);
    replaced = true;
  });

  return replaced ? holder.innerHTML : html;
}

/** 内容里是否存在 mermaid 代码块(粗判,用于跳过整段无谓的 DOM 扫描) */
export function hasMermaidBlock(content: string): boolean {
  return /(^|\n)\s*```+\s*mermaid\b/i.test(content || '') || /language-mermaid/.test(content || '');
}

/** 找出还没被渲染过的 mermaid 代码块 */
function collectPendingBlocks(root: ParentNode): { pre: HTMLElement; code: string }[] {
  const blocks: { pre: HTMLElement; code: string }[] = [];
  root.querySelectorAll(MERMAID_CODE_SELECTOR).forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (!pre || pre.closest(`.${FIGURE_CLASS}`)) return;
    blocks.push({ pre, code: codeEl.textContent || '' });
  });
  root.querySelectorAll(MERMAID_PRE_SELECTOR).forEach((preEl) => {
    const pre = preEl as HTMLElement;
    if (pre.closest(`.${FIGURE_CLASS}`) || blocks.some((b) => b.pre === pre)) return;
    blocks.push({ pre, code: pre.textContent || '' });
  });
  return blocks;
}

function buildFigure(code: string): HTMLElement {
  const figure = document.createElement('div');
  figure.className = FIGURE_CLASS;
  figure.setAttribute(RENDERED_FLAG, code);
  return figure;
}

function appendFigurePlaceholder(figure: HTMLElement) {
  const placeholder = document.createElement('div');
  placeholder.className = `${FIGURE_CLASS}__placeholder`;
  figure.appendChild(placeholder);
}

function requestFigureEdit(figure: HTMLElement, code: string) {
  figure.dispatchEvent(
    new CustomEvent(MERMAID_EDIT_EVENT, {
      bubbles: true,
      composed: true,
      detail: { source: code },
    }),
  );
}

function bindFigureEditGesture(figure: HTMLElement, code: string) {
  if (!figure.classList.contains(COMPANION_CLASS)) {
    figure.ondblclick = null;
    return;
  }
  figure.ondblclick = (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(`.${FIGURE_CLASS}__tools`)) return;
    event.preventDefault();
    requestFigureEdit(figure, code);
  };
}

function fillWithError(figure: HTMLElement, code: string, error: unknown, interactive = true) {
  const message = String((error as Error)?.message || error || '')
    .split('\n')
    .slice(0, 3)
    .join(' ')
    .slice(0, 200);
  figure.dataset.mermaidState = 'error';
  figure.innerHTML = '';

  const tip = document.createElement('div');
  tip.className = `${FIGURE_CLASS}__error`;
  tip.textContent = message
    ? `${i18n.global.t('note.mermaidRenderFailed')}：${message}`
    : i18n.global.t('note.mermaidRenderFailed');
  figure.appendChild(tip);

  // 失败时把源码原样留下,笔记内容不会因为渲染问题而"消失"
  const pre = document.createElement('pre');
  const codeEl = document.createElement('code');
  codeEl.className = 'language-mermaid';
  codeEl.textContent = code;
  pre.appendChild(codeEl);
  figure.appendChild(pre);

  bindFigureEditGesture(figure, code);
  if (interactive && figure.classList.contains(COMPANION_CLASS)) {
    figure.appendChild(
      buildFigureToolbar(() => '', code, {
        editable: true,
        figure,
        diagramActions: false,
      }),
    );
  }
}

/**
 * 修正思维导图根节点的文字位置。
 *
 * mermaid 在 htmlLabels: false 下把根节点文字按"从形状中心起笔"绘制,而不是居中 ——
 * 实测形状 bbox 中心在 0、文字 bbox 中心在 +28,于是中文标题整个右移、末字顶出边框
 * (用户反馈里"中心主题"只显示成"中心主"就是这个)。英文因为估算宽度接近实际宽度不明显。
 * 只挪根节点的 text,分支节点 mermaid 自己摆得是对的。
 */
/**
 * 把思维导图根节点的品牌色写进 SVG 字符串(插入 DOM **之前**做)。
 *
 * 两个原因必须在字符串阶段处理:
 * 1. 图会被转成 data URL 拿去放大/下载,那是独立文档,站内样式表一概不生效;
 * 2. 插进 DOM 之后再改色,浏览器已经画过一帧 —— 插入图表的瞬间会看到 mermaid 原本的藏蓝
 *    闪一下再变成品牌紫。
 */
function applyRootBrandColors(svg: string): string {
  if (!svg.includes('section-root')) return svg;
  try {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return svg;

    /*
     * 统一思维导图的连线粗细。
     * mermaid 按层级给边线宽:靠近根部 11px、末梢 5px,本意是模仿树枝由粗到细,
     * 但节点本身是等大的圆角标签,粗细混在一起只会显得线条杂乱(用户原话:有的粗有的细)。
     * 统一成一个细值后,分支靠颜色区分,整张图干净很多。
     */
    doc.querySelectorAll('path.edge[class*="section-edge"]').forEach((edge) => {
      (edge as SVGElement).style.setProperty('stroke-width', '2.5px', 'important');
    });

    doc.querySelectorAll('.section-root').forEach((node) => {
      node.querySelectorAll('rect, circle, ellipse, polygon, path').forEach((shape) => {
        (shape as SVGElement).style.setProperty('fill', ROOT_NODE_FILL, 'important');
        (shape as SVGElement).style.setProperty('stroke', ROOT_NODE_FILL, 'important');
      });
      node.querySelectorAll('text, tspan').forEach((text) => {
        (text as SVGElement).style.setProperty('fill', ROOT_NODE_TEXT, 'important');
      });
    });
    return new XMLSerializer().serializeToString(doc.documentElement);
  } catch {
    return svg;
  }
}

/** 已经摆正过的标记:避免同一段 SVG 被重复平移(缓存复用时会再走一遍) */
const CENTERED_FLAG = 'data-ln-centered';

/**
 * 出图前的统一加工:上品牌色 + 摆正根节点文字。
 *
 * 位置校正要用 getBBox,元素必须在文档里才有值,所以先挂到一个离屏舞台上加工完,
 * 再把成品交出去 —— 直接插进页面再改,浏览器已经画过一帧,用户会看到文字先偏在右边
 * 再"跳"到中间。颜色同理,一并在这里处理干净。
 */
function prepareSvg(svg: string): string {
  if (!svg || typeof document === 'undefined') return svg;
  const painted = applyRootBrandColors(svg);
  if (!painted.includes('section-root')) return painted;

  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;left:-99999px;top:0;width:1200px;pointer-events:none';
  stage.innerHTML = painted;
  document.body.appendChild(stage);
  try {
    // 折线是用户在图上主动选的样式,默认保持 mermaid 原生的圆滑曲线
    if (getMermaidEdgeStyle() === 'orthogonal') squareMindmapEdges(stage);
    centerMindmapRootLabels(stage);
    return stage.innerHTML;
  } finally {
    stage.remove();
  }
}

/**
 * 把思维导图的连线改成横平竖直的折线。
 *
 * 流程图能靠 `flowchart.curve` 配置线型,思维导图的边却是 mermaid 内部写死的贝塞尔曲线
 * (实测给 curve 传什么值,mindmap 的 path 里都还是 C 命令),只能渲染完自己改写路径:
 * 取原路径的两个端点,重画成「横 → 竖 → 横」的折线。
 * 必须在挂进文档后做 —— getPointAtLength 依赖真实渲染。
 */
function squareMindmapEdges(container: HTMLElement) {
  container.querySelectorAll<SVGPathElement>('path.edge[class*="section-edge"]').forEach((edge) => {
    try {
      const total = edge.getTotalLength();
      if (!total) return;
      const start = edge.getPointAtLength(0);
      const end = edge.getPointAtLength(total);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      // 主方向决定先走哪一段:横向为主就「横-竖-横」,纵向为主就「竖-横-竖」
      const d =
        Math.abs(dx) >= Math.abs(dy)
          ? `M${start.x},${start.y} L${start.x + dx / 2},${start.y} L${start.x + dx / 2},${end.y} L${end.x},${end.y}`
          : `M${start.x},${start.y} L${start.x},${start.y + dy / 2} L${end.x},${start.y + dy / 2} L${end.x},${end.y}`;
      edge.setAttribute('d', d);
      edge.style.setProperty('fill', 'none', 'important');
    } catch {
      /* 拿不到路径长度就保持原样,曲线也能看 */
    }
  });
}

function centerMindmapRootLabels(container: HTMLElement) {
  container.querySelectorAll<SVGGElement>('.section-root').forEach((node) => {
    const shape = node.querySelector<SVGGraphicsElement>('rect, circle, ellipse, polygon, path');
    const text = node.querySelector<SVGGraphicsElement>('text');
    if (!shape || !text || text.hasAttribute(CENTERED_FLAG)) return;
    try {
      const shapeBox = shape.getBBox();
      const textBox = text.getBBox();
      // 离屏容器里 getBBox 全是 0,没法算,保持原样(导出路径会先把容器挂进文档再渲染)
      if (!shapeBox.width || !textBox.width) return;
      // 打标记要在真正算过之后:没算成的下次还得有机会再算
      text.setAttribute(CENTERED_FLAG, '1');
      const dx = shapeBox.x + shapeBox.width / 2 - (textBox.x + textBox.width / 2);
      if (Math.abs(dx) < 1) return;
      const existing = text.getAttribute('transform');
      text.setAttribute('transform', `${existing ? `${existing} ` : ''}translate(${dx.toFixed(2)}, 0)`);
    } catch {
      /* getBBox 在未渲染的 SVG 上会抛,忽略即可 */
    }
  });
}

function fillWithSvg(figure: HTMLElement, svg: string, interactive = true) {
  figure.dataset.mermaidState = 'ready';
  figure.innerHTML = '';

  const canvas = document.createElement('div');
  canvas.className = `${FIGURE_CLASS}__canvas`;
  canvas.innerHTML = svg;
  figure.appendChild(canvas);
  // 正常路径下 SVG 在 prepareSvg 里已经加工好了;这里兜底处理没走过加工的来源(比如旧缓存)
  centerMindmapRootLabels(canvas);
  bindFigureEditGesture(figure, figure.getAttribute(RENDERED_FLAG) || '');

  // 导出的静态 HTML 里按钮点了没反应,不放
  if (!interactive) return;
  const code = figure.getAttribute(RENDERED_FLAG) || '';
  figure.appendChild(
    buildFigureToolbar(() => canvas.innerHTML, code, {
      editable: figure.classList.contains(COMPANION_CLASS),
      figure,
    }),
  );
}

/**
 * 图表类型:只看第一行的图表声明。
 * 跳过 mermaid 的配置指令(`%%{init:...}%%`)和 frontmatter,它们可以出现在声明之前。
 */
function diagramKind(code: string): string {
  const line = code
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith('%%') && !item.startsWith('---'));
  const keyword = (line || '').split(/[\s({[]/)[0]?.toLowerCase() || '';
  if (keyword === 'graph') return 'flowchart';
  return keyword;
}

/** 连线样式只对这两类图有意义:时序图、时间线的线本来就是规规矩矩的直线 */
function supportsEdgeStyle(code: string): boolean {
  const kind = diagramKind(code);
  return kind === 'mindmap' || kind === 'flowchart';
}

/** 图右上角的工具条。用原生 DOM 是因为整个渲染流程就在 DOM 层,拿不到 Vue 组件 */
function buildFigureToolbar(
  getSvg: () => string,
  code = '',
  options: { editable?: boolean; figure?: HTMLElement; diagramActions?: boolean } = {},
): HTMLElement {
  const t = (key: string) => i18n.global.t(key);
  const bar = document.createElement('div');
  bar.className = `${FIGURE_CLASS}__tools`;

  const addButton = (iconSvg: string, label: string, onClick: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${FIGURE_CLASS}__tool`;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = iconSvg;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    bar.appendChild(button);
    return button;
  };

  const tools = icon.noteDetail.diagramTools;
  if (options.editable && options.figure) {
    addButton(tools.edit, t('note.mermaidEdit'), () => requestFigureEdit(options.figure as HTMLElement, code));
  }
  if (options.diagramActions === false) return bar;
  // 连线样式切换只给思维导图和流程图:图标显示的是"点下去会变成什么"
  if (supportsEdgeStyle(code)) {
    const edgeStyle = getMermaidEdgeStyle();
    addButton(
      edgeStyle === 'orthogonal' ? tools.edgeCurved : tools.edgeOrthogonal,
      edgeStyle === 'orthogonal' ? t('note.mermaidEdgeCurved') : t('note.mermaidEdgeOrthogonal'),
      () => setMermaidEdgeStyle(edgeStyle === 'orthogonal' ? 'curved' : 'orthogonal'),
    );
  }
  addButton(tools.download, t('note.mermaidDownload'), () => void downloadDiagramImage(getSvg()));
  addButton(tools.zoom, t('note.mermaidZoom'), () => void openMermaidViewer(getSvg()));

  return bar;
}

/**
 * 图存成 PNG。走 canvas 转位图而不是直接给 SVG 文件:PNG 到哪都能贴,
 * SVG 在很多聊天工具和文档里打不开。2 倍分辨率保证放大不糊。
 */
async function downloadDiagramImage(svg: string) {
  const [{ deliverGeneratedFile }, { default: message }] = await Promise.all([
    import('@/utils/fileDelivery.ts'),
    import('@/components/base/BasicComponents/BMessage/BMessage.ts'),
  ]);
  try {
    const image = new Image();
    image.src = svgToDataUrl(svg);
    await image.decode();
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, image.naturalWidth * scale);
    canvas.height = Math.max(1, image.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
    // 图表本身是透明底,深色主题下存出来会看不清,统一铺白底
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('CANVAS_TO_BLOB_FAILED');
    const result = await deliverGeneratedFile({
      content: blob,
      fileName: `diagram-${new Date().toISOString().slice(0, 10)}.png`,
      mimeType: 'image/png',
      preferShare: true,
    });
    // App 内落不了盘就别静默收场：图已经渲染完了，什么都不说等于让人以为存好了。
    // （更好的出路是走 image.save 存进相册，和头像同一条通道，本次未做。）
    if (result === 'unavailable') {
      message.warning(i18n.global.t('note.mermaidDownloadFailed'));
    }
  } catch {
    message.warning(i18n.global.t('note.mermaidDownloadFailed'));
  }
}

/**
 * SVG → data URL,交给站内既有的图片查看器(缩放、拖拽、移动端手势都是现成的)。
 *
 * 关键一步是先把 width/height 从 `100%` 换成 viewBox 的像素值:图片查看器按 naturalWidth
 * 决定初始缩放,百分比宽度的 SVG 在 <img> 里没有固有尺寸,放大后只有指甲盖那么大。
 */
function svgToDataUrl(svg: string): string {
  let normalized = svg;
  try {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const el = doc.documentElement;
    const viewBox = (el.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
      // 查看器按原始尺寸打开、不会主动放大,而 mermaid 出的图往往只有几百像素宽,
      // 点开跟没点一样。SVG 是矢量,这里直接按倍数放大不会糊(上限 3 倍,避免超长图表撑爆)
      const scale = Math.min(3, Math.max(1, 1200 / viewBox[2]));
      el.setAttribute('width', String(Math.round(viewBox[2] * scale)));
      el.setAttribute('height', String(Math.round(viewBox[3] * scale)));
      // mermaid 会写 `max-width: XXXpx` 的内联样式,留着会把放大后的图又压回去
      el.setAttribute('style', 'max-width: none');
      normalized = new XMLSerializer().serializeToString(el);
    }
  } catch {
    /* 解析失败就用原始 SVG,大不了小一点 */
  }
  const encoded = window.btoa(unescape(encodeURIComponent(normalized)));
  return `data:image/svg+xml;base64,${encoded}`;
}

async function openMermaidViewer(svg: string) {
  try {
    const { bookmarkStore } = await import('@/store');
    bookmarkStore().refreshViewer(svgToDataUrl(svg), {
      toolbar: true,
    });
  } catch {
    /* 查看器不可用时保持静默：图本身已经在页面上，放大只是增强 */
  }
}

export interface RenderMermaidOptions {
  /** 页面内渲染带「放大查看」按钮；导出成静态文件时关掉 */
  interactive?: boolean;
  /**
   * 伴随模式：保留源码代码块，在它后面挂一张图，而不是把代码块换掉。
   * 富文本编辑器用这个 —— 用户要能改代码，同时又能立刻看到图。
   */
  companion?: boolean;
}

/**
 * 渲染单个图表容器。
 *
 * 竞态令牌记在 figure 自己身上,而不是外层容器:主题切换是按"页面上所有图"重渲染的,
 * 各组件的指令又按自己的容器渲染,两者会同时盯上同一批 DOM。按容器记 token 时,
 * 后发起的那轮会把先发起的整批作废,先前那批已经替换进 DOM 的 figure 就永远停在空壳状态
 * (实测:主题来回切几次后图会整片消失,只剩一个 26px 高的空框)。
 */
async function renderFigure(figure: HTMLElement, code: string, interactive: boolean): Promise<void> {
  const token = (figureRuns.get(figure) || 0) + 1;
  figureRuns.set(figure, token);
  figure.dataset.mermaidState = 'pending';

  const key = cacheKey(code);
  const cached = svgCache.get(key);
  if (cached) {
    fillWithSvg(figure, cached, interactive);
    return;
  }

  try {
    const mermaid = await loadMermaid();
    // id 必须全局唯一:mermaid 用它建临时容器,重名会互相顶掉
    const { svg } = await mermaid.render(`ln-mermaid-${++renderSeq}`, code);
    // 配色与根节点文字位置都在这里加工完,插进 DOM 的第一帧就是成品 ——
    // 不会先闪一下 mermaid 的藏蓝,也不会看到标题先偏在右边再跳到中间。
    // 缓存的也是这一份,放大、下载、预览重建同步复用时拿到的都是成品。
    const prepared = svg ? prepareSvg(svg) : svg;
    if (prepared) rememberSvg(key, prepared);
    if (figureRuns.get(figure) !== token) return;
    if (prepared) fillWithSvg(figure, prepared, interactive);
    else fillWithError(figure, code, null, interactive);
  } catch (error) {
    // mermaid 渲染失败会把临时容器(#d + 图表 id)留在 body 上,清掉免得越积越多
    document.querySelectorAll('body > [id^="dln-mermaid-"]').forEach((el) => el.remove());
    if (figureRuns.get(figure) !== token) return;
    fillWithError(figure, code, error, interactive);
  }
}

/**
 * 把容器内的 mermaid 代码块就地渲染成图。
 * 幂等：已渲染过的块不会重复处理；容器内没有 mermaid 时不会加载 mermaid。
 */
export async function renderMermaidBlocks(
  root: HTMLElement | null | undefined,
  options: RenderMermaidOptions = {},
): Promise<void> {
  if (!root || typeof document === 'undefined') return;
  const interactive = options.interactive !== false;
  if (options.companion) return renderMermaidCompanions(root, interactive);

  // inlineCachedMermaid 同步塞进来的图只有 SVG,工具条和根节点校正要在这里补上
  if (interactive) {
    root.querySelectorAll<HTMLElement>(`.${FIGURE_CLASS}[data-mermaid-state='ready']`).forEach((figure) => {
      const canvas = figure.querySelector<HTMLElement>(`.${FIGURE_CLASS}__canvas`);
      if (!canvas || figure.querySelector(`.${FIGURE_CLASS}__tools`)) return;
      centerMindmapRootLabels(canvas);
      figure.appendChild(buildFigureToolbar(() => canvas.innerHTML, figure.getAttribute(RENDERED_FLAG) || ''));
    });
  }

  // stale = 拿旧图顶着(源码已改),queued = 全新图表的占位。两种都要按自己的源码渲染出来,
  // 期间容器一直在,用户看不到源码摊开的中间态。
  root
    .querySelectorAll<HTMLElement>(
      `.${FIGURE_CLASS}[data-mermaid-state='stale'], .${FIGURE_CLASS}[data-mermaid-state='queued']`,
    )
    .forEach((figure) => {
      const code = figure.getAttribute(RENDERED_FLAG) || '';
      if (code) void renderFigure(figure, code, interactive);
    });

  const blocks = collectPendingBlocks(root);
  if (!blocks.length) return;

  const figures = blocks.map(({ pre, code }) => {
    const figure = buildFigure(code);
    figure.dataset.mermaidState = 'pending';
    pre.replaceWith(figure);
    return { figure, code };
  });

  // 顺序渲染:mermaid 的 render 会往 body 挂临时容器,并发跑容易互相干扰
  for (const { figure, code } of figures) {
    await renderFigure(figure, code, interactive);
  }
}

/**
 * 伴随模式(富文本编辑器专用)。
 *
 * 图挂在源码代码块后面,并带上 `data-mce-bogus="all"` —— TinyMCE 取内容时会把带这个标记的
 * 元素整个剔除,所以图纯粹是编辑期的装饰,**永远不会写进笔记内容**。
 * 这是这里不采用"把代码块换成图 + 保存前再换回去"的原因:那种往返转换一旦有 bug 就是内容损坏。
 */
async function renderMermaidCompanions(root: HTMLElement, interactive: boolean): Promise<void> {
  const blocks = collectPendingBlocks(root);

  // companion 被编辑器命令直接移除时，同步清掉源码上的编辑期标记。
  root.querySelectorAll<HTMLElement>(`.${MERMAID_COMPANION_SOURCE_CLASS}`).forEach((source) => {
    const next = source.nextElementSibling as HTMLElement | null;
    if (!next?.classList.contains(COMPANION_CLASS)) source.classList.remove(MERMAID_COMPANION_SOURCE_CLASS);
  });

  // 源码块已被删掉/改成别的语言的,把残留的图一并清掉
  root.querySelectorAll<HTMLElement>(`.${COMPANION_CLASS}`).forEach((companion) => {
    const previous = companion.previousElementSibling as HTMLElement | null;
    if (!previous || !blocks.some((block) => block.pre === previous)) {
      previous?.classList.remove(MERMAID_COMPANION_SOURCE_CLASS);
      companion.remove();
    }
  });

  const pending: { figure: HTMLElement; code: string }[] = [];
  for (const { pre, code } of blocks) {
    const next = pre.nextElementSibling as HTMLElement | null;
    const existing = next?.classList.contains(COMPANION_CLASS) ? next : null;
    pre.classList.add(MERMAID_COMPANION_SOURCE_CLASS);
    // 源码没变就不重渲染,否则编辑器每次 NodeChange 都会闪一下
    if (existing && existing.getAttribute(RENDERED_FLAG) === code && existing.dataset.mermaidState === 'ready') {
      continue;
    }

    const figure = existing || buildFigure(code);
    figure.classList.add(COMPANION_CLASS);
    figure.setAttribute(RENDERED_FLAG, code);
    figure.setAttribute('data-mce-bogus', 'all');
    figure.setAttribute('contenteditable', 'false');
    if (!existing) {
      appendFigurePlaceholder(figure);
      pre.after(figure);
    }
    pending.push({ figure, code });
  }

  for (const { figure, code } of pending) {
    await renderFigure(figure, code, interactive);
  }
}

/**
 * 主题切换后重渲染页面上所有已生成的图(颜色跟随深浅色)。
 * 就地重渲染,不把 figure 退回代码块 —— 退回再扫描会和各组件自己的渲染批次抢同一片 DOM。
 */
export function refreshMermaidTheme(): void {
  if (typeof document === 'undefined') return;
  const figures = Array.from(document.querySelectorAll<HTMLElement>(`.${FIGURE_CLASS}[${RENDERED_FLAG}]`));
  figures.forEach((figure) => {
    const code = figure.getAttribute(RENDERED_FLAG) || '';
    if (!code) return;
    // 放大按钮的有无跟随原来的渲染方式:页面上的图一定是交互式的
    void renderFigure(figure, code, true);
  });
}

let themeObserver: MutationObserver | null = null;
let observedTheme: string | null = null;

/** 监听 <html data-theme> 变化,主题切换时把已渲染的图换成对应配色 */
export function watchMermaidTheme(): void {
  if (typeof document === 'undefined' || themeObserver) return;
  observedTheme = currentTheme();
  themeObserver = new MutationObserver(() => {
    const theme = currentTheme();
    // applyDocumentTheme 每次都会 setAttribute,同值重复设置不该触发重渲染
    if (theme === observedTheme) return;
    observedTheme = theme;
    refreshMermaidTheme();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
