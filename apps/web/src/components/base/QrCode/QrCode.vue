<template>
  <div style="border: 1px solid #ccc; width: max-content">
    <canvas ref="qrcode"></canvas>
  </div>
</template>

<script setup>
  import { ref, onMounted, watch } from 'vue';
  import QRCode from '@/components/base/QrCode/QrCode.vue';

  const props = defineProps({
    value: {
      type: String,
      required: true,
      default: 'null',
    },
    size: {
      type: Number,
      default: 200,
    },
    level: {
      type: String,
      default: 'M',
      validator: (value) => ['L', 'M', 'Q', 'H'].includes(value),
    },
  });

  const qrcode = ref(null);

  const generateQrCode = () => {
    if (qrcode.value) {
      QRCode.toCanvas(
        qrcode.value,
        props.value,
        {
          width: props.size,
          errorCorrectionLevel: props.level,
        },
        (error) => {
          if (error) console.error(error);
        },
      );
    }
  };

  onMounted(generateQrCode);

  watch(() => props.value, generateQrCode);
  watch(() => props.size, generateQrCode);
  watch(() => props.level, generateQrCode);
</script>
<style></style>
