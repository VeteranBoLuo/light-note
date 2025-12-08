<template>
  <div
    class="both-center"
    style="margin-top: -200px; display: flex; flex-direction: column; gap: 30px; align-items: center"
  >
    <div class="cube-loader">
      <div class="cube-top"></div>
      <div class="cube-wrapper">
        <span style="--i: 0" class="cube-span"></span>
        <span style="--i: 1" class="cube-span"></span>
        <span style="--i: 2" class="cube-span"></span>
        <span style="--i: 3" class="cube-span"></span>
      </div>
    </div>
    <b style="color: #ccc">{{ status === 200 ? 'github登录校验中...' : `登录失败，${time}秒后将会返回首页` }} </b>
    <a @click="goBack" style="cursor: pointer">返回</a>
  </div>
</template>

<script setup>
  import { onMounted, ref } from 'vue';
  import { useRouter } from 'vue-router';
  import { useUserStore } from '@/store';
  import { apiBasePost } from '@/http/request';
  import { message } from 'ant-design-vue';

  const router = useRouter();
  const user = useUserStore();
  const status = ref(200);
  const time = ref(3);
  function toHome() {
    router.push('/');
  }
  onMounted(async () => {
    try {
      let code = router.currentRoute.value.query.code;
      // 发送 code 给后端换取 Token
      const cRes = await apiBasePost('/api/user/github', { code });
      status.value = cRes.status;
      if (cRes.status === 200) {
        const { userInfo } = cRes.data;
        localStorage.setItem('userId', userInfo.id);
        toHome();
      } else {
        setInterval(() => {
          time.value = time.value - 1;
        }, 1000);
        setTimeout(() => {
          toHome();
        }, 2500);
      }
    } catch (e) {
      message.error(`github授权报错：${e}，请尝试重新授权或者通过账号密码手动登录`);
      status.value = 500;
      setInterval(() => {
        time.value = time.value - 1;
      }, 1000);
      setTimeout(() => {
        toHome();
      }, 2500);
    }
  });
  function goBack() {
    router.push('/');
  }
</script>
<style scoped>
  /* From Uiverse.io by andrew-demchenk0 */
  .cube-loader {
    bottom: 20px;
    position: relative;
    /* u can choose any size */
    width: 75px;
    height: 75px;
    transform-style: preserve-3d;
    transform: rotateX(-30deg);
    animation: animate 4s linear infinite;
  }

  @keyframes animate {
    0% {
      transform: rotateX(-30deg) rotateY(0);
    }

    100% {
      transform: rotateX(-30deg) rotateY(360deg);
    }
  }

  .cube-loader .cube-wrapper {
    position: absolute;
    width: 100%;
    height: 100%;
    /* top: 0;
  left: 0; */
    transform-style: preserve-3d;
  }

  .cube-loader .cube-wrapper .cube-span {
    position: absolute;
    width: 100%;
    height: 100%;
    /* top: 0;
  left: 0; */
    /* width 75px / 2 = 37.5px */
    transform: rotateY(calc(90deg * var(--i))) translateZ(37.5px);
    background: linear-gradient(
      to bottom,
      hsl(330, 3.13%, 25.1%) 0%,
      hsl(177.27, 21.71%, 32.06%) 5.5%,
      hsl(176.67, 34.1%, 36.88%) 12.1%,
      hsl(176.61, 42.28%, 40.7%) 19.6%,
      hsl(176.63, 48.32%, 43.88%) 27.9%,
      hsl(176.66, 53.07%, 46.58%) 36.6%,
      hsl(176.7, 56.94%, 48.91%) 45.6%,
      hsl(176.74, 62.39%, 50.91%) 54.6%,
      hsl(176.77, 69.86%, 52.62%) 63.4%,
      hsl(176.8, 76.78%, 54.08%) 71.7%,
      hsl(176.83, 83.02%, 55.29%) 79.4%,
      hsl(176.85, 88.44%, 56.28%) 86.2%,
      hsl(176.86, 92.9%, 57.04%) 91.9%,
      hsl(176.88, 96.24%, 57.59%) 96.3%,
      hsl(176.88, 98.34%, 57.93%) 99%,
      hsl(176.89, 99.07%, 58.04%) 100%
    );
  }

  .cube-top {
    position: absolute;
    width: 75px;
    height: 75px;
    background: hsl(330, 3.13%, 25.1%) 0%;
    /* width 75px / 2 = 37.5px */
    transform: rotateX(90deg) translateZ(37.5px);
    transform-style: preserve-3d;
  }

  .cube-top::before {
    content: '';
    position: absolute;
    /* u can choose any size */
    width: 75px;
    height: 75px;
    background: hsl(176.61, 42.28%, 40.7%) 19.6%;
    transform: translateZ(-90px);
    filter: blur(10px);
    box-shadow:
      0 0 10px #323232,
      0 0 20px hsl(176.61, 42.28%, 40.7%) 19.6%,
      0 0 30px #323232,
      0 0 40px hsl(176.61, 42.28%, 40.7%) 19.6%;
  }
</style>
