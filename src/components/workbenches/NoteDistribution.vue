<template>
  <workbenches-card title="主要笔记构成">
    <div id="NoteDistribution" style="height: calc(100% - 30px); width: 100%"> </div>
  </workbenches-card>
</template>

<script lang="ts" setup>
  import { onMounted, ref, watch } from 'vue';
  import { Bar } from '@antv/g2plot';
  import WorkbenchesCard from '@/components/workbenches/WorkbenchesCard.vue';
  import { bookmarkStore } from '@/store';
  import { cloneDeep } from 'lodash-es';

  const bookmark = bookmarkStore();
  const props = defineProps<{ isReady: boolean }>();
  const barPlot = ref();

  // 处理数据，统计每个标签下的笔记数量和笔记列表
  function processNoteData(notes) {
    const tagMap = new Map();
    const noTagNotes = []; // 存储无标签笔记

    // 添加"无标签"分类
    tagMap.set('无标签笔记', {
      count: 0,
      notes: [],
    });

    notes.forEach((note) => {
      try {
        const tags = JSON.parse(note.tags || '[]');

        if (tags.length === 0) {
          // 无标签笔记处理
          tagMap.get('无标签笔记').count++;
          tagMap.get('无标签笔记').notes.push({
            title: note.title,
            content: note.content.replace(/<[^>]+>/g, '').substring(0, 50) + '...',
          });
        } else {
          // 有标签笔记处理
          tags.forEach((tag) => {
            if (!tagMap.has(tag)) {
              tagMap.set(tag, {
                count: 0,
                notes: [],
              });
            }
            tagMap.get(tag).count++;
            tagMap.get(tag).notes.push({
              title: note.title,
              content: note.content.replace(/<[^>]+>/g, '').substring(0, 50) + '...',
            });
          });
        }
      } catch (e) {
        console.error('解析标签失败:', e);
        // 解析失败的也归为无标签
        tagMap.get('无标签笔记').count++;
        tagMap.get('无标签笔记').notes.push({
          title: note.title,
          content: note.content.replace(/<[^>]+>/g, '').substring(0, 50) + '...',
        });
      }
    });

    // 转换为图表需要的数据格式
    return Array.from(tagMap.entries()).map(([tag, data]) => ({
      tag,
      count: data.count,
      notes: data.notes,
    }));
  }

  function init() {
    if (barPlot.value) {
      barPlot.value.destroy();
    }

    const rawData = cloneDeep(bookmark.noteList);
    const processedData = processNoteData(rawData)
      .sort((a, b) => b.notes.length - a.notes.length)
      .slice(0, 10);

    barPlot.value = new Bar('NoteDistribution', {
      data: processedData,
      xField: 'count',
      yField: 'tag',
      seriesField: 'tag',
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
        customContent: (title, items) => {
          const currentItem = items[0]?.data;
          if (!currentItem) return title;

          // 获取当前标签的笔记列表
          const notes = currentItem.notes || [];

          // 构建自定义提示内容
          let html = `<div style="margin-bottom: 8px; font-weight: bold">标签: ${title}</div>`;
          html += `<div style="margin-bottom: 4px;">笔记数量: ${currentItem.count}</div>`;
          html += `<div style="max-height: 700px;overflow: hidden;">`;

          if (notes.length > 0) {
            notes.forEach((note, index) => {
              html += `<div style="padding: 4px 0; border-bottom: 1px solid #eee; font-size: 12px;">
                        <div style="font-weight: 500;">${index + 1}. ${note.title}</div>
                        <div style="color: #999;margin-top: 5px;line-height: 1rem">${note.content}</div>
                      </div>`;
            });
          } else {
            html += `<div>暂无笔记</div>`;
          }

          html += `</div>`;
          return html;
        },
        domStyles: {
          'g2-tooltip': {
            background: 'var(--menu-container-bg-color)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            borderRadius: '4px',
            padding: '12px',
            color: 'var(--text-color)',
            maxWidth: '400px',
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
      meta: {
        tag: {
          alias: '标签',
        },
        count: {
          alias: '笔记数量',
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
    { immediate: true },
  );
</script>

<style lang="less" scoped></style>
