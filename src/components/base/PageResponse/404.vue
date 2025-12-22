<template>
  <div
    class="both-center"
    style="margin-top: -200px; display: flex; flex-direction: column; gap: 30px; align-items: center"
  >
    <div
      style="
        height: 200px;
        width: 200px;
        border-radius: 50%;
        border: 5px solid #ccc;
        display: grid;
        place-items: center;
        color: #ccc;
        font-size: 50px;
      "
    >
      404
    </div>
    <b style="color: #ccc"> 温馨提示：您访问的地址不存在！</b>
    <a @click="goBack" style="cursor: pointer"> 返回</a>
  </div>
</template>

<script setup>
  import { useRouter } from 'vue-router';

  const router = useRouter();

  const goBack = () => {
    router.go(-1);
  };
</script>
