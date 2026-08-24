import type { TodoChecklistItem } from '@/api/todoApi';
import { generateUUID } from '@/utils/common';

export function mergeTodoBreakdownChecklist(
  current: readonly TodoChecklistItem[],
  values: readonly unknown[],
): TodoChecklistItem[] {
  const existing = new Map(
    current.filter((item) => item.text.trim()).map((item) => [item.text.trim().toLocaleLowerCase(), item] as const),
  );
  const seen = new Set<string>();
  const result: TodoChecklistItem[] = [];
  for (const value of values) {
    const text = String(
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as { text?: unknown }).text || ''
        : value || '',
    )
      .trim()
      .slice(0, 200);
    const key = text.toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const matched = existing.get(key);
    result.push(matched ? { ...matched, text } : { id: generateUUID(), text, done: false });
    if (result.length >= 50) break;
  }
  return result;
}
