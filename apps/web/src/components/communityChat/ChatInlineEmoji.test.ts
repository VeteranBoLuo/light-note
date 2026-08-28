import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMUNITY_CHAT_INLINE_EMOJIS } from '@lightnote/shared/community-chat-inline-emojis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import ChatComposerInput from './ChatComposerInput.vue';
import ChatEmojiPanel from './ChatEmojiPanel.vue';
import ChatInlineEmojiText from './ChatInlineEmojiText.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function i18n() {
  return createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: { 'zh-CN': zhCN },
    missingWarn: false,
    fallbackWarn: false,
  });
}

function mount(component: Parameters<typeof createApp>[0], props: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(component, props);
  app.use(i18n());
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('community chat inline emoji', () => {
  it('笺团 48 项注册表与独立透明 PNG 资产一一对应', () => {
    const publicRoot = join(process.cwd(), 'public');
    const keys = new Set<string>();
    const tokens = new Set<string>();
    const paths = new Set<string>();

    expect(COMMUNITY_CHAT_INLINE_EMOJIS).toHaveLength(48);
    for (const emoji of COMMUNITY_CHAT_INLINE_EMOJIS) {
      expect(emoji.key).toBe(`jian-tuan-v1:${emoji.id}`);
      expect(emoji.token).toBe(`[[ln-emoji:jian-tuan-v1:${emoji.id}]]`);
      expect(emoji.assetPath).toBe(`/community-chat/inline-emojis/jian-tuan-v1/${emoji.id}.png`);
      expect(keys.has(emoji.key)).toBe(false);
      expect(tokens.has(emoji.token)).toBe(false);
      expect(paths.has(emoji.assetPath)).toBe(false);
      keys.add(emoji.key);
      tokens.add(emoji.token);
      paths.add(emoji.assetPath);

      const data = readFileSync(join(publicRoot, emoji.assetPath.replace(/^\//, '')));
      expect(data.subarray(1, 4).toString()).toBe('PNG');
      expect(data.readUInt32BE(16)).toBe(128);
      expect(data.readUInt32BE(20)).toBe(128);
      expect(data[25]).toBe(6);
    }
  });

  it('笺团是 Emoji 内默认分类，以 8 列展示全部 48 项并发送稳定令牌', async () => {
    const onSelect = vi.fn();
    const host = mount(ChatEmojiPanel, { onSelect });
    await nextTick();

    const buttons = host.querySelectorAll<HTMLButtonElement>('.chat-emoji-panel__grid .b_btn');
    const images = host.querySelectorAll<HTMLImageElement>('.chat-emoji-panel__inline-image');
    expect(buttons).toHaveLength(48);
    expect(images).toHaveLength(48);
    expect(host.querySelector('.chat-emoji-panel__heading')?.textContent).toContain('笺团');
    expect(host.querySelector('.chat-emoji-panel__heading')?.textContent).toContain('48 个');
    expect(images[0].getAttribute('src')).toBe(COMMUNITY_CHAT_INLINE_EMOJIS[0].assetPath);

    buttons[0].click();
    await nextTick();
    expect(onSelect).toHaveBeenCalledWith(COMMUNITY_CHAT_INLINE_EMOJIS[0].token);
  });

  it('消息正文把已知令牌渲染成可访问的小图，未知令牌保留为可见文本', async () => {
    const emoji = COMMUNITY_CHAT_INLINE_EMOJIS[1];
    const host = mount(ChatInlineEmojiText, {
      content: `今天不错${emoji.token}！[[ln-emoji:jian-tuan-v9:future]]`,
    });
    await nextTick();

    const image = host.querySelector<HTMLImageElement>('.chat-inline-emoji-text__image');
    expect(image?.getAttribute('src')).toBe(emoji.assetPath);
    expect(image?.getAttribute('alt')).toBe('开心');
    expect(host.textContent).toContain('今天不错！[[ln-emoji:jian-tuan-v9:future]]');
    expect(host.textContent).not.toContain(emoji.token);
  });

  it('含笺团时切换为富输入并保持令牌选区，移除后回到 BInput 文本域', async () => {
    const emoji = COMMUNITY_CHAT_INLINE_EMOJIS[2];
    const value = ref(`前${emoji.token}后`);
    const inputRef = ref<InstanceType<typeof ChatComposerInput> | null>(null);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup: () => () =>
        h(ChatComposerInput, {
          ref: inputRef,
          value: value.value,
          placeholder: '输入消息',
          'onUpdate:value': (nextValue: string) => {
            value.value = nextValue;
          },
        }),
    });
    app.use(i18n());
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await nextTick();
    await nextTick();

    expect(host.querySelector('textarea')).toBeNull();
    expect(host.querySelector<HTMLImageElement>('.chat-composer-input__emoji')?.dataset.inlineEmojiToken).toBe(
      emoji.token,
    );
    const caret = 1 + emoji.token.length;
    inputRef.value?.focus();
    inputRef.value?.setSelectionRange(caret, caret);
    expect(inputRef.value?.getSelectionRange()).toEqual({ start: caret, end: caret });

    const appendedValue = `${value.value}${COMMUNITY_CHAT_INLINE_EMOJIS[3].token}`;
    value.value = appendedValue;
    await nextTick();
    inputRef.value?.focus();
    inputRef.value?.setSelectionRange(appendedValue.length, appendedValue.length);
    await nextTick();
    await nextTick();
    expect(inputRef.value?.getSelectionRange()).toEqual({ start: appendedValue.length, end: appendedValue.length });

    value.value = '普通文本';
    await nextTick();
    await nextTick();
    expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('普通文本');
  });
});
