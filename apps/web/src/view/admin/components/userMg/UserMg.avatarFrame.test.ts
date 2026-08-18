import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) =>
  readFileSync(resolve(process.cwd(), `src/view/admin/components/userMg/${file}`), 'utf8');
const tableSource = readFileSync(
  resolve(process.cwd(), 'src/components/base/BasicComponents/BTable/BTable.vue'),
  'utf8',
);
const tableConfigSource = readFileSync(
  resolve(process.cwd(), 'src/components/base/BasicComponents/BTable/config.ts'),
  'utf8',
);

describe('后台用户管理头像框展示', () => {
  it('桌面列表和移动列表都按真实佩戴框复用统一预览组件', () => {
    for (const file of ['UserMg.vue', 'UserMgMobile.vue']) {
      const content = source(file);
      expect(content).toContain("import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue'");
      expect(content).toContain('frameVariant(record.equippedFrame)');
      expect(content).toContain(':frame-id="record.equippedFrame"');
      expect(content).toContain('layout-mode="slot"');
      expect(content).toContain('pause-when-offscreen');
    }

    expect(source('UserMg.vue')).toContain(':row-height="48"');
    for (const file of ['UserMg.vue', 'UserMgMobile.vue']) {
      const content = source(file);
      expect(content).toContain("'is-framed': frameVariant(record.equippedFrame)");
      expect(content).toContain(':size="30"');
      expect(content).toMatch(/(?:<svg-icon|<SvgIcon) v-else[^>]+(?:size|:size)="36"/u);
      expect(content).toMatch(/:not\(\.is-framed\)[\s\S]*overflow:\s*hidden/u);
      expect(content).toMatch(/:not\(\.is-framed\)[\s\S]*object-fit:\s*cover/u);
    }
  });

  it('用户详情优先展示详情接口返回的佩戴框，并对未知框回退普通头像', () => {
    const content = source('User360Modal.vue');
    expect(content).toContain('detail.value?.growth?.equippedFrame || props.userInfo?.equippedFrame');
    expect(content).toContain('return frameVariant(frameId) ? frameId : null');
    expect(content).toContain('v-if="equippedFrameId"');
    expect(content).toContain('layout-mode="slot"');
  });

  it('普通头像缩到与 30px 头像框的约 36px 总外径一致，同时保留 44px 装饰安全槽', () => {
    const desktop = source('UserMg.vue');
    const mobile = source('UserMgMobile.vue');

    expect(desktop).toMatch(
      /\.usermg-avatar\s*\{[\s\S]*?width:\s*36px;[\s\S]*?height:\s*36px;[\s\S]*?flex:\s*0 0 36px;[\s\S]*?box-sizing:\s*border-box;/u,
    );
    expect(mobile).toMatch(
      /\.mobile-user-avatar\s*\{[\s\S]*?width:\s*36px;[\s\S]*?height:\s*36px;[\s\S]*?flex:\s*0 0 36px;[\s\S]*?box-sizing:\s*border-box;/u,
    );
    expect(mobile).toMatch(/\.mobile-list-row__leading\)[\s\S]*?width:\s*44px;[\s\S]*?flex-basis:\s*44px;/u);
  });

  it('只为桌面头像列放开单元格裁剪，让头像框特效完整绘制', () => {
    expect(source('UserMg.vue')).toMatch(/key:\s*'headPicture',[\s\S]*?overflowVisible:\s*true/u);
    expect(tableConfigSource).toContain('overflowVisible?: boolean');
    expect(tableSource).toContain("'table-cell--overflow-visible': col.overflowVisible");
    expect(tableSource).toMatch(/\.table-cell\.table-cell--overflow-visible\s*\{\s*overflow:\s*visible;/u);
  });
});
