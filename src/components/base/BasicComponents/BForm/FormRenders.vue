<script lang="tsx">
  import { BaseOptions } from '@/config/bookmarkCfg.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  const user = useUserStore();
  const bookmark = bookmarkStore();

  export function SelectionSearch(value: string, option: { label: string; value: any }) {
    if (option.label.toUpperCase().indexOf(value.toUpperCase()) > -1) {
      return true;
    }
    return option.value.toUpperCase().indexOf(value.toUpperCase()) > -1;
  }
  function genSelector(
    options: BaseOptions[],
    mode: 'multiple' | 'tags' | 'combobox' = 'combobox',
    placeholder = '请选择',
    dropdownMatchSelectWidth = false,
  ) {
    return (
      <a-select
        filterOption={SelectionSearch}
        mode={mode}
        options={options}
        dropdownMatchSelectWidth={dropdownMatchSelectWidth}
        placeholder={placeholder}
        showSearch={true}
        allowClear={true}
        virtual={false}
      ></a-select>
    );
  }

  const render = {
    // 基础下拉框
    getSelector(options: BaseOptions[], mode: 'multiple' | 'tags' | 'combobox' = 'combobox', placeholder = '请选择') {
      return genSelector(options, mode, placeholder);
    },

    // 标签列表
    getTagSelector(outId?) {
      let options = [];
      bookmark.tagList.forEach((tag) => {
        if (tag.id !== outId) {
          options.push({
            label: tag.name,
            value: tag.id,
          });
        }
      });
      return genSelector(options, 'multiple', '请选择');
    },

    roleSelector() {
      const options = [
        {
          label: 'root',
          value: 'root',
        },
        {
          label: 'admin',
          value: 'admin',
        },
        {
          label: 'visitor',
          value: 'visitor',
        },
      ];
      return genSelector(options, null, '请选择');
    },
  };
  export default render;
</script>
