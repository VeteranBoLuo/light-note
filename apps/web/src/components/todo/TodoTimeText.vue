<template>
  <span class="todo-time-text"
    ><template v-for="(part, index) in parts" :key="index"
      ><template v-if="/^\s+$/.test(part.text)">{{ part.text }}</template
      ><span v-else class="todo-time-text__part"
        ><template v-for="(token, tokenIndex) in part.tokens" :key="tokenIndex"
          ><span v-if="/^\d+$/.test(token)" class="todo-time-text__number">{{ token }}</span
          ><template v-else>{{ token }}</template></template
        ></span
      ></template
    ></span
  >
</template>

<script setup lang="ts">
  import { computed } from 'vue';

  const props = defineProps<{ text: string }>();
  // 保留现有本地化文案，仅在日期、完整星期和时刻之间提供换行机会。
  const parts = computed(() =>
    props.text
      .split(/(（[^）]+）|\d{1,2}:\d{2}(?:[ \u00a0]?[AP]M)?|\s+)/u)
      .filter(Boolean)
      .map((text) => ({ text, tokens: text.split(/(\d+)/u).filter(Boolean) })),
  );
</script>

<style scoped>
  .todo-time-text {
    min-width: 0;
    max-width: 100%;
    font-variant-numeric: tabular-nums;
  }
  .todo-time-text__part {
    display: inline-block;
    white-space: nowrap;
  }
  /* 中文字体的数字未必支持 tnum，数字单独使用具有等宽数字的西文字体。 */
  .todo-time-text__number {
    font-family: Arial, sans-serif;
    font-variant-numeric: tabular-nums;
  }
</style>
