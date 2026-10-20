const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6';

function decodeFragment(fragment: string) {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

function headingSlug(heading: HTMLElement) {
  return (heading.textContent || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Resolve within this note only; generated heading slugs never rewrite saved content. */
export function findNoteAnchorTarget(root: HTMLElement, href: string): HTMLElement | null {
  if (!href.startsWith('#')) return null;
  const raw = href.slice(1);
  const fragment = decodeFragment(raw);
  if (!fragment) return root;

  // Avoid selector interpolation: authored ids/names may contain CSS punctuation or malformed escapes.
  const authored = Array.from(root.querySelectorAll<HTMLElement>('[id],a[name]'));
  for (const candidate of new Set([fragment, raw])) {
    const target = authored.find((element) => element.id === candidate || element.getAttribute('name') === candidate);
    if (target) return target;
  }

  // Markdown headings have no persisted id. Match the usual lowercase, punctuation-free slug,
  // including ordered suffixes for repeated headings and collisions with an existing suffix.
  const used = new Set<string>();
  for (const heading of root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)) {
    const base = headingSlug(heading);
    let slug = base;
    let suffix = 0;
    while (used.has(slug)) slug = `${base}-${++suffix}`;
    used.add(slug);
    if (slug === fragment) return heading;
  }
  return null;
}

/** Consume local fragments even when missing, so note navigation cannot change router/share state. */
export function handleNoteAnchorActivation(
  event: Event,
  root: HTMLElement | null,
  navigate: (target: HTMLElement) => void,
): boolean {
  if (!root || event.defaultPrevented) return false;
  if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Enter') return false;
  const target = event.target;
  const link = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!link || !root.contains(link)) return false;
  const href = (link.getAttribute('href') || '').trim();
  if (!href.startsWith('#')) return false;
  event.preventDefault();
  event.stopPropagation();
  const destination = findNoteAnchorTarget(root, href);
  if (destination) navigate(destination);
  return true;
}
