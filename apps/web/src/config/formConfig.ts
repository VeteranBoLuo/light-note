export interface BaseFormItem {
  name: string;
  label: string;
  type?:
    | 'select'
    | 'input'
    | 'textarea'
    | 'datepicker'
    | 'timepicker'
    | 'checkbox'
    | 'radio'
    | 'switch'
    | 'slider'
    | 'rate'
    | 'upload'
    | 'editor'
    | 'cascader'
    | 'treeSelect'
    | 'transfer'
    | 'divider'
    | 'grid'
    | 'array'
    | 'dynamic'
    | 'blank';
  options?: { label: string; value: any }[];
  render?: any;
  disabled?: boolean;
  hide?: boolean;
  required?: boolean;
  rules?: any[];
  placeholder?: string;
  [key: string]: any;
}
