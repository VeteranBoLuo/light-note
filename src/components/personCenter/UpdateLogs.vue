<template>
  <CommonContainer title="更新日志">
    <div
      style="color: white !important; height: 100%; overflow-y: auto"
      :style="{ padding: bookmark.isMobile ? '20px' : '20px 100px' }"
    >
      <a-timeline>
        <a-timeline-item color="#615ced" v-for="item in updateOptions"
          >{{ item.label }}
          <span style="font-size: 14px; color: #a0a0a0">{{ item.time }}</span>
          <div style="margin-bottom: -10px">
            <p v-for="(li, index) in item.list" style="font-size: 12px"> {{ index + 1 }}、{{ li }} </p>
          </div>
        </a-timeline-item>
      </a-timeline>
    </div>
  </CommonContainer>
</template>
<script lang="ts" setup>
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { bookmarkStore } from '@/store';
  const bookmark = bookmarkStore();
  const updateOptions = [
    {
      label: '功能优化',
      time: '2024-12-09',
      list: [
        '首页搜索书签功能新增可根据书签的关联标签查询',
        '标签的图标新增本地上传方式',
        '首页书签和标签新增右键快捷菜单',
      ],
    },
    {
      label: '新增主题切换功能',
      time: '2024-12-10',
    },
    {
      label: '新增帮助中心模块',
      time: '2024-12-13',
    },
    {
      label: '新增意见反馈模块',
      time: '2024-12-17',
    },
    {
      label: '新增「笔记」模块，优化项目性能',
      time: '2025-01-24',
      list: [
        '引入全新的笔记模块，用户现在可以在应用内轻松创建、编辑和管理个人笔记;支持富文本编辑器；允许用户添加格式化文本、图片和列表',
        '新增标签系统，方便用户对笔记进行分类和搜索',
        '优化数据加载机制，减少初始加载时间和内存占用；增加缓存策略，加速重复操作的响应速度',
      ],
    },
    {
      label: '书签模块首页左侧标签列表新增拖拽排序功能',
      time: '2025-03-28',
    },
    {
      label: '笔记模块体验优化',
      time: '2025-05-12',
      list: [
        '笔记新增小屏幕页面专用目录弹窗',
        '笔记管理新增标签过滤功能',
        '笔记模块核心编辑器由tinymce替换为wangeditor ',
        '笔记可导出为PDF文件',
      ],
    },
    {
      label: '意见反馈新增反馈历史模块',
      time: '2025-05-30',
    },
    {
      label: '笔记模块体验优化',
      time: '2025-06-11',
      list: ['编辑器的表格新增从当前单元格左侧/右侧插入列以及从上方和下方插入行、全选等快捷菜单', '新增批量删除笔记'],
    },
    {
      label: '体验优化',
      time: '2025-06-23',
      list: ['新增笔记搜索功能', '首页书签搜索框移至右上角，更符合大众操作习惯', '优化首页加载动画'],
    },
    {
      label: '体验优化',
      time: '2025-6-25',
      list: [
        '主题切换组件重构，新增支持跟随系统变化',
        '书签和标签的新增和管理入口统一放置在顶部导航栏右侧区域',
        '表格样式优化',
      ],
    },
    {
      label: '新增「云空间模块」',
      time: '2025-6-30',
      list: [
        '支持用户上传文件至云端空间，实现跨设备数据存储与访问，兼容移动端与桌面端操作体验',
        '引入用户配额管理机制，每位用户暂时默认可使用最大 500MB 存储空间，并提供空间使用状态展示组件',
        '完善权限控制逻辑，确保用户仅能访问自身上传的文件资源',
        '支持按文件类型和文件夹两个维度管理文件',
      ],
    },
    {
      label: '扩展可通过github账号登录平台',
      time: '2025-7-9',
    },
    {
      label: '体验优化',
      time: '2025-7-16',
      list: ['更新网站图标', '云空间新增支持pdf、视频文件的预览', '修复了一些bug'],
    },
  ];
</script>

<style lang="less" scoped>
  :deep(.ant-timeline .ant-timeline-item-tail) {
    background-color: var(--timeline-line-bg-color);
  }
  ::-webkit-scrollbar {
    width: 10px;
  }
</style>
