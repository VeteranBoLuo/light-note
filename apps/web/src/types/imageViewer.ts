export interface ImageViewerItem {
  /** 同一组图片内稳定且唯一的标识。 */
  id: string;
  src: string;
  alt?: string;
  fileName?: string;
  /** 已知尺寸可让加载阶段先稳定布局；最终仍以图片 load 事件读到的尺寸为准。 */
  width?: number;
  height?: number;
}

export interface GlobalImageViewerOptions {
  /** 默认展示完整工具栏；显式传 false 时只保留查看与关闭。 */
  toolbar?: boolean;
  /** 是否允许保存当前图片。 */
  download?: boolean;
  /** 可选的可见标题；无论是否传入，弹框始终保留可访问名称。 */
  title?: string;
  alt?: string;
}
