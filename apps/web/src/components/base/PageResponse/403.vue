<template>
  <div style="height: 100%; width: 100%; display: grid; place-items: center">
    <div style="margin-top: -200px; display: flex; flex-direction: column; gap: 30px; align-items: center">
      <div
        style="
          height: 200px;
          width: 200px;
          border-radius: 50%;
          border: 10px solid orange;
          display: grid;
          place-items: center;
          color: orange;
          font-size: 50px;
        "
      >
        403
      </div>
      <b style="color: orange">无访问权限</b>
      <a @click="goBack" style="cursor: pointer">返回</a>
    </div>
  </div>
</template>

<script setup>
  import { useRouter } from 'vue-router';

  const router = useRouter();

  const goBack = () => {
    router.go(-2);
  };
</script>
