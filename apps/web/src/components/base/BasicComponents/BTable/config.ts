export interface Column {
  key: string; // 唯一标识
  title: string; // 列标题
  width?: number | string; // 可选宽度
  align?: 'left' | 'center' | 'right'; // 对齐方式
  sortable?: boolean; // 排序支持
  ellipsis?: boolean; // 是否显示省略+tooltip，默认 true
  overflowVisible?: boolean; // 允许头像框等装饰绘制到单元格外，默认仍裁剪
  // 其他自定义属性（如格式化函数）
  formatter?: (value: any) => string;
}
