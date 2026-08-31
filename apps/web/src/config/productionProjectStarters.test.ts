import { describe, expect, it } from 'vitest';
import { validateProductionProjectContent } from '@lightnote/shared/production-project-protocol';
import {
  PRODUCTION_PROJECT_STARTERS,
  productionProjectStarterById,
  productionProjectStarterCopy,
  productionProjectStartersFor,
} from './productionProjectStarters';

describe('productionProjectStarters', () => {
  it('keeps template ids unique and every starter valid for its own project type', () => {
    expect(new Set(PRODUCTION_PROJECT_STARTERS.map((starter) => starter.id)).size).toBe(
      PRODUCTION_PROJECT_STARTERS.length,
    );
    for (const starter of PRODUCTION_PROJECT_STARTERS) {
      expect(validateProductionProjectContent(starter.createContent('zh-CN'), starter.projectType)).toBe(true);
      expect(validateProductionProjectContent(starter.createContent('en-US'), starter.projectType)).toBe(true);
    }
  });

  it('ships substantial P0 templates without creating separate editor types', () => {
    expect(productionProjectStartersFor('document')).toHaveLength(4);
    expect(productionProjectStartersFor('presentation')).toHaveLength(3);
    expect(productionProjectStartersFor('workbook')).toHaveLength(4);
    expect(productionProjectStarterById('document-report')?.projectType).toBe('document');
  });

  it('localizes starter copy and content', () => {
    const starter = productionProjectStarterById('workbook-budget');
    expect(starter).not.toBeNull();
    expect(productionProjectStarterCopy(starter!, 'zh-CN').title).toBe('预算规划');
    expect(productionProjectStarterCopy(starter!, 'en-US').title).toBe('Budget planner');
    expect(JSON.stringify(starter!.createContent('zh-CN'))).toContain('类别');
    expect(JSON.stringify(starter!.createContent('en-US'))).toContain('Category');
  });
});
