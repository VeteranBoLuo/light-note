import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(resolve(process.cwd(), `src/view/admin/components/userMg/${file}`), 'utf8');

describe('后台用户管理头像框展示', () => {
  it('桌面列表和移动列表都按真实佩戴框复用统一预览组件', () => {
    for (const file of ['UserMg.vue', 'UserMgMobile.vue']) {
      const content = source(file);
      expect(content).toContain("import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue'");
      expect(content).toContain('frameVariant(record.equippedFrame)');
      expect(content).toContain(':frame-id="record.equippedFrame"');
      expect(content).toContain('pause-when-offscreen');
    }

    expect(source('UserMg.vue')).toContain(':row-height="48"');
    expect(source('UserMgMobile.vue')).toContain('overflow: visible');
  });

  it('用户详情优先展示详情接口返回的佩戴框，并对未知框回退普通头像', () => {
    const content = source('User360Modal.vue');
    expect(content).toContain('detail.value?.growth?.equippedFrame || props.userInfo?.equippedFrame');
    expect(content).toContain('return frameVariant(frameId) ? frameId : null');
    expect(content).toContain('v-if="equippedFrameId"');
  });
});
