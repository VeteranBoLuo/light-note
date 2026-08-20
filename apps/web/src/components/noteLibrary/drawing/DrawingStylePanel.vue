<template>
  <div class="drawing-style-panel">
    <section v-if="colorEnabled" class="drawing-style-section">
      <strong>{{ t('note.drawingCommonColors') }}</strong>
      <div
        class="drawing-style-colors drawing-style-colors--common"
        role="list"
        :aria-label="t('note.drawingCommonColors')"
      >
        <BButton
          v-for="color in commonColors"
          :key="color"
          class="drawing-style-color"
          :class="{ 'is-active': normalizedActiveColor === color }"
          :aria-label="color"
          :aria-pressed="normalizedActiveColor === color"
          @click="chooseColor(color)"
        >
          <span class="drawing-style-swatch" :style="{ backgroundColor: color }">
            <span v-if="normalizedActiveColor === color" aria-hidden="true">✓</span>
          </span>
        </BButton>
      </div>
    </section>

    <section v-if="colorEnabled" class="drawing-style-section">
      <strong>{{ t('note.drawingFullPalette') }}</strong>
      <div
        class="drawing-style-colors drawing-style-colors--palette"
        role="list"
        :aria-label="t('note.drawingFullPalette')"
      >
        <BButton
          v-for="color in paletteColors"
          :key="color"
          class="drawing-style-color drawing-style-color--compact"
          :class="{ 'is-active': normalizedActiveColor === color }"
          :aria-label="color"
          :aria-pressed="normalizedActiveColor === color"
          @click="chooseColor(color)"
        >
          <span class="drawing-style-swatch" :style="{ backgroundColor: color }">
            <span v-if="normalizedActiveColor === color" aria-hidden="true">✓</span>
          </span>
        </BButton>
      </div>
    </section>

    <section v-if="colorEnabled && recentColors.length" class="drawing-style-section">
      <strong>{{ t('note.drawingRecentColors') }}</strong>
      <div
        class="drawing-style-colors drawing-style-colors--recent"
        role="list"
        :aria-label="t('note.drawingRecentColors')"
      >
        <BButton
          v-for="color in recentColors"
          :key="color"
          class="drawing-style-color"
          :class="{ 'is-active': normalizedActiveColor === color }"
          :aria-label="color"
          :aria-pressed="normalizedActiveColor === color"
          @click="chooseColor(color)"
        >
          <span class="drawing-style-swatch" :style="{ backgroundColor: color }">
            <span v-if="normalizedActiveColor === color" aria-hidden="true">✓</span>
          </span>
        </BButton>
      </div>
    </section>

    <section v-if="colorEnabled" class="drawing-style-section">
      <strong>{{ t('note.drawingCustomColor') }}</strong>
      <div class="drawing-style-custom-row">
        <BInput
          v-model:value="customColor"
          class="drawing-style-color-input"
          type="color"
          height="40px"
          :aria-label="t('note.drawingCustomColor')"
          @input="handleColorInput"
        />
        <BInput
          v-model:value="customHex"
          class="drawing-style-hex-input"
          maxlength="7"
          :placeholder="'#RRGGBB'"
          :aria-label="t('note.drawingHexColor')"
          @enter="applyHexColor"
        />
        <BButton size="small" :disabled="!validCustomHex" @click="applyHexColor">
          {{ t('common.confirm') }}
        </BButton>
      </div>
    </section>

    <section v-if="sizeEnabled" class="drawing-style-section drawing-style-size-section">
      <strong>{{ sizeLabel }}</strong>
      <div class="drawing-style-size-options" role="list" :aria-label="sizeLabel">
        <BButton
          v-for="size in sizeOptions"
          :key="size"
          class="drawing-style-size-option"
          :class="{ 'is-active': activeSize === size }"
          :aria-label="`${sizeLabel} ${size} px`"
          :aria-pressed="activeSize === size"
          @click="$emit('choose-size', size)"
        >
          {{ size }} px
        </BButton>
      </div>
      <div class="drawing-style-range-row">
        <!-- B 系列暂时没有 Slider；这里保留原生 range 以提供连续、有界的尺寸输入。 -->
        <input
          class="drawing-style-range"
          type="range"
          :min="sizeRange.min"
          :max="sizeRange.max"
          :value="activeSize"
          :aria-label="sizeLabel"
          @input="emitRangeSize"
        />
        <span class="drawing-style-size-current">{{ activeSize }} px</span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';

  const props = withDefaults(
    defineProps<{
      activeColor: string;
      commonColors: readonly string[];
      paletteColors: readonly string[];
      recentColors: readonly string[];
      colorEnabled?: boolean;
      sizeEnabled?: boolean;
      activeSize: number;
      sizeLabel: string;
      sizeOptions: readonly number[];
      sizeRange: { min: number; max: number };
    }>(),
    { colorEnabled: true, sizeEnabled: true },
  );
  const emit = defineEmits<{
    'choose-color': [color: string];
    'choose-size': [size: number];
  }>();
  const { t } = useI18n();
  const customColor = ref(props.activeColor);
  const customHex = ref(props.activeColor.toUpperCase());
  const normalizedActiveColor = computed(() => props.activeColor.toLowerCase());
  const validCustomHex = computed(() => /^#[0-9a-f]{6}$/iu.test(customHex.value.trim()));

  watch(
    () => props.activeColor,
    (color) => {
      customColor.value = color;
      customHex.value = color.toUpperCase();
    },
  );

  function chooseColor(color: string) {
    emit('choose-color', color.toLowerCase());
  }

  function handleColorInput(value: string | number) {
    const color = String(value).toLowerCase();
    if (!/^#[0-9a-f]{6}$/u.test(color)) return;
    customHex.value = color.toUpperCase();
    chooseColor(color);
  }

  function applyHexColor() {
    if (!validCustomHex.value) return;
    const color = customHex.value.trim().toLowerCase();
    customColor.value = color;
    chooseColor(color);
  }

  function emitRangeSize(event: Event) {
    emit('choose-size', Number((event.target as HTMLInputElement).value));
  }
</script>

<style scoped lang="less">
  .drawing-style-panel {
    display: grid;
    width: min(340px, calc(100vw - 28px));
    max-height: min(72vh, 620px);
    padding: 14px;
    overflow: auto;
    box-sizing: border-box;
    gap: 14px;
    color: var(--text-color);
    font-size: 12px;
  }

  .drawing-style-section {
    display: grid;
    gap: 8px;
  }

  .drawing-style-colors {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 6px;
  }

  .drawing-style-color {
    width: 34px;
    min-width: 34px;
    height: 34px;
    min-height: 34px;
    padding: 3px;
    border: 1px solid transparent !important;
    border-radius: 8px;
    background: transparent;
  }

  .drawing-style-color--compact {
    width: 34px;
    min-width: 34px;
    height: 30px;
    min-height: 30px;
  }

  .drawing-style-color.is-active {
    border-color: var(--primary-color) !important;
    background: var(--primary-btn-h-bg-color);
  }

  .drawing-style-swatch {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    border: 1px solid rgba(31, 41, 55, 0.24);
    border-radius: 5px;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
  }

  .drawing-style-custom-row,
  .drawing-style-range-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .drawing-style-color-input {
    flex: 0 0 48px;
  }

  .drawing-style-color-input :deep(.b-input) {
    padding: 3px !important;
    border: 1px solid var(--surface-border-color) !important;
    cursor: pointer;
  }

  .drawing-style-hex-input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .drawing-style-hex-input :deep(.b-input) {
    border: 1px solid var(--surface-border-color) !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    text-transform: uppercase;
  }

  .drawing-style-size-options {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }

  .drawing-style-size-option {
    min-width: 0;
    height: 40px;
    padding: 0 8px;
    border: 1px solid var(--surface-border-color, var(--card-border-color)) !important;
    background: var(--card-background);
  }

  .drawing-style-size-option.is-active {
    color: var(--primary-color);
    border-color: var(--primary-color) !important;
    background: var(--primary-btn-h-bg-color);
  }

  .drawing-style-range {
    flex: 1 1 auto;
    min-width: 0;
    height: 32px;
    margin: 0;
    accent-color: #615ced;
    cursor: pointer;
  }

  .drawing-style-size-current {
    flex: 0 0 46px;
    color: var(--desc-color);
    text-align: right;
  }

  html.light-note-mobile-rendering & {
    .drawing-style-color.is-active,
    .drawing-style-size-option.is-active {
      color: #615ced;
      border-color: #615ced !important;
      background: #eeedff;
    }
  }

  @media (max-width: 768px) {
    .drawing-style-panel {
      width: 100%;
      max-height: none;
      padding: 4px 4px 18px;
      gap: 18px;
    }

    .drawing-style-color,
    .drawing-style-color--compact {
      width: 100%;
      min-width: 0;
      height: 40px;
      min-height: 40px;
    }
  }
</style>
