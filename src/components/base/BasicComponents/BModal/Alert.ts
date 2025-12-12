// 实现使用函数调用message组件的逻辑
//   引入 创建虚拟节点 和渲染方法
import { createVNode, render } from 'vue';
// 引入信息提示组件
import modal from './BAlert.vue';

// 准备dom容器
const div = document.createElement('div');
// 添加类名
div.setAttribute('class', 'alert-container');
// 添加到body上
document.body.appendChild(div);
let modalParams;
function sendInfo(params) {
  const { title, okText, cancelText, content, onOk, footer } = params;
  modalParams = params;
  const divs: any = document.getElementsByClassName('bAlert');
  if (divs.length > 0) {
    render(null, div);
  }
  // 创建虚拟节点   第一个参数为要创建的虚拟节点  第二个参数为props的参数
  const vNode = createVNode(modal, { title, okText, cancelText, content, footer });
  // 把虚拟节点渲染DOM容器中
  render(vNode, div);
}
function destroy() {
  render(null, div);
}
function onOk() {
  modalParams.onOk();
  destroy();
}
export default {
  alert(params: {
    title: string;
    okText?: string;
    cancelText?: string;
    content: string;
    onOk?: any;
    footer?: {
      label: string;
      type?: 'primary' | 'dashed' | 'success' | 'danger';
      function?: any;
    }[];
  }) {
    sendInfo(params);
  },
  destroy,
  onOk,
};
