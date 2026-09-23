import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import less from 'less';
import { densityCssVariables } from './uiDensity';
import { auditDensityTokens } from '../../scripts/density-token-audit.mjs';

const helpers = readFileSync(resolve(process.cwd(), 'src/assets/css/ui-density.less'), 'utf8');
describe('density Less helpers', () => {
  it('emits no CSS until called', async () => {
    expect((await less.render(helpers)).css.trim()).toBe('');
  });
  it('compiles every catalog dimension to the same variable and exact standard fallback', async () => {
    const standard = densityCssVariables('standard');
    const declarations = Object.entries(standard).flatMap(([name, value]) => {
      const match = name.match(/^--ui-(space|control|layout|font|card)-/);
      return match ? [`${name}: .ui-${match[1]}(${value})[];`] : [];
    });
    const { css } = await less.render(`${helpers}\n.test { ${declarations.join('\n')} }`);
    expect(auditDensityTokens(css, standard)).toEqual([]);
    for (const [name, value] of Object.entries(standard)) {
      if (name.startsWith('--ui-')) expect(css).toContain(`${name}: var(${name}, ${value});`);
    }
  });
  it('works in shorthand, calc, scoped-style selectors and media rules', async () => {
    const source =
      '.a[data-v-test] { padding: .ui-space(8px)[] .ui-space(12px)[]; width: calc(100% - .ui-layout(60px)[]); } @media (min-width: 1200px) {.a{height:.ui-control(32px)[];}}';
    const { css } = await less.render(helpers + source);
    expect(css).toContain('padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px)');
    expect(css).toContain('calc(100% - var(--ui-layout-60, 60px))');
    expect(css).toContain('height: var(--ui-control-32, 32px)');
    expect(auditDensityTokens(source, densityCssVariables('standard'))).toEqual([]);
  });
  it('rejects invalid units and audits unknown or dynamic dimensions', async () => {
    await expect(less.render(helpers + '.a{width:.ui-layout(2rem)[];}')).rejects.toBeDefined();
    const standard = densityCssVariables('standard');
    for (const value of ['999999px', '@width', '60', '2rem']) {
      expect(auditDensityTokens(`.a{width:.ui-layout(${value})[];}`, standard)).toHaveLength(1);
    }
  });
});
