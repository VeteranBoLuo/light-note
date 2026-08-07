import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const alertSource = readFileSync(
  resolve(process.cwd(), 'src/components/base/BasicComponents/BModal/BAlert.vue'),
  'utf8',
);

describe('BAlert 多操作布局', () => {
  it('桌面端三个以上操作自动使用宽版弹窗，并允许按钮组换行', () => {
    expect(alertSource).toContain("'bAlert--multi-action': footer.length > 2");
    expect(alertSource).toContain(':wrap="footer.length > 2"');
    expect(alertSource).toMatch(/\.bAlert--multi-action\s*\{[\s\S]*?width:\s*min\(680px, calc\(100vw - 40px\)\)/);
    expect(alertSource).toMatch(/\.bAlert-footer :deep\(\.space-body\)\s*\{[\s\S]*?max-width:\s*100%/);
  });

  it('移动端三个以上操作切为整宽纵向按钮，文案保持单行并区分主操作', () => {
    expect(alertSource).toContain("'bAlert--stacked-actions': footer.length > 2");
    expect(alertSource).toContain("'is-primary': btn.type === 'primary' || btn.type === 'function'");
    expect(alertSource).toContain('<BButton');
    expect(alertSource).not.toMatch(/<div\s+v-for="btn in footer"/);
    expect(alertSource).toMatch(
      /\.bAlert--mobile\.bAlert--stacked-actions \.bAlert-m-footer\s*\{[\s\S]*?flex-direction:\s*column/,
    );
    expect(alertSource).toMatch(
      /\.bAlert--mobile\.bAlert--stacked-actions \.btn\s*\{[\s\S]*?width:\s*100%[\s\S]*?white-space:\s*nowrap/,
    );
  });
});
