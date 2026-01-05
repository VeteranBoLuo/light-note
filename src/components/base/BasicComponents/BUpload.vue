<template>
  <div @click="handleUpload" style="width: max-content">
    <slot name="default">
      <div
        style="width: 80px; height: 80px; color: #6c7074; border-radius: 8px"
        :style="{
          backgroundColor: user.preferences.theme === 'day' ? '#F5F5F5' : '#333333',
          border: user.preferences.theme === 'day' ? '1px dashed #ccc' : '',
        }"
        class="flex-center dom-hover"
      >
        <svg-icon size="30" :src="icon.file_upload" />
      </div>
    </slot>
  </div>
</template>

<script lang="ts" setup>
  import { message } from 'ant-design-vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore, useUserStore } from '@/store';

  const emit = defineEmits(['change']);

  const props = withDefaults(
    defineProps<{
      accept?: string;
      multiple: boolean;
      maxTotalSize?: number;
    }>(),
    {
      accept: '*',
      multiple: false,
      maxTotalSize: 10 * 1024 * 1024,
    }, // 默认总大小限制为10MB
  );
  const bookmark = bookmarkStore();
  const user = useUserStore();
  function handleUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = props.accept;
    input.multiple = props.multiple;
    input.addEventListener('change', function (event: any) {
      const files = event.target.files;
      let totalSize = 0;
      const result = [];
      for (let i = 0; i < files.length; i++) {
        totalSize += files[i].size;
      }
      // 检查总文件大小是否超过指定限制
      if (totalSize > props.maxTotalSize) {
        message.warning('总文件大小不能超过' + props.maxTotalSize / (1024 * 1024) + 'MB');
        return; // 如果总文件大小过大，终止函数执行
      }
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file) {
          const reader = new FileReader();
          reader.onload = function (e) {
            if (file.type.startsWith('image/')) {
              result.push({
                isImg: true,
                fileName: file.name,
                file: e.target.result,
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
    });
    input.click();
  }
</script>

<style lang="less" scoped></style>
