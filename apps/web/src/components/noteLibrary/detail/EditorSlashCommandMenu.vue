<template>
  <div class="slash-command-menu" role="menu" :aria-label="t('noteDetail.editor.slash.title')" @mousedown.prevent>
    <div v-if="view === 'languages'" class="slash-command-menu__subheader">
      <BButton class="slash-command-menu__back" :aria-label="t('common.back')" @click="showCommands">
        <SvgIcon :src="icon.arrow_left" size="17" aria-hidden="true" />
      </BButton>
      <div>
        <strong>{{ t('noteDetail.editor.slash.languageTitle') }}</strong>
        <small>{{ t('noteDetail.editor.slash.languageHint') }}</small>
      </div>
    </div>
    <div ref="scrollRef" v-auto-scrollbar class="slash-command-menu__scroll">
      <template v-if="view === 'commands'">
        <template v-for="group in visibleGroups" :key="group.key">
          <div class="slash-command-menu__group-label">{{ group.label }}</div>
          <BButton
            v-for="command in group.commands"
            :key="command.key"
            class="slash-command-menu__item"
            :class="{ 'is-active': command.key === activeCommand?.key }"
            role="menuitem"
            @mouseenter="setActive(command.key)"
            @click="choose(command)"
          >
            <span class="slash-command-menu__icon" aria-hidden="true">
              <SvgIcon :src="command.icon" size="19" />
            </span>
            <span class="slash-command-menu__copy">
              <strong>{{ command.label }}</strong>
              <small>{{ command.description }}</small>
            </span>
            <code v-if="command.syntax" class="slash-command-menu__syntax" aria-hidden="true">
              {{ command.syntax }}
            </code>
          </BButton>
        </template>
        <div v-if="!filteredCommands.length" class="slash-command-menu__empty" role="status">
          {{ t('noteDetail.editor.slash.noMatch') }}
        </div>
      </template>
      <template v-else>
        <BButton
          v-for="(language, index) in codeLanguages"
          :key="language.value"
          class="slash-command-menu__language"
          :class="{ 'is-active': index === activeLanguageIndex }"
          role="menuitem"
          @mouseenter="activeLanguageIndex = index"
          @click="chooseLanguage(language.value)"
        >
          <span>{{ language.label }}</span>
          <code>{{ language.value }}</code>
        </BButton>
      </template>
    </div>
    <div class="slash-command-menu__footer">
      <span>{{ t('noteDetail.editor.slash.keyboardHint') }}</span>
      <kbd>Esc</kbd>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { scrollNearestIntoContainer } from '@/utils/zoom';

  export interface EditorSlashCommand {
    key: string;
    label: string;
    description: string;
    keywords: string[];
    icon: string;
    group: 'basic' | 'list' | 'block' | 'insert';
    syntax?: string;
    language?: string;
  }

  const props = withDefaults(
    defineProps<{
      commands: EditorSlashCommand[];
      keyword: string;
      codeLanguages?: Array<{ value: string; label: string }>;
    }>(),
    { codeLanguages: () => [] },
  );
  const emit = defineEmits<{ select: [command: EditorSlashCommand] }>();
  const { t } = useI18n();
  const activeIndex = ref(0);
  const activeLanguageIndex = ref(0);
  const view = ref<'commands' | 'languages'>('commands');
  const pendingCodeCommand = ref<EditorSlashCommand | null>(null);
  const scrollRef = ref<HTMLElement | null>(null);

  const filteredCommands = computed(() => {
    const keyword = props.keyword.trim().toLocaleLowerCase();
    if (!keyword) return props.commands;
    return props.commands.filter((command) =>
      [command.label, command.description, ...command.keywords].some((value) =>
        value.toLocaleLowerCase().includes(keyword),
      ),
    );
  });
  const activeCommand = computed(() => filteredCommands.value[activeIndex.value] || null);
  const visibleGroups = computed(() =>
    (['basic', 'list', 'block', 'insert'] as const).flatMap((key) => {
      const commands = filteredCommands.value.filter((command) => command.group === key);
      return commands.length ? [{ key, label: t(`noteDetail.editor.slash.groups.${key}`), commands }] : [];
    }),
  );

  watch(
    () => props.keyword,
    () => {
      activeIndex.value = 0;
      view.value = 'commands';
      pendingCodeCommand.value = null;
    },
  );
  watch(filteredCommands, (commands) => {
    if (activeIndex.value >= commands.length) activeIndex.value = Math.max(0, commands.length - 1);
  });

  async function scrollActiveIntoView() {
    await nextTick();
    const container = scrollRef.value;
    const activeItem = container?.querySelector<HTMLElement>(
      view.value === 'languages' ? '.slash-command-menu__language.is-active' : '.slash-command-menu__item.is-active',
    );
    if (container && activeItem) scrollNearestIntoContainer(container, activeItem, 'auto');
  }

  async function moveActive(offset: number) {
    if (view.value === 'languages') {
      if (!props.codeLanguages.length) return;
      activeLanguageIndex.value =
        (activeLanguageIndex.value + offset + props.codeLanguages.length) % props.codeLanguages.length;
      await scrollActiveIntoView();
      return;
    }
    if (!filteredCommands.value.length) return;
    activeIndex.value = (activeIndex.value + offset + filteredCommands.value.length) % filteredCommands.value.length;
    await scrollActiveIntoView();
  }

  function chooseActive() {
    if (view.value === 'languages') {
      const language = props.codeLanguages[activeLanguageIndex.value];
      if (language) chooseLanguage(language.value);
      return;
    }
    if (activeCommand.value) choose(activeCommand.value);
  }

  function choose(command: EditorSlashCommand) {
    if (command.key === 'insertCodeBlock' && props.codeLanguages.length) {
      pendingCodeCommand.value = command;
      activeLanguageIndex.value = 0;
      view.value = 'languages';
      return;
    }
    emit('select', command);
  }

  function chooseLanguage(language: string) {
    if (!pendingCodeCommand.value) return;
    emit('select', { ...pendingCodeCommand.value, language });
    showCommands();
  }

  function showCommands() {
    view.value = 'commands';
    pendingCodeCommand.value = null;
  }

  function handleEscape() {
    if (view.value !== 'languages') return false;
    showCommands();
    return true;
  }

  function setActive(key: string) {
    const index = filteredCommands.value.findIndex((command) => command.key === key);
    if (index >= 0) activeIndex.value = index;
  }

  defineExpose({ moveActive, chooseActive, handleEscape, reset: showCommands });
