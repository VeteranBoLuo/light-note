<template>
  <workbenches-card title="主要书签分布">
    <div id="BookmarkDistribution" style="height: calc(100% - 30px); width: 100%"> </div>
  </workbenches-card>
</template>

<script lang="ts" setup>
  import { onMounted, ref, watch } from 'vue';
  import { Bar } from '@antv/g2plot';
  import WorkbenchesCard from '@/components/workbenches/WorkbenchesCard.vue';
  import { bookmarkStore } from '@/store';
  const userId = localStorage?.getItem('userId');
  const bookmarkData = ref([]);
  const bookmark = bookmarkStore();
  const props = defineProps<{ isReady: boolean }>();
  const barPlot = ref();
  function init() {
    if (barPlot.value) {
      barPlot.value.destroy();
    }
    bookmarkData.value = bookmark.tagList.map((data) => {
      return {
        type: data.name,
        value: data.bookmarkList.length ?? 0,
        bookmarkList: data.bookmarkList, // 保留书签列表数据
      };
    });
    bookmarkData.value = bookmarkData.value.sort((a, b) => b.bookmarkList.length - a.bookmarkList.length).slice(0, 10);
    barPlot.value = new Bar('BookmarkDistribution', {
      data: bookmarkData.value,
      xField: 'value',
      seriesField: 'type',
      yField: 'type',
      legend: {
        position: 'top-left',
        itemName: {
          style: {
            fill: '#888888', // 使用主题文本颜色
          },
        },
      },
      color: [
        '#688FF4',
        '#FFA453',
        '#FFCC00',
        '#FF6E6E',
        '#9066ED',
        '#C568E9',
        '#FF82BD',
        '#62C4F4',
        '#C8A3FF',
        '#BECBFF',
      ],
      tooltip: {
        // 新增tooltip配置[1,6](@ref)
        customContent: (title, items) => {
          const currentItem = items[0]?.data;
          if (!currentItem) return title;

          // 获取当前标签的书签列表[3](@ref)
          const bookmarks = currentItem.bookmarkList || [];

          // 构建自定义提示内容
          let html = `<div style="margin-bottom: 8px; font-weight: bold">标签: ${title}</div>`;
          html += `<div style="margin-bottom: 4px;">书签数量: ${bookmarks.length ?? 0}</div>`;

          if (bookmarks.length > 0) {
            bookmarks.forEach((bookmark) => {
              html += `<div style="padding: 4px 0;">
                          • ${bookmark.name || bookmark.url}
                         </div>`;
            });
          } else {
            html += `<div>暂无书签</div>`;
          }

          html += `</div>`;
          return html;
        },
        domStyles: {
          // 自定义样式[8](@ref)
          'g2-tooltip': {
            background: 'var(--menu-container-bg-color)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            borderRadius: '4px',
            padding: '12px',
            color: 'var(--text-color)',
          },
        },
      },
      label: {
        position: 'right',
        style: {
          fill: '#FFFFFF',
          opacity: 0.6,
        },
      },
      xAxis: {
        label: {
          autoHide: true,
          autoRotate: false,
        },
      },
      meta: {
        type: {
          alias: '标签',
        },
        sales: {
          alias: '书签',
        },
      },
    });
    barPlot.value.render();
  }

  watch(
    () => props.isReady,
    (val) => {
      if (val) {
        init();
      }
    },
  );
</script>

<style lang="less" scoped></style>
