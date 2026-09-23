import { describe, expect, it } from 'vitest';
import { addedFixedDimensions, fixedDensityDeclarations } from '../../scripts/density-raw-audit.mjs';
describe('new fixed density dimensions', () => {
  it('ignores unchanged legacy debt, but catches added copies and changed dimensions', () => {
    const old = '.a{width:60px;}';
    expect(addedFixedDimensions(old, '\n' + old)).toEqual([]);
    expect(addedFixedDimensions(old, old + '.b{width:60px;}')).toHaveLength(1);
    expect(addedFixedDimensions(old, '.a{width:61px;}')).toHaveLength(1);
  });
  it('catches logical dimensions and the last declaration without a semicolon', () => {
    expect(fixedDensityDeclarations('.a{inline-size:60px;block-size:40px}')).toHaveLength(2);
  });
  it('accepts density variables/helpers but catches mixed fixed values', () => {
    expect(
      fixedDensityDeclarations(
        '.a{width:var(--ui-layout-60, 60px);gap:.ui-space(8px)[];margin:0;border:1px solid red;}',
      ),
    ).toEqual([]);
    expect(fixedDensityDeclarations('.a{padding:var(--ui-space-8, 8px) 12px;}')).toHaveLength(1);
    expect(fixedDensityDeclarations('.a{width:calc(100% - 20px);}')).toHaveLength(1);
  });
  it('reviews component variable overrides for spacing and positioned controls', () => {
    const source = '.panel{--ai-skill-panel-padding:13px;--ai-skill-action-padding:4px;--ai-skill-chat-composer-action-right:8px;--panel-padding-inline:12px;--panel-inset-block-start:6px;}';
    expect(addedFixedDimensions('', source).map((item) => item.property)).toEqual([
      '--ai-skill-panel-padding', '--ai-skill-action-padding', '--ai-skill-chat-composer-action-right',
      '--panel-padding-inline', '--panel-inset-block-start',
    ]);
    expect(addedFixedDimensions(source, source)).toEqual([]);
    expect(addedFixedDimensions(source, source.replace('--ai-skill-action-padding:4px', '--ai-skill-action-padding:5px'))).toMatchObject([
      {property: '--ai-skill-action-padding', value: '5px'},
    ]);
  });
  it('accepts density-aware custom properties and explicitly fixed geometry', () => {
    expect(addedFixedDimensions('', `.panel{
      --ai-skill-action-padding:var(--ui-space-4, 4px) var(--ui-space-8, 8px);
      --panel-padding-inline:.ui-space(12px)[];
      --ai-skill-chat-composer-action-right:var(--ui-space-8, 8px);
      /* ui-density-fixed: document bounds, not interface density */
      --document-margin:24px;
      --panel-shadow:0 1px 4px #000;
      --panel-border:1px solid #fff;
      --panel-radius:8px;
    }`)).toEqual([]);
    expect(fixedDensityDeclarations('.panel{--ai-skill-action-padding:var(--ui-space-4, 4px) 8px;}')).toHaveLength(1);
  });
  it('requires a local reason and does not let one exception cover later declarations', () => {
    const source = '.a{ /* ui-density-fixed: document canvas geometry */ width:600px; height:400px;}';
    expect(addedFixedDimensions('', source)).toMatchObject([{ property: 'height' }]);
    expect(addedFixedDimensions('', '.a{/* ui-density-fixed: */ width:600px;}')).toHaveLength(1);
  });
  it('keeps mobile rules reviewable and ignores scripts, comments and media breakpoints', () => {
    const source =
      '<script>const size="width:60px;"</script>\n<style>/* width:70px; */\n@media(max-width:768px){.a{width:80px;}}</style>';
    expect(fixedDensityDeclarations(source, true)).toMatchObject([{ line: 3, property: 'width', value: '80px' }]);
  });
});
