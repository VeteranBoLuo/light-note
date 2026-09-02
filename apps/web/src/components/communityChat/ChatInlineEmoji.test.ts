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

const composerSource = readFileSync(join(process.cwd(), 'src/components/communityChat/ChatComposerInput.vue'), 'utf8');
const messageTextSource = readFileSync(
  join(process.cwd(), 'src/components/communityChat/ChatInlineEmojiText.vue'),
  'utf8',
);

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

  it('输入态笺团不撑高文本行，消息气泡仍保留更大的展示尺寸', () => {
    expect(composerSource).toMatch(
      /\.chat-composer-input__plain :deep\(\.b-textarea\)\s*\{[\s\S]*?display:\s*block;[\s\S]*?font-size:\s*inherit;/,
    );
    expect(composerSource).toMatch(
      /\.chat-composer-input__emoji\)\s*\{[\s\S]*?width:\s*1em;[\s\S]*?height:\s*1em;[\s\S]*?vertical-align:\s*-0\.12em;[\s\S]*?transform:\s*scale\(1\.45\);/,
    );
    const composerEmojiStyle = composerSource.slice(
      composerSource.indexOf('.chat-composer-input__emoji)'),
      composerSource.indexOf('.chat-composer-input__emoji.is-selected'),
    );
    expect(composerEmojiStyle).not.toContain('margin-inline:');
    expect(messageTextSource).toMatch(
      /\.chat-inline-emoji-text__image\s*\{[\s\S]*?width:\s*2em;[\s\S]*?height:\s*2em;[\s\S]*?vertical-align:\s*-0\.65em;/,
    );
  });

  it('placeholder 降低视觉层级，笺团选中态沿用原生矩形高亮且不绘制遮挡轮廓', () => {
    expect(composerSource).toMatch(
      /\.chat-composer-input__rich:empty::before\s*\{[\s\S]*?font-size:\s*0\.9em;[\s\S]*?opacity:\s*0\.78;/,
    );
    expect(composerSource).toMatch(
      /\.b-textarea::placeholder\)\s*\{[\s\S]*?font-size:\s*0\.9em;[\s\S]*?opacity:\s*0\.78;/,
    );
    const selectedStyle = composerSource.slice(
      composerSource.indexOf('.chat-composer-input__emoji.is-selected'),
      composerSource.indexOf('</style>'),
    );
    expect(selectedStyle).toContain('background: rgba(144, 198, 255, 0.55);');
    expect(selectedStyle).not.toContain('outline:');
    expect(selectedStyle).not.toContain('border-radius:');
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

  it('富输入在第二行按 Shift+Enter 后把光标留在新换行后', async () => {
    const emoji = COMMUNITY_CHAT_INLINE_EMOJIS[2];
    const initialValue = `第一行${emoji.token}\n第二行内容`;
    const value = ref(initialValue);
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

    const richInput = host.querySelector<HTMLElement>('.chat-composer-input__rich');
    expect(richInput).not.toBeNull();
    const caretBeforeBreak = initialValue.length;
    inputRef.value?.focus();
    inputRef.value?.setSelectionRange(caretBeforeBreak, caretBeforeBreak);
    richInput?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    await nextTick();
    await nextTick();

    expect(value.value).toBe(`${initialValue}\n`);
    expect(richInput?.querySelectorAll('br:not([data-composer-caret-sentinel="true"])')).toHaveLength(2);
    expect((richInput?.lastChild as HTMLElement | null)?.dataset.composerCaretSentinel).toBe('true');
    expect(inputRef.value?.getSelectionRange()).toEqual({
      start: caretBeforeBreak + 1,
      end: caretBeforeBreak + 1,
    });

    const caretSentinel = richInput?.querySelector<HTMLElement>('[data-composer-caret-sentinel="true"]');
    const typedNode = document.createTextNode('后');
    richInput?.insertBefore(typedNode, caretSentinel || null);
    const typedRange = document.createRange();
    typedRange.setStart(typedNode, 1);
    typedRange.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(typedRange);
    richInput?.dispatchEvent(new InputEvent('input', { inputType: 'insertText', bubbles: true }));
    await nextTick();
    await nextTick();

    expect(value.value).toBe(`${initialValue}\n后`);
    expect(richInput?.querySelector('[data-composer-caret-sentinel="true"]')).toBeNull();
  });

  it('普通多行文本加入笺团后按富输入真实内容重新测高', async () => {
    const emoji = COMMUNITY_CHAT_INLINE_EMOJIS[4];
    const plainValue = '1231\n123131\n213131';
    const value = ref(plainValue);
    const inputRef = ref<InstanceType<typeof ChatComposerInput> | null>(null);
    const scrollHeightMock = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('chat-composer-input__rich')) {
        return this.querySelector('.chat-composer-input__emoji') ? 88 : 42;
      }
      return this instanceof HTMLTextAreaElement ? 72 : 0;
    });
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
      scrollHeightMock.mockRestore();
      app.unmount();
      host.remove();
    };
    await nextTick();
    await nextTick();

    inputRef.value?.syncHeight(42, 112);
    expect(host.querySelector<HTMLTextAreaElement>('textarea')?.style.height).toBe('72px');

    value.value = `${plainValue}${emoji.token}`;
    await nextTick();
    await nextTick();
    const richInput = host.querySelector<HTMLElement>('.chat-composer-input__rich');
    expect(richInput?.textContent).toBe(plainValue.replaceAll('\n', ''));
    expect(richInput?.querySelectorAll('br')).toHaveLength(2);
    expect(richInput?.scrollHeight).toBe(88);
    expect(richInput?.style.height).toBe('88px');
  });

  it('富输入全选时给令牌图片明确选中态，收起选区后移除', async () => {
    const emoji = COMMUNITY_CHAT_INLINE_EMOJIS[5];
    const value = `选中${emoji.token}全部`;
    const host = mount(ChatComposerInput, { value, placeholder: '输入消息' });
    await nextTick();
    await nextTick();

    const richInput = host.querySelector<HTMLElement>('.chat-composer-input__rich');
    const image = host.querySelector<HTMLImageElement>('.chat-composer-input__emoji');
    const selection = window.getSelection();
    if (!richInput || !image || !selection) throw new Error('missing rich input selection fixture');

    const range = document.createRange();
    range.selectNodeContents(richInput);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    expect(image.classList.contains('is-selected')).toBe(true);

    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    expect(image.classList.contains('is-selected')).toBe(false);
  });

  it('笺团插入进入统一撤销栈，跨普通与富输入模式均可撤销和重做', async () => {
    const emoji = COMMUNITY_CHAT_INLINE_EMOJIS[6];
    const initialValue = '123312';
    const value = ref(initialValue);
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

    inputRef.value?.focus();
    inputRef.value?.setSelectionRange(initialValue.length, initialValue.length);
    expect(inputRef.value?.replaceSelection(emoji.token)).toBe(true);
    await nextTick();
    await nextTick();
    expect(value.value).toBe(`${initialValue}${emoji.token}`);
    expect(host.querySelector<HTMLImageElement>('.chat-composer-input__emoji')?.dataset.inlineEmojiToken).toBe(
      emoji.token,
    );

    host
      .querySelector<HTMLElement>('.chat-composer-input__rich')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }));
    await nextTick();
    await nextTick();
    expect(value.value).toBe(initialValue);
    expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(initialValue);

    host
      .querySelector<HTMLTextAreaElement>('textarea')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true }),
      );
    await nextTick();
    await nextTick();
    expect(value.value).toBe(`${initialValue}${emoji.token}`);
    expect(host.querySelector('.chat-composer-input__emoji')).not.toBeNull();

    host
      .querySelector<HTMLElement>('.chat-composer-input__rich')
      ?.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyUndo', bubbles: true, cancelable: true }));
    await nextTick();
    await nextTick();
    expect(value.value).toBe(initialValue);

    host
      .querySelector<HTMLTextAreaElement>('textarea')
      ?.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyRedo', bubbles: true, cancelable: true }));
    await nextTick();
    await nextTick();
    expect(value.value).toBe(`${initialValue}${emoji.token}`);
    expect(host.querySelector('.chat-composer-input__emoji')).not.toBeNull();
  });
});
