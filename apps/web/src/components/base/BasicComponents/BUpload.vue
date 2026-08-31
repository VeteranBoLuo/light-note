<template>
  <div
    v-if="!triggerless"
    class="b-upload-trigger"
    :class="{ 'is-disabled': disabled, 'is-block': block }"
    :tabindex="hasDefaultSlot ? undefined : disabled ? -1 : 0"
    :role="hasDefaultSlot ? undefined : 'button'"
    :aria-label="hasDefaultSlot ? undefined : ariaLabel || t('cloudSpace.uploadFile')"
    :aria-disabled="hasDefaultSlot ? undefined : disabled || undefined"
    @click="handleUpload"
    @keydown.enter="onTriggerKeydown"
    @keydown.space="onTriggerKeydown"
  >
    <slot name="default">
      <div class="b-upload-default-card flex-center dom-hover">
        <svg-icon size="30" :src="icon.file_upload" />
      </div>
    </slot>
  </div>
  <!--
    原生文件输入是 BUpload 与系统文件选择器交互的底层能力。
    持久挂载到 body，避免部分 Android 厂商浏览器无法向临时、未挂载的 input 回传选择结果。
  -->
  <Teleport to="body">
    <input
      ref="nativeInput"
      class="b-upload-native-input"
      type="file"
      :accept="normalizedAccept || undefined"
      :multiple="multiple"
      :webkitdirectory="directory || undefined"
      tabindex="-1"
      aria-hidden="true"
      @change="handleFileChange"
      @cancel="resetNativeInput"
    />
  </Teleport>
</template>

<script lang="ts" setup>
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { useI18n } from 'vue-i18n';
  import { computed, ref, useSlots } from 'vue';

  const { t } = useI18n();
  const slots = useSlots();
  // 有自定义插槽(内层通常已是 BButton/原生 button)时,外层不再充当按钮:
  // 否则出现双 Tab 停靠、role=button 内嵌 button 的非法嵌套、以及 Enter 双触发。
  const hasDefaultSlot = computed(() => Boolean(slots.default));
  const emit = defineEmits(['change']);

  const props = withDefaults(
    defineProps<{
      accept?: string;
      multiple: boolean;
      // null 表示不在文件选择器层设置固定上限，由业务层按动态配额统一校验。
      maxTotalSize?: number | null;
      // 直传场景(如云空间→OBS)开启:图片也按原始 File 透传,不转 Base64。
      // 默认 false 保持旧行为({isImg, file: base64}),避免影响依赖 Base64 预览的调用方(如意见反馈)。
      rawFile?: boolean;
      disabled?: boolean;
      ariaLabel?: string;
      // 横向铺满父容器，供整行拖拽区、移动端操作入口等场景使用。
      block?: boolean;
      // 业务通过组件 ref.open() 唤起文件选择器时，不渲染默认上传卡片。
      triggerless?: boolean;
      // 目录批处理（如 Markdown 知识库检查）。仍由 BUpload 统一管理原生文件控件与移动端兼容。
      directory?: boolean;
    }>(),
    {
      accept: '',
      multiple: false,
      maxTotalSize: 10 * 1024 * 1024,
      rawFile: false,
      disabled: false,
      ariaLabel: '',
      block: false,
      triggerless: false,
      directory: false,
    }, // 默认总大小限制为10MB
  );
  const nativeInput = ref<HTMLInputElement | null>(null);
  // accept="*" 不是合法的文件类型说明符。兼容存量调用，将它视为“不限制类型”。
  const normalizedAccept = computed(() => {
    const accept = props.accept.trim();
    return accept === '*' ? '' : accept;
  });
  // 有插槽时,键盘由内层控件自理(内层 button 的 Enter 会原生触发 click 并冒泡到外层 @click),
  // 外层不重复处理,避免 Enter 双触发;仅无插槽的默认按钮态由外层承担键盘。
  function onTriggerKeydown(event: KeyboardEvent) {
    if (hasDefaultSlot.value) return;
    event.preventDefault();
    handleUpload();
  }

  function handleUpload() {
    if (props.disabled) return;
    resetNativeInput();
    nativeInput.value?.click();
  }

  function resetNativeInput() {
    if (nativeInput.value) nativeInput.value.value = '';
  }

  function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // File 对象已复制出来，可以立即清空 input，确保再次选择同一文件仍会触发 change。
    resetNativeInput();
    if (files.length === 0) return;

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    // 检查总文件大小是否超过指定限制
    if (props.maxTotalSize !== null && totalSize > props.maxTotalSize) {
      message.warning(t('common.maxTotalSize', { n: props.maxTotalSize / (1024 * 1024) }));
      return;
    }

    // 直传模式:直接透传原始 File,不走 FileReader/Base64(大图/多图不再卡顿)
    if (props.rawFile) {
      emit('change', files);
      return;
    }

    const result: Array<
      | File
      | {
          isImg: true;
          fileName: string;
          file: string | ArrayBuffer | null;
          size: number;
        }
    > = [];
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = function (e) {
        if (file.type.startsWith('image/')) {
          result.push({
            isImg: true,
            fileName: file.name,
            file: e.target?.result ?? null,
            size: totalSize,
          }); // 图片文件转换为 Base64 字符串
        } else {
          result.push(file); // 非图片文件返回原始文件数据
        }
        if (result.length === files.length) {
          emit('change', result); // 当所有文件处理完成后，返回结果数组
        }
      };
      reader.onerror = function (error) {
        console.error('Error reading file:', error);
      };
      reader.readAsDataURL(file);
    }
  }

  defineExpose({ open: handleUpload });
</script>

<style lang="less" scoped>
  .b-upload-trigger {
    width: max-content;
    border-radius: 8px;

    &.is-block {
      display: block;
      width: 100%;
    }

    &:focus-visible {
      outline: 2px solid var(--primary-color, #615ced);
      outline-offset: 2px;
    }

    &.is-disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }

  .b-upload-native-input {
    position: fixed;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  .b-upload-default-card {
    width: 80px;
    height: 80px;
    color: #6c7074;
    border: 1px dashed var(--surface-border-color, #ccc);
    border-radius: 8px;
    background: var(--surface-panel-bg, #f5f5f5);
  }
</style>
