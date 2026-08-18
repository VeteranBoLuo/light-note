import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMUNITY_CHAT_OFFICIAL_STICKERS } from '@lightnote/shared/community-chat-stickers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import expressionPanelSource from './ChatExpressionPanel.vue?raw';
import ChatOfficialStickerPanel from './ChatOfficialStickerPanel.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountPanel(onSelect = vi.fn()) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ChatOfficialStickerPanel, { onSelect });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
      missingWarn: false,
      fallbackWarn: false,
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onSelect };
}

describe('ChatOfficialStickerPanel', () => {
  it('纸灵首发包的键、地址和透明 PNG 资产一一对应', () => {
    const publicRoot = join(process.cwd(), 'public');
    const keys = new Set<string>();
    const paths = new Set<string>();

    expect(COMMUNITY_CHAT_OFFICIAL_STICKERS).toHaveLength(16);
    for (const sticker of COMMUNITY_CHAT_OFFICIAL_STICKERS) {
      expect(sticker.key).toBe(`paper-spirit-v1:${sticker.id}`);
      expect(sticker.key.length).toBeLessThanOrEqual(80);
      expect(sticker.assetPath).toBe(`/community-chat/stickers/paper-spirit-v1/${sticker.id.replaceAll('_', '-')}.png`);
      expect(keys.has(sticker.key)).toBe(false);
      expect(paths.has(sticker.assetPath)).toBe(false);
      keys.add(sticker.key);
      paths.add(sticker.assetPath);

      const data = readFileSync(join(publicRoot, sticker.assetPath.replace(/^\//, '')));
      expect(data.subarray(1, 4).toString()).toBe('PNG');
      expect(data.readUInt32BE(16)).toBe(512);
      expect(data.readUInt32BE(20)).toBe(512);
      expect(data[25]).toBe(6);
    }
  });

  it('展示完整官方表情并按固定键发送选择事件', async () => {
    const { host, onSelect } = mountPanel();
    const buttons = host.querySelectorAll<HTMLButtonElement>('.chat-official-sticker-panel__item');
    const images = host.querySelectorAll<HTMLImageElement>('.chat-official-sticker-panel__item img');

    expect(buttons).toHaveLength(16);
    expect(images).toHaveLength(16);
    expect(images[0].getAttribute('src')).toBe(COMMUNITY_CHAT_OFFICIAL_STICKERS[0].assetPath);
    buttons[0].click();
    await nextTick();
    expect(onSelect).toHaveBeenCalledWith(COMMUNITY_CHAT_OFFICIAL_STICKERS[0].key);
  });

  it('统一表情面板以已核验的图标路径提供纸灵标签', () => {
    expect(expressionPanelSource).toContain("tab === 'official'");
    expect(expressionPanelSource).toContain("emit('selectOfficialSticker', $event)");
    expect(expressionPanelSource).toContain('icon.coBuild.official');
    expect(expressionPanelSource).not.toContain('<svg');
  });
});
