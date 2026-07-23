/**
 * 笔记内联提及（N0）· 前端站内资源引用工具。
 *
 * canonical 协议（构造 / 解析 / id 校验 / 测试向量）的唯一事实源是 @lightnote/shared，
 * 前后端共享同一实现与向量，从根本上杜绝 URL 协议漂移。本文件只 re-export 该协议，
 * 并补充**依赖 DOM** 的前端能力：Markdown→HTML 渲染后对站内链接的装饰、从 HTML 收集引用。
 */
import {
  parseResourceHref,
  buildResourceHref,
  buildResourceAnchorAttrs,
  dedupeResourceRefs,
  normalizeNoteType,
  RESOURCE_REF_TYPES,
  RESOURCE_REF_TEST_VECTORS,
  type ResourceRef,
  type ResourceRefType,
} from '@lightnote/shared';

// 单一实现仍在 shared；就近 re-export 便于前端与 N1 引用。
export {
  parseResourceHref,
  buildResourceHref,
  buildResourceAnchorAttrs,
  dedupeResourceRefs,
  normalizeNoteType,
  RESOURCE_REF_TYPES,
  RESOURCE_REF_TEST_VECTORS,
};
export type { ResourceRef, ResourceRefType };

/** N1 阅读态服务端返回的权威状态；title 为 null 时不能猜测资源仍存在。 */
export interface ResolvedResourceRefState extends ResourceRef {
  title: string | null;
  available: boolean;
}

export interface ResourceReferencePresentationOptions {
  /** 失效引用的可见文案由页面 i18n 注入，默认值仅供纯工具测试/降级使用。 */
  unavailableLabel?: (snapshotTitle: string) => string;
  /** 资源链接在不同解析状态下的悬浮说明；编辑器序列化时会去除，不进入正文。 */
  linkTitle?: (displayTitle: string, state: 'pending' | 'available' | 'unavailable') => string;
  /** TinyMCE 活 DOM 以不可编辑的原子 chip 呈现，避免后续输入继续落进链接内。 */
  liveEditor?: boolean;
}

export const resourceRefKey = (ref: Pick<ResourceRef, 'type' | 'id'>) => `${ref.type}:${ref.id}`;

function resourceStateMap(states: readonly ResolvedResourceRefState[] = []) {
  const map = new Map<string, ResolvedResourceRefState>();
  for (const state of states) {
    const href = buildResourceHref(state);
    const ref = href ? parseResourceHref(href) : null;
    if (!ref) continue;
    map.set(resourceRefKey(ref), {
      type: ref.type,
      id: ref.id,
      title: typeof state.title === 'string' ? state.title : null,
      available: state.available === true,
    });
  }
  return map;
}

function getSnapshotTitle(anchor: HTMLAnchorElement, previousDisplay = '') {
  const currentText = String(anchor.textContent || '').trim();
  const storedSnapshot = String(anchor.getAttribute('data-ln-resource-snapshot-title') || '').trim();
  // live editor 中用户可能手动改过链接文字：此时当前文字已不等于上一次展示名，
  // 应把它当成新的正文快照，不能在下一次 resolve 时静默覆盖。
  if (previousDisplay && currentText && currentText !== previousDisplay) return currentText;
  return storedSnapshot || currentText;
}

function displayTitle(
  snapshotTitle: string,
  state: ResolvedResourceRefState | undefined,
  unavailableLabel: (snapshot: string) => string,
) {
  if (!state) return snapshotTitle;
  if (state.available && state.title?.trim()) return state.title.trim();
  return unavailableLabel(snapshotTitle);
}

/**
 * 修复早期版本因 TinyMCE schema 遗漏 href 而写入的半成品引用。
 * 只接受同时带有受控 type / id 数据属性、且能通过共享协议重新构造的链接，
 * 不会把任意普通 <a> 或外部链接改写为站内引用。
 */
export function repairResourceReferenceHrefs(root: ParentNode): boolean {
  let changed = false;
  root.querySelectorAll<HTMLAnchorElement>('a').forEach((anchor) => {
    if (anchor.getAttribute('href')) return;
    const type = anchor.getAttribute('data-ln-resource-type') as ResourceRefType | null;
    const id = String(anchor.getAttribute('data-ln-resource-id') || '');
    const href = buildResourceHref({ type: type as ResourceRefType, id });
    if (!href) return;
    anchor.setAttribute('href', href);
    changed = true;
  });
  return changed;
}

/**
 * 将 canonical 站内链接渲染成视觉 chip。只在渲染层/编辑器活 DOM 使用，
 * 绝不直接写回 note.content；持久化前应配合 serializeResourceReferenceSnapshots() 还原正文快照。
 */
