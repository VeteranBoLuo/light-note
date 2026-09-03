import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const alertSource = readFileSync(
  resolve(process.cwd(), 'src/components/base/BasicComponents/BModal/BAlert.vue'),
  'utf8',
);
const alertApiSource = readFileSync(
  resolve(process.cwd(), 'src/components/base/BasicComponents/BModal/Alert.ts'),
  'utf8',
);
const inboxSource = readFileSync(resolve(process.cwd(), 'src/view/inbox/Inbox.vue'), 'utf8');

describe('BAlert 多操作布局', () => {
  it('确认弹框由遮罩层在可视区域中真正居中', () => {
    expect(alertSource).toMatch(
      /\.bAlert-bg\s*\{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;/,
    );
    expect(alertSource).not.toMatch(/\.bAlert\s*\{[\s\S]*?top:\s*30%/);
    expect(alertSource).not.toContain('top: 45%;');
  });

  it('桌面和移动确认框都安全渲染分层正文，并强化标题与固定重点', () => {
    expect(alertSource.match(/v-html="safeContent"/g)).toHaveLength(2);
    expect(alertSource).toMatch(/\.bAlert-title\s*\{[\s\S]*?font-weight:\s*600/);
    expect(alertSource).toContain('.b-alert-rich-content__lead strong');
    expect(alertSource).toContain('.b-alert-rich-content__list-title');
  });

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

  it('移动端清除桌面弹框最小高度并按内容自适应', () => {
    expect(alertSource).toMatch(/\.bAlert\.bAlert--mobile\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?height:\s*auto;/);
  });

  it('移动端操作单元清除 BButton 默认底色和圆角，危险确认使用危险语义', () => {
    expect(alertSource).toContain(':type="okType"');
    expect(alertSource).toMatch(
      /\.bAlert--mobile \.btn\s*\{[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*transparent;/,
    );
    expect(alertSource).toMatch(/\.bAlert--mobile \.btn:hover\s*\{[\s\S]*?background:\s*transparent;/);
    expect(alertApiSource).toContain('okType?:');
    expect(alertApiSource).toContain('{ title, okText, okType, cancelText, content, onOk, footer }');
    expect(alertApiSource).toContain('{ title, okText, okType, cancelText, content, footer }');
    expect(inboxSource.match(/okType:\s*'danger'/g)).toHaveLength(2);
  });
});
