import { expect, it } from 'vitest';
import { parseToolboxAuditSections } from './toolboxAuditSections';
it('keeps evidence, lists and nested headings, without treating code headings as sections', () => {
  const result = parseToolboxAuditSections(
    '# Report\n\n## Conflicts\nSource A says yes; B says no.\n\n```md\n## Code example\n```\n\n### Evidence\n- First\n- Second\n\n## Actions\nCheck the current version.',
  );
  expect(result).toHaveLength(2);
  expect(result[0]?.content).toContain('## Code example');
  expect(result[0]?.content).toContain('### Evidence');
  expect(result[1]?.title).toBe('Actions');
  expect(parseToolboxAuditSections('A legacy report without sections.')).toEqual([]);
});
