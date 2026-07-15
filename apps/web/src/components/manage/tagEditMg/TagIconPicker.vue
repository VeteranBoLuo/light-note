<template>
  <div class="tag-icon-picker">
    <span class="picker-label">{{ t('tagManage.icon') }}</span>
    <div class="picker-controls">
      <span class="icon-preview" :class="{ empty: !previewSrc }">
        <SvgIcon :src="previewSrc || icon.nullImg" :color="savedPreviewColor" size="20" />
      </span>

      <BButton class="picker-smart" type="primary" @click="openPicker">
        {{ t('tagManage.smartChooseIcon') }}
      </BButton>
      <BButton class="picker-upload" @click="uploadIcon">{{ t('tagManage.uploadIcon') }}</BButton>

      <BInput
        v-model:value="value"
        class="advanced-input"
        :placeholder="t('tagManage.iconPlaceholder')"
        clearable
        @blur="normalizeIconInput"
      />
    </div>

    <BModal
      v-model:visible="pickerVisible"
      :title="t('tagManage.iconPickerTitle')"
      :show-footer="false"
      width="min(720px, calc(100vw - 32px))"
    >
      <div class="picker-modal-body">
        <div class="search-row">
          <BInput
            v-model:value="searchQuery"
            :placeholder="t('tagManage.iconSearchPlaceholder')"
            :maxlength="80"
            clearable
            @enter="runSearch(0)"
          />
          <BButton type="primary" :loading="searching" @click="runSearch(0)">{{
            t('tagManage.iconSearchButton')
          }}</BButton>
        </div>

        <div v-if="translatedQuery" class="translation-hint">
          {{ t('tagManage.iconSearchKeywords', { keywords: translatedQuery }) }}
        </div>

        <div class="color-picker-row">
          <span class="color-picker-label">{{ t('tagManage.iconColor') }}</span>
          <div class="color-options">
            <BButton
              v-for="color in colorOptions"
              :key="color"
              size="small"
              class="color-option"
              :class="{ selected: selectedColor === color, 'is-default': color === DEFAULT_TAG_ICON_COLOR }"
              :title="colorOptionLabel(color)"
              :aria-label="colorOptionLabel(color)"
              :aria-pressed="selectedColor === color"
              @click="selectIconColor(color)"
            >
              <span
                class="color-dot"
                :class="{ 'color-dot--theme': color === DEFAULT_TAG_ICON_COLOR }"
                :style="color === DEFAULT_TAG_ICON_COLOR ? undefined : { backgroundColor: color }"
              ></span>
              <span v-if="color === DEFAULT_TAG_ICON_COLOR" class="default-color-text">
                {{ t('tagManage.iconColorDefault') }}
              </span>
            </BButton>
            <BPopover
              v-model:open="customColorOpen"
              trigger="click"
              placement="bottom-right"
              overlay-class-name="tag-icon-color-popover"
            >
              <BButton
                size="small"
                class="color-option color-option--custom"
                :class="{ selected: isCustomColor || customColorOpen }"
                :title="t('tagManage.iconColorCustom')"
                :aria-label="t('tagManage.iconColorCustom')"
                :aria-pressed="isCustomColor"
              >
                <span
                  class="color-dot color-dot--custom"
                  :class="{ 'has-custom-color': isCustomColor }"
                  :style="isCustomColor ? { background: selectedColor } : undefined"
                ></span>
                <span class="custom-color-text">{{ t('tagManage.iconColorCustom') }}</span>
              </BButton>
              <template #content>
                <div class="tag-icon-color-picker">
                  <div
                    ref="saturationRef"
                    class="tag-icon-color-plane"
                    :style="{ '--picker-hue': customHsv.h }"
                    role="slider"
                    tabindex="0"
                    :aria-label="t('tagManage.iconColorArea')"
                    @pointerdown="startSaturationSelection"
                    @pointermove="moveSaturationSelection"
                    @pointerup="endSaturationSelection"
                    @pointercancel="endSaturationSelection"
                    @keydown="handleColorPlaneKeydown"
                  >
                    <span
                      class="tag-icon-color-handle"
                      :style="{ left: `${customHsv.s * 100}%`, top: `${(1 - customHsv.v) * 100}%` }"
                    ></span>
                  </div>
                  <!-- 项目暂无 B 系列滑块组件；色相需要连续拖动，使用原生 range 并封装在 BPopover 内。 -->
                  <input
                    class="tag-icon-hue-slider"
                    type="range"
                    min="0"
                    max="359"
                    step="1"
                    :value="Math.round(customHsv.h)"
                    :aria-label="t('tagManage.iconColorHue')"
                    @input="handleHueInput"
                  />
                  <div class="tag-icon-color-value">
                    <span class="tag-icon-color-preview" :style="{ backgroundColor: customHex }"></span>
                    <BInput
                      class="tag-icon-color-hex"
                      :value="customHex"
                      :maxlength="7"
                      :placeholder="t('tagManage.iconColorHex')"
                      @update:value="handleCustomHexInput"
                    />
                  </div>
                </div>
              </template>
            </BPopover>
          </div>
        </div>

        <BLoading :loading="searching || resolving" style="min-height: 240px">
          <div v-if="resultIcons.length" class="icon-grid">
            <BButton
              v-for="iconName in resultIcons"
              :key="iconName"
              class="icon-option"
              :class="{ selected: selectedIcon === iconName }"
              :title="iconName"
              @click="chooseIcon(iconName)"
            >
              <Icon :icon="iconName" width="30" height="30" :style="{ color: selectedPreviewColor }" />
              <span>{{ iconLabel(iconName) }}</span>
            </BButton>
          </div>
          <div v-else-if="searched" class="empty-state">
            <strong>{{ t('tagManage.iconSearchEmptyTitle') }}</strong>
            <span>{{ t('tagManage.iconSearchEmptyDesc') }}</span>
          </div>
          <div v-else class="empty-state">
            <strong>{{ t('tagManage.iconSearchStartTitle') }}</strong>
            <span>{{ t('tagManage.iconSearchStartDesc') }}</span>
          </div>
        </BLoading>

        <div class="picker-footer">
          <div class="page-actions">
            <BButton v-if="page > 0" size="small" @click="runSearch(page - 1)">{{
              t('tagManage.previousIcons')
            }}</BButton>
            <BButton v-if="hasMore" size="small" @click="runSearch(page + 1)">{{ t('tagManage.nextIcons') }}</BButton>
          </div>
          <a href="https://icon-sets.iconify.design/" target="_blank" rel="noopener noreferrer">
            {{ t('tagManage.openIconify') }}
          </a>
        </div>
      </div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { Icon } from '@iconify/vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { resolveTagIcon, searchTagIcons, type TagIconSearchResult } from '@/api/tagIconApi.ts';
  import { normalizeTagIconValue } from '@/utils/tagIcon.ts';
  import {
    applyTagIconColor,
    DEFAULT_TAG_ICON_COLOR,
    getTagIconColor,
    hexToHsv,
    hsvToHex,
    TAG_ICON_COLOR_OPTIONS,
    type HsvColor,
  } from './tagIconColor.ts';

  const props = defineProps<{ tagName?: string }>();
  const value = defineModel<string | undefined>('value', { default: '' });
  const { t } = useI18n();
  const pickerVisible = ref(false);
  const searchQuery = ref('');
  const resultIcons = ref<string[]>([]);
  const translatedQuery = ref('');
  const selectedIcon = ref('');
  const searching = ref(false);
  const resolving = ref(false);
  const searched = ref(false);
  const page = ref(0);
  const hasMore = ref(false);
  const lastAutoQuery = ref('');
  const selectedColor = ref<string>(DEFAULT_TAG_ICON_COLOR);
  const colorOptions = [DEFAULT_TAG_ICON_COLOR, ...TAG_ICON_COLOR_OPTIONS];
  const customColorOpen = ref(false);
  const customHex = ref('#615CED');
  const customHsv = reactive<HsvColor>(hexToHsv(customHex.value));
  const saturationRef = ref<HTMLElement | null>(null);

  const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
  const MAX_ICON_SIDE = 256;

  const previewSrc = computed(() => {
    const raw = normalizeTagIconValue(value.value);
    if (!raw) return '';
    if (raw.startsWith('data:image/') || raw.includes('<svg')) return raw;
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 64) return `data:image/svg+xml;base64,${raw}`;
    return raw;
  });
  const selectedPreviewColor = computed(() => colorPreviewValue(selectedColor.value));
  const isCustomColor = computed(
    () =>
      selectedColor.value !== DEFAULT_TAG_ICON_COLOR &&
      !TAG_ICON_COLOR_OPTIONS.includes(selectedColor.value as (typeof TAG_ICON_COLOR_OPTIONS)[number]),
  );
  const savedPreviewColor = computed(() => {
    const color = getTagIconColor(value.value || '');
    return color && color !== DEFAULT_TAG_ICON_COLOR ? color : 'var(--text-color)';
  });

  function colorPreviewValue(color: string) {
    return color === DEFAULT_TAG_ICON_COLOR ? 'var(--text-color)' : color;
  }

  function colorOptionLabel(color: string) {
    return color === DEFAULT_TAG_ICON_COLOR ? t('tagManage.iconColorFollowDefault') : color;
  }

  function selectIconColor(color: string) {
    selectedColor.value = color;
    if (getTagIconColor(value.value || '') !== null) {
      value.value = applyTagIconColor(value.value || '', color);
    }
  }

  function setCustomHsv(color: HsvColor, apply = true) {
    customHsv.h = color.h;
    customHsv.s = color.s;
    customHsv.v = color.v;
    customHex.value = hsvToHex(customHsv);
    if (apply) selectIconColor(customHex.value);
  }

  function updateSaturationSelection(event: PointerEvent) {
    const element = saturationRef.value;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const v = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setCustomHsv({ h: customHsv.h, s, v });
  }

  function startSaturationSelection(event: PointerEvent) {
    saturationRef.value?.setPointerCapture(event.pointerId);
    updateSaturationSelection(event);
  }

  function moveSaturationSelection(event: PointerEvent) {
    if (saturationRef.value?.hasPointerCapture(event.pointerId)) updateSaturationSelection(event);
  }

  function endSaturationSelection(event: PointerEvent) {
    if (saturationRef.value?.hasPointerCapture(event.pointerId)) {
      saturationRef.value.releasePointerCapture(event.pointerId);
    }
  }

  function handleHueInput(event: Event) {
    const h = Number((event.target as HTMLInputElement).value);
    setCustomHsv({ h, s: customHsv.s, v: customHsv.v });
  }

  function handleCustomHexInput(value: string) {
    const next = String(value || '').toUpperCase();
    customHex.value = next;
    if (/^#[0-9A-F]{6}$/.test(next)) setCustomHsv(hexToHsv(next));
  }

  function handleColorPlaneKeydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 0.1 : 0.02;
    let s = customHsv.s;
    let v = customHsv.v;
    if (event.key === 'ArrowLeft') s -= step;
    else if (event.key === 'ArrowRight') s += step;
    else if (event.key === 'ArrowUp') v += step;
    else if (event.key === 'ArrowDown') v -= step;
    else return;
    event.preventDefault();
    setCustomHsv({ h: customHsv.h, s: Math.min(1, Math.max(0, s)), v: Math.min(1, Math.max(0, v)) });
  }

  watch(customColorOpen, (open) => {
    if (!open) return;
    const initialColor = selectedColor.value === DEFAULT_TAG_ICON_COLOR ? customHex.value : selectedColor.value;
    setCustomHsv(hexToHsv(initialColor), false);
  });

  function iconLabel(iconName: string) {
    return iconName.split(':')[1]?.replace(/-/g, ' ') || iconName;
  }

  async function openPicker() {
    const tagName = String(props.tagName || '').trim();
    pickerVisible.value = true;
    selectedColor.value = getTagIconColor(value.value || '') || DEFAULT_TAG_ICON_COLOR;
    const currentQuery = String(searchQuery.value || '').trim();
    const canUseAutoQuery = !currentQuery || currentQuery === lastAutoQuery.value;
    if (tagName && canUseAutoQuery) {
      searchQuery.value = tagName;
      lastAutoQuery.value = tagName;
    } else if (!tagName && currentQuery === lastAutoQuery.value) {
      searchQuery.value = '';
      lastAutoQuery.value = '';
    }

    if (String(searchQuery.value || '').trim()) {
      await runSearch(0);
      return;
    }
    resultIcons.value = [];
    translatedQuery.value = '';
    searched.value = false;
    page.value = 0;
    hasMore.value = false;
  }

  async function runSearch(targetPage = 0) {
    const query = String(searchQuery.value || '').trim();
    if (!query || searching.value) return;
    searching.value = true;
    try {
      const res = await searchTagIcons(query, targetPage);
      if (res.status !== 200) throw new Error(res.msg || 'search failed');
      const data = (res.data || {}) as TagIconSearchResult;
      resultIcons.value = data.icons || [];
      translatedQuery.value = data.translatedQuery || '';
      page.value = data.page || 0;
      hasMore.value = !!data.hasMore;
      searched.value = true;
      recordOperation({ module: '标签详情', operation: `搜索标签图标【${query}】` });
    } catch (error) {
      console.error('search tag icons failed', error);
      message.error(t('tagManage.iconSearchFailed'));
    } finally {
      searching.value = false;
    }
  }

  async function chooseIcon(iconName: string) {
    if (resolving.value) return;
    resolving.value = true;
    selectedIcon.value = iconName;
    try {
      const res = await resolveTagIcon(iconName);
      const iconUrl = String(res?.data?.iconUrl || '');
      if (res.status !== 200 || !iconUrl) throw new Error(res.msg || 'resolve failed');
      value.value = applyTagIconColor(iconUrl, selectedColor.value);
      pickerVisible.value = false;
      recordOperation({ module: '标签详情', operation: `选择标签图标【${iconName}】` });
      message.success(t('tagManage.iconSelectSuccess'));
    } catch (error) {
      selectedIcon.value = '';
      console.error('resolve tag icon failed', error);
      message.error(t('tagManage.iconResolveFailed'));
    } finally {
      resolving.value = false;
    }
  }

  function uploadIcon() {
    // 项目暂无 B 系列文件选择器；文件选择必须由浏览器原生 file input 触发。
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > MAX_UPLOAD_SIZE) {
        message.warning(t('tagManage.iconUploadTooLarge'));
        return;
      }
      try {
        value.value = await createUploadedIconDataUrl(file);
        recordOperation({ module: '标签详情', operation: '上传标签图标' });
      } catch (error) {
        console.error('process tag icon upload failed', error);
        message.error(t('tagManage.iconUploadFailed'));
      }
    });
    input.click();
  }

  async function createUploadedIconDataUrl(file: File): Promise<string> {
    if (file.type === 'image/svg+xml') return normalizeTagIconValue(await file.text());

    const originalUrl = await readFileAsDataUrl(file);
    const image = await loadImage(originalUrl);
    const scale = Math.min(1, MAX_ICON_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas context unavailable');
    context.drawImage(image, 0, 0, width, height);
    const compressed = canvas.toDataURL('image/webp', 0.84);
    return compressed.startsWith('data:image/') ? compressed : originalUrl;
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read image failed'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('load image failed'));
      image.src = src;
    });
  }

  function normalizeIconInput() {
    value.value = normalizeTagIconValue(value.value);
  }