</script>

<style scoped lang="less">
  .slash-command-menu {
    width: min(360px, calc(100vw - 24px));
    // 与 @ 资源选择器保持同一高度预算；过高会在界面缩放后让上下两侧都放不下，
    // BPopover 被迫钳进视口并跨过触发字符。更多命令由内部滚动承载。
    max-height: min(340px, calc(100vh - 140px));
    display: flex;
    flex-direction: column;
    color: var(--text-color);
  }

  .slash-command-menu__scroll {
    min-height: 0;
    overflow-y: auto;
    padding: 4px;
    overscroll-behavior: contain;
  }

  .slash-command-menu__group-label {
    padding: 6px 8px 3px;
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 600;
  }

  .slash-command-menu__subheader {
    min-height: 54px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--surface-divider-color, var(--card-border-color));
  }

  .slash-command-menu__subheader > div {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .slash-command-menu__subheader strong {
    font-size: 13px;
  }

  .slash-command-menu__subheader small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .slash-command-menu__back {
    width: 34px;
    min-width: 34px;
    height: 34px;
    padding: 0;
    border-radius: 8px;
  }

  .slash-command-menu__item {
    width: 100%;
    min-height: 40px;
    height: auto;
    justify-content: flex-start;
    gap: 8px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent !important;
    line-height: 1.35;
    text-align: left;
  }

  .slash-command-menu__item.is-active {
    border-color: var(--primary-color);
    background: var(--hover-background) !important;
  }

  .slash-command-menu__language {
    width: 100%;
    min-height: 40px;
    height: 40px;
    justify-content: space-between;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent !important;
    color: var(--text-color);
  }

  .slash-command-menu__language.is-active {
    border-color: var(--primary-color);
    background: var(--hover-background) !important;
  }

  .slash-command-menu__language code {
    color: var(--desc-color);
    font-size: 11px;
  }

  .slash-command-menu__icon {
    width: 28px;
    height: 28px;
    display: inline-flex;
    flex: 0 0 28px;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 8px;
    color: var(--primary-color);
    background: var(--background-color);
  }

  .slash-command-menu__copy {
    min-width: 0;
    display: block;
    white-space: normal;
  }

  .slash-command-menu__copy strong {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
  }

  .slash-command-menu__copy small {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .slash-command-menu__syntax {
    margin-left: auto;
    flex: 0 0 auto;
    color: var(--desc-color);
    font-family: var(--code-font-family, ui-monospace, SFMono-Regular, Consolas, monospace);
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
  }

  .slash-command-menu__empty {
    padding: 28px 16px;
    color: var(--desc-color);
    font-size: 13px;
    text-align: center;
  }

  .slash-command-menu__footer {
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border-top: 1px solid var(--surface-divider-color, var(--card-border-color));
    color: var(--desc-color);
    font-size: 11px;
  }

  .slash-command-menu__footer kbd {
    padding: 1px 6px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 5px;
    background: var(--background-color);
    font-family: inherit;
  }

  html.light-note-mobile-rendering .slash-command-menu__item.is-active {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }
</style>
