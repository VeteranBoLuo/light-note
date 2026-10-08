// 完整词典供测试、独立入口与工具使用；应用启动只加载 core。
import core from './en-US-core';
import serverManagement from './en-US-serverManagement';
export default { ...core, serverManagement };
