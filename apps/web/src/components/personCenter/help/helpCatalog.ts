export type HelpArticle = {
  id: string | number;
  title: string;
  content: string;
  helpSection?: string | null;
};

export type HelpSectionGroup = {
  id: string;
  name: string;
  items: HelpArticle[];
};

export function normalizeHelpSection(value: unknown, fallback: string): string {
  return (
    String(value || '')
      .trim()
      .replace(/\s+/gu, ' ') || fallback
  );
}

/**
 * 服务端顺序就是知识库维护顺序；Map 首次出现顺序同时成为栏目顺序。
 * 新栏目随第一篇文章出现，最后一篇文章下线后栏目自然消失。
 */
export function groupHelpArticles(articles: HelpArticle[], fallback: string): HelpSectionGroup[] {
  const groups = new Map<string, HelpArticle[]>();
  for (const article of articles) {
    const section = normalizeHelpSection(article.helpSection, fallback);
    const items = groups.get(section);
    if (items) items.push(article);
    else groups.set(section, [article]);
  }
  return [...groups.entries()].map(([name, items]) => ({ id: name, name, items }));
}