export function applyResourceReferenceChipPresentation(
  root: ParentNode,
  states: readonly ResolvedResourceRefState[] = [],
  options: ResourceReferencePresentationOptions = {},
): boolean {
  const map = resourceStateMap(states);
  const unavailableLabel = options.unavailableLabel || ((snapshotTitle: string) => `已失效引用 · ${snapshotTitle}`);
  let changed = repairResourceReferenceHrefs(root);
  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    const ref = parseResourceHref(anchor.getAttribute('href'));
    if (!ref) return;
    const previousDisplay = String(anchor.getAttribute('data-ln-resource-display-title') || '');
    const snapshotTitle = getSnapshotTitle(anchor, previousDisplay) || ref.id;
    const state = map.get(resourceRefKey(ref));
    const label = displayTitle(snapshotTitle, state, unavailableLabel);
    const attrs = buildResourceAnchorAttrs(ref);
    anchor.setAttribute('data-ln-resource-type', attrs['data-ln-resource-type']);
    anchor.setAttribute('data-ln-resource-id', attrs['data-ln-resource-id']);
    anchor.setAttribute('data-ln-resource-snapshot-title', snapshotTitle);
    anchor.classList.add('ln-resource-link');
    if (options.liveEditor) anchor.setAttribute('contenteditable', 'false');

    const linkState = !state ? 'pending' : state.available ? 'available' : 'unavailable';
    const linkTitle = options.linkTitle?.(label, linkState);
    if (linkTitle) anchor.setAttribute('title', linkTitle);
    else if (!options.liveEditor) anchor.setAttribute('title', label);
    else anchor.removeAttribute('title');

    if (!state) {
      anchor.removeAttribute('data-ln-resource-state');
      anchor.removeAttribute('data-ln-resource-display-title');
      anchor.removeAttribute('aria-disabled');
      changed = true;
      return;
    }

    anchor.setAttribute('data-ln-resource-state', state.available ? 'available' : 'unavailable');
    anchor.setAttribute('data-ln-resource-display-title', label);
    if (state.available) {
      anchor.removeAttribute('aria-disabled');
    } else {
      anchor.setAttribute('aria-disabled', 'true');
    }
    // 保留手工嵌套样式的 anchor，避免展示层扁平化它的 HTML；@ 插入与 Markdown 渲染的链接均为纯文本，
    // 可安全替换为实时名称。title/contenteditable 均在序列化时去除，不会污染正文快照。
    if (anchor.childElementCount === 0 && String(anchor.textContent || '') !== label) {
      anchor.textContent = label;
    }
    changed = true;
  });
  return changed;
}

/**
 * 对 HTML 字符串生成阅读态 chip。用于 Markdown 预览等不参与正文保存的渲染结果。
 * 没有可识别站内链接时保留原串，避免无关正文发生 DOM 序列化。
 */
export function presentResourceReferenceChips(
  html: string,
  states: readonly ResolvedResourceRefState[] = [],
  options: ResourceReferencePresentationOptions = {},
): string {
  if (typeof html !== 'string' || !html || typeof DOMParser === 'undefined') return html || '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  repairResourceReferenceHrefs(doc.body);
  const hasCanonical = Array.from(doc.body.querySelectorAll('a[href]')).some((anchor) =>
    Boolean(parseResourceHref(anchor.getAttribute('href'))),
  );
  if (!hasCanonical) return html;
  applyResourceReferenceChipPresentation(doc.body, states, options);
  return doc.body.innerHTML;
}

/**
 * TinyMCE v-model 在读取内容时调用：把仅用于活 DOM 展示的属性去掉，并恢复正文快照标题。
 * 若用户显式编辑了 chip 文字（已不等于 display title），保留其手工文字而不是强行回滚快照。
 */
export function serializeResourceReferenceSnapshots(html: string): string {
  if (typeof html !== 'string' || !html || typeof DOMParser === 'undefined') return html || '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  let changed = repairResourceReferenceHrefs(doc.body);
  doc.body.querySelectorAll('a[href]').forEach((anchor) => {
    if (!parseResourceHref(anchor.getAttribute('href'))) return;
    const displayTitle = String(anchor.getAttribute('data-ln-resource-display-title') || '');
    const snapshotTitle = String(anchor.getAttribute('data-ln-resource-snapshot-title') || '');
    if (displayTitle && snapshotTitle && anchor.childElementCount === 0 && String(anchor.textContent || '') === displayTitle) {
      anchor.textContent = snapshotTitle;
    }
    anchor.classList.remove('ln-resource-link');
    if (!anchor.classList.length) anchor.removeAttribute('class');
    anchor.removeAttribute('data-ln-resource-snapshot-title');
    anchor.removeAttribute('data-ln-resource-display-title');
    anchor.removeAttribute('data-ln-resource-state');
    anchor.removeAttribute('aria-disabled');
    anchor.removeAttribute('contenteditable');
    anchor.removeAttribute('title');
    // 这里只会清理由展示层补充的属性；静态预览从不参与本函数。
    changed = true;
  });
  return changed ? doc.body.innerHTML : html;
}

/**
 * 前端专用（依赖 DOMParser）：把一段 HTML 里能被 canonical 协议解析的站内链接补上 data-ln-resource-* 增强属性。
 * 用于编辑器 Markdown → HTML 的后处理，只装饰站内链接，普通外链原样保留（不变 chip）。
 * 关键：仅当确实装饰了至少一个链接才回传序列化结果，否则原样返回入参，
 *   避免对绝大多数「无站内链接」的正文做无谓 DOM 序列化而悄悄改写内容。
 */
export function decorateInternalResourceLinks(html: string): string {
  if (typeof html !== 'string' || !html) return html || '';
  if (typeof DOMParser === 'undefined') return html; // 无 DOM 环境（理论上前端不会发生）原样返回
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  let changed = repairResourceReferenceHrefs(doc.body);
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const ref = parseResourceHref(a.getAttribute('href'));
    if (!ref) return;
    const attrs = buildResourceAnchorAttrs(ref);
    a.setAttribute('data-ln-resource-type', attrs['data-ln-resource-type']);
    a.setAttribute('data-ln-resource-id', attrs['data-ln-resource-id']);
    changed = true;
  });
  return changed ? doc.body.innerHTML : html;
}

/**
 * 前端专用（依赖 DOMParser）：从一段 HTML 收集去重、保序的站内引用集合。
 * 供往返一致性测试与 N1 阅读渲染复用；外链 / 非法路径被忽略。
 */
export function collectResourceRefsFromHtml(html: string): ResourceRef[] {
  if (typeof html !== 'string' || !html) return [];
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  repairResourceReferenceHrefs(doc.body);
  const hrefs: string[] = [];
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href');
    if (h) hrefs.push(h);
  });
  return dedupeResourceRefs(hrefs);
}
