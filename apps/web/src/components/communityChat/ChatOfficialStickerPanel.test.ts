import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMMUNITY_CHAT_OFFICIAL_STICKERS,
  resolveCommunityChatOfficialSticker,
} from '@lightnote/shared/community-chat-stickers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
import expressionPanelSource from './ChatExpressionPanel.vue?raw';
import ChatOfficialStickerPanel from './ChatOfficialStickerPanel.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
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
  it('纸灵情绪包的键、地址和透明 PNG 资产一一对应', () => {
    const publicRoot = join(process.cwd(), 'public');
    const keys = new Set<string>();
    const paths = new Set<string>();

    expect(COMMUNITY_CHAT_OFFICIAL_STICKERS).toHaveLength(24);
    for (const sticker of COMMUNITY_CHAT_OFFICIAL_STICKERS) {
      expect(sticker.key).toBe(`paper-spirit-v3:${sticker.id}`);
      expect(sticker.key.length).toBeLessThanOrEqual(80);
      expect(sticker.assetPath).toBe(`/community-chat/stickers/paper-spirit-v3/${sticker.id.replaceAll('_', '-')}.png`);
      expect(resolveCommunityChatOfficialSticker(`paper-spirit-v2:${sticker.id}`)?.assetPath).toBe(
        `/community-chat/stickers/paper-spirit-v2/${sticker.id.replaceAll('_', '-')}.png`,
      );
      expect(keys.has(sticker.key)).toBe(false);
      expect(paths.has(sticker.assetPath)).toBe(false);
      keys.add(sticker.key);
      paths.add(sticker.assetPath);
      expect(zhCN.communityChat.sticker.officialItems[sticker.id]).toBeTruthy();
      expect(enUS.communityChat.sticker.officialItems[sticker.id]).toBeTruthy();

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

    expect(buttons).toHaveLength(24);
    expect(images).toHaveLength(24);
    for (const [index, sticker] of COMMUNITY_CHAT_OFFICIAL_STICKERS.entries()) {
      expect(images[index].getAttribute('src')).toBe(sticker.assetPath);
      expect(images[index].getAttribute('alt')).toBe(zhCN.communityChat.sticker.officialItems[sticker.id]);
      buttons[index].click();
      await nextTick();
      expect(onSelect).toHaveBeenNthCalledWith(index + 1, sticker.key);
    }
  });

  it('统一表情面板以已核验的图标路径提供纸灵标签', () => {
    expect(expressionPanelSource).toContain("tab === 'official'");
    expect(expressionPanelSource).toContain("emit('selectOfficialSticker', $event)");
    expect(expressionPanelSource).toContain('icon.coBuild.official');
    expect(expressionPanelSource).not.toContain('<svg');
  });

  it('无字贴图仍提供名称提示，选择后收起提示', async () => {
    vi.useFakeTimers();
    const { host, onSelect } = mountPanel();
    const choice = host.querySelector<HTMLElement>('.chat-official-sticker-panel__choice');
    choice?.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.advanceTimersByTimeAsync(250);
    await nextTick();
    const tooltip = document.body.querySelector<HTMLElement>('.b-tooltip-popup');
    expect(tooltip?.textContent).toBe(zhCN.communityChat.sticker.officialItems.laughing_tears);
    expect(tooltip?.style.display).not.toBe('none');
    choice?.querySelector('button')?.click();
    await nextTick();
    expect(onSelect).toHaveBeenCalledWith('paper-spirit-v3:laughing_tears');
    expect(tooltip?.style.display).toBe('none');
  });
});
