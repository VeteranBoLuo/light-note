import crypto from 'node:crypto';
import { splitKnowledgeContent } from './knowledgeText.js';

export function cleanText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function chunkResource({
  userId,
  resourceType,
  resourceId,
  version,
  title,
  content,
  contentType,
  target,
  coverage,
  tagNames = [],
  maxChunks = Infinity,
}) {
  const chunks = splitKnowledgeContent(content, contentType);
  const fallback = chunks.length ? '' : cleanText(content);
  const usable = chunks.length ? chunks : fallback ? [{ heading: '', content: fallback }] : [];
  const tags = [...new Set(tagNames.map((name) => cleanText(name)).filter(Boolean))].join(' ').slice(0, 1000);
  return usable.slice(0, maxChunks).map((chunk, index) => {
    const normalized = cleanText(chunk.content).slice(0, 4000);
    const contentHash = crypto.createHash('sha256').update(normalized).digest('hex');
    return {
      id: `${resourceType}:${resourceId}:${version}:${index}`,
      userId,
      resourceType,
      resourceId: String(resourceId),
      resourceVersion: String(version || 'unknown'),
      chunkIndex: index,
      title: String(title || '').slice(0, 255),
      sectionTitle: String(chunk.heading || '').slice(0, 255),
      tags,
      content: normalized,
      contentHash,
      locator: { type: chunk.heading ? 'section' : 'paragraph', value: chunk.heading || `chunk:${index + 1}` },
      target,
      coverage: coverage || null,
    };
  });
}