</script>

<style scoped lang="less">
  .tag-icon-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .picker-controls {
    display: grid;
    grid-template-columns: 32px auto auto minmax(180px, 1fr);
    grid-template-areas: 'preview smart upload input';
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .search-row,
  .picker-footer,
  .page-actions {
    display: flex;
    align-items: center;
  }

  .picker-footer {
    justify-content: space-between;
    gap: 12px;
  }

  .page-actions {
    gap: 8px;
  }

  .picker-label,
  .translation-hint,
  .color-picker-label {
    font-size: 13px;
    color: var(--desc-color);
  }

  .icon-preview {
    grid-area: preview;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--card-border-color);
    box-sizing: border-box;
    border-radius: 7px;
    color: var(--text-color);
    background: var(--background-color);
  }

  .icon-preview.empty {
    opacity: 0.55;
  }

  .picker-smart {
    grid-area: smart;
  }

  .picker-upload {
    grid-area: upload;
  }

  .advanced-input {
    grid-area: input;
    min-width: 0;
  }

  .picker-modal-body {
    min-width: 0;
  }

  .search-row {
    gap: 10px;
  }

  .translation-hint {
    margin-top: 8px;
  }

  .color-picker-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 10px;
    padding: 9px 10px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 58%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--resource-tag-color) 4%, var(--background-color));
  }

  .color-picker-label {
    flex: 0 0 auto;
  }

  .color-options {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  :deep(.color-option) {
    width: 26px;
    height: 26px;
    min-width: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--text-color);
  }

  :deep(.color-option.is-default) {
    width: auto;
    padding: 0 7px;
    gap: 5px;
  }

  :deep(.color-option--custom) {
    width: auto;
    padding: 0 7px;
    gap: 5px;
  }

  :deep(.color-option:hover) {
    background: var(--primary-btn-h-bg-color);
  }

  :deep(.color-option.selected) {
    border-color: color-mix(in srgb, var(--primary-color) 72%, transparent);
    background: color-mix(in srgb, var(--primary-color) 9%, var(--background-color));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 18%, transparent);
  }

  .color-dot {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    border: 1px solid color-mix(in srgb, var(--text-color) 18%, transparent);
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.34);
  }

  .color-dot--theme {
    border-color: color-mix(in srgb, var(--text-color) 28%, transparent);
    background: linear-gradient(135deg, #f8fafc 0 45%, #94a3b8 45% 55%, #1f2937 55% 100%);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.38),
      0 0 0 1px color-mix(in srgb, var(--background-color) 80%, transparent);
  }

  .color-dot--custom {
    background: conic-gradient(#ef4444, #f59e0b, #00a884, #2563eb, #615ced, #ec4899, #ef4444);
  }

  .color-dot--custom.has-custom-color {
    background: none;
  }

  .default-color-text,
  .custom-color-text {
    font-size: 11px;
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px;
    padding: 16px 0;
  }

  :deep(.icon-option) {
    width: 100%;
    height: 76px;
    padding: 8px 4px;
    flex-direction: column;
    gap: 7px;
    line-height: 1.1;
    overflow: hidden;
    color: var(--text-color);
  }

  :deep(.icon-option span) {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    color: var(--desc-color);
  }

  :deep(.icon-option.selected) {
    outline: 2px solid var(--resource-tag-color);
  }

  .empty-state {
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    color: var(--desc-color);
  }

  .empty-state strong {
    color: var(--text-color);
  }

  .picker-footer {
    min-height: 32px;
  }

  .picker-footer a {
    color: var(--resource-tag-color);
    font-size: 12px;
  }

  @media (max-width: 720px) {
    .picker-controls {
      grid-template-columns: 32px repeat(2, minmax(0, 1fr));
      grid-template-areas:
        'preview smart upload'
        'input input input';
    }

    :deep(.picker-smart),
    :deep(.picker-upload) {
      width: 100%;
    }

    .icon-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .search-row {
      align-items: stretch;
    }

    .color-picker-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 7px;
    }
  }
</style>

<style lang="less">
  /* BPopover 会 Teleport 到 body，取色浮层样式必须使用非 scoped 选择器。 */
  .tag-icon-color-popover {
    width: 224px;
    padding: 12px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 64%, transparent);
  }

  .tag-icon-color-picker {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tag-icon-color-plane {
    position: relative;
    width: 100%;
    height: 132px;
    overflow: hidden;
    border-radius: 9px;
    cursor: crosshair;
    touch-action: none;
    outline: none;
    background:
      linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, hsl(var(--picker-hue) 100% 50%));
  }

  .tag-icon-color-plane:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 24%, transparent);
  }

  .tag-icon-color-handle {
    position: absolute;
    width: 14px;
    height: 14px;
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-sizing: border-box;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  .tag-icon-hue-slider {
    width: 100%;
    height: 12px;
    margin: 0;
    border: 0;
    border-radius: 999px;
    appearance: none;
    cursor: pointer;
    background: linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);
  }

  .tag-icon-hue-slider::-webkit-slider-thumb {
    width: 16px;
    height: 16px;
    border: 2px solid #ffffff;
    border-radius: 50%;
    appearance: none;
    background: transparent;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
  }

  .tag-icon-hue-slider::-moz-range-thumb {
    width: 13px;
    height: 13px;
    border: 2px solid #ffffff;
    border-radius: 50%;
    background: transparent;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
  }

  .tag-icon-color-value {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tag-icon-color-preview {
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    border: 1px solid color-mix(in srgb, var(--text-color) 18%, transparent);
    border-radius: 8px;
  }

  .tag-icon-color-hex {
    min-width: 0;
    flex: 1;
  }
</style>
