import { IDomEditor, DomEditor, SlateEditor } from '@wangeditor/editor';
import { Transforms } from 'slate';
import icon from '@/config/icon.ts';
import type { IButtonMenu } from '@wangeditor/core';

export const insertRowAboveBtn = {
  key: 'insertRowAbove',
  factory() {
    return new (class WangEditorInsertRowAboveMenu implements IButtonMenu {
      readonly tag = 'button';
      readonly title = '在上方插入行';
      readonly iconSvg = icon.noteDetail.table_insert_top;

      getValue(editor: IDomEditor): string | boolean {
        return 'insertRowAbove';
      }

      isActive(editor: IDomEditor): boolean {
        return false;
      }

      isDisabled(editor: IDomEditor): boolean {
        // 当不在表格内时禁用按钮
        const [cellEntry] = SlateEditor.nodes(editor, {
          match: (n) => DomEditor.checkNodeType(n, 'table-cell'),
          universal: true,
        });
        return !cellEntry;
      }

      exec(editor: IDomEditor) {
        if (this.isDisabled(editor)) return;

        // 1. 获取当前选中的单元格
        const [cellEntry] = SlateEditor.nodes(editor, {
          match: (n) => DomEditor.checkNodeType(n, 'table-cell'),
          universal: true,
        });
        const [selectedCellNode, selectedCellPath] = cellEntry;

        // 2. 获取当前行和行路径
        const rowNode = DomEditor.getParentNode(editor, selectedCellNode);
        if (!rowNode) return;
        const rowPath = DomEditor.findPath(editor, rowNode);

        // 3. 获取表格节点
        const tableNode = DomEditor.getParentNode(editor, rowNode);
        if (!tableNode) return;
        const tablePath = DomEditor.findPath(editor, tableNode);

        // 4. 找出当前选中单元格是第几列（根据 path 的最后一个索引）
        const colIndex = selectedCellPath[selectedCellPath.length - 1];

        // 5. 创建新行（复制当前行的结构）
        const newRow = {
          type: 'table-row',
          children: rowNode.children.map((cell: any) => ({
            type: 'table-cell',
            children: [{ text: '' }], // 创建空单元格
          })),
        };

        // 6. 在当前行上方插入新行
        SlateEditor.withoutNormalizing(editor, () => {
          // 在行路径位置插入新行
          Transforms.insertNodes(editor, newRow, {
            at: rowPath,
          });

          // 7. 移动光标到新行的与当前单元格同列的位置
          const newRowPath = [...rowPath]; // 新插入行的路径
          const newCellPath = [...newRowPath, colIndex, 0]; // 新插入行中对应列的文本节点路径

          const range = {
            anchor: { path: newCellPath, offset: 0 },
            focus: { path: newCellPath, offset: 0 },
          };

          // 使用 Transforms.select 设置光标位置
          Transforms.select(editor as any, range);
        });
      }
    })();
  },
};

export const insertRowBelowBtn = {
  key: 'insertRowBelow',
  factory() {
    return new (class WangEditorInsertRowBelowMenu implements IButtonMenu {
      readonly tag = 'button';
      readonly title = '在下方插入行';
      readonly iconSvg = icon.noteDetail.table_insert_bottom;

      getValue(editor: IDomEditor): string | boolean {
        return 'insertRowBelow'; // 修改返回值
      }

      isActive(editor: IDomEditor): boolean {
        return false;
      }

      isDisabled(editor: IDomEditor): boolean {
        // 当不在表格内时禁用按钮
        const [cellEntry] = SlateEditor.nodes(editor, {
          match: (n) => DomEditor.checkNodeType(n, 'table-cell'),
          universal: true,
        });
        return !cellEntry;
      }

      exec(editor: IDomEditor) {
        if (this.isDisabled(editor)) return;

        // 1. 获取当前选中的单元格
        const [cellEntry] = SlateEditor.nodes(editor, {
          match: (n) => DomEditor.checkNodeType(n, 'table-cell'),
          universal: true,
        });
        const [selectedCellNode, selectedCellPath] = cellEntry;

        // 2. 获取当前行和行路径
        const rowNode = DomEditor.getParentNode(editor, selectedCellNode);
        if (!rowNode) return;
        const rowPath = DomEditor.findPath(editor, rowNode);

        // 3. 获取表格节点
        const tableNode = DomEditor.getParentNode(editor, rowNode);
        if (!tableNode) return;
        const tablePath = DomEditor.findPath(editor, tableNode);

        // 4. 找出当前选中单元格是第几列（根据 path 的最后一个索引）
        const colIndex = selectedCellPath[selectedCellPath.length - 1];

        // 5. 创建新行（复制当前行的结构）
        const newRow = {
          type: 'table-row',
          children: rowNode.children.map((cell: any) => ({
            type: 'table-cell',
            children: [{ text: '' }], // 创建空单元格
          })),
        };

        // 6. 在当前行下方插入新行（关键修改）
        SlateEditor.withoutNormalizing(editor, () => {
          // 计算插入位置：当前行的下一行
          const insertPath = [...rowPath];
          insertPath[insertPath.length - 1] += 1;

          // 在计算出的位置插入新行
          Transforms.insertNodes(editor, newRow, {
            at: insertPath,
          });

          // 7. 移动光标到新行的与当前单元格同列的位置
          const newRowPath = insertPath; // 新插入行的路径
          const newCellPath = [...newRowPath, colIndex, 0]; // 新插入行中对应列的文本节点路径

          const range = {
            anchor: { path: newCellPath, offset: 0 },
            focus: { path: newCellPath, offset: 0 },
          };

          // 使用 Transforms.select 设置光标位置
          Transforms.select(editor as any, range);
        });
      }
    })();
  },
};

export const insertColumnLeftBtn = {
  key: 'insertColumnLeft',
  factory() {
    return new (class WangEditorInsertColumnLeftMenu implements IButtonMenu {
      readonly tag = 'button';
      readonly title = '在左侧插入列';
      readonly iconSvg = icon.noteDetail.table_insert_left;

      getValue(editor: IDomEditor): string | boolean {
        return 'insertColumnLeft';
      }

      isActive(editor: IDomEditor): boolean {
        return false;
      }

      isDisabled(editor: IDomEditor): boolean {
        // 当不在表格内时禁用按钮
        const [cellEntry] = SlateEditor.nodes(editor, {
          match: (n) => DomEditor.checkNodeType(n, 'table-cell'),
          universal: true,
        });
        return !cellEntry;
      }

      exec(editor: IDomEditor) {
        if (this.isDisabled(editor)) return;

        // 1. 获取当前选中的单元格
        const [cellEntry] = SlateEditor.nodes(editor, {
          match: (n) => DomEditor.checkNodeType(n, 'table-cell'),
          universal: true,
        });
        const [selectedCellNode, selectedCellPath] = cellEntry;

        // 2. 获取当前行和行路径
        const rowNode = DomEditor.getParentNode(editor, selectedCellNode);
        if (!rowNode) return;
        const rowPath = DomEditor.findPath(editor, rowNode);

        // 3. 获取表格节点
        const tableNode = DomEditor.getParentNode(editor, rowNode);
        if (!tableNode) return;
        const tablePath = DomEditor.findPath(editor, tableNode);

        // 4. 找出当前选中单元格是第几列（根据 path 的最后一个索引）
        const colIndex = selectedCellPath[selectedCellPath.length - 1];

        // 5. 遍历表格中的每一行，在指定列位置插入新单元格
        SlateEditor.withoutNormalizing(editor, () => {
          for (let i = 0; i < tableNode.children.length; i++) {
            const currentRow = tableNode.children[i];
            const currentRowPath = [...tablePath, i];

            // 创建新的单元格
            const newCell = {
              type: 'table-cell',
              children: [{ text: '' }],
            };

            // 在当前列位置插入新单元格
            Transforms.insertNodes(editor, newCell, {
              at: [...currentRowPath, colIndex],
            });
          }

          // 6. 移动光标到当前行、新列的第一个单元格内部
          // 确保使用的是原始选中的单元格所在行的路径
          const newRowPath = [...rowPath]; // 使用原始选中的单元格所在的行路径
          const newCellPath = [...newRowPath, colIndex]; // 新插入的单元格路径
          const newTextNodePath = [...newCellPath, 0]; // 文本节点路径

          const range = {
            anchor: { path: newTextNodePath, offset: 0 },
            focus: { path: newTextNodePath, offset: 0 },
          };

          // 使用 Transforms.select 设置光标位置
          Transforms.select(editor as any, range);
        });
      }
    })();
  },
};

export const insertColumnRightBtn = {
  key: 'insertColumnRight',
  factory() {
    return new (class WangEditorInsertColumnRightMenu implements IButtonMenu {
      readonly tag = 'button';
      readonly title = '在右侧插入列';
      readonly iconSvg = icon.noteDetail.table_insert_right;

      getValue(editor: IDomEditor): string | boolean {
        return 'insertColumnRight';
      }

      isActive(editor: IDomEditor): boolean {
        return false;
      }

      isDisabled(editor: IDomEditor): boolean {
        // 当不在表格内时禁用按钮
        const [cellEntry] = SlateEditor.nodes(editor, {
          match: (n) => DomEditor.checkNodeType(n, 'table-cell'),
          universal: true,
        });
        return !cellEntry;
      }

      exec(editor: IDomEditor) {
        if (this.isDisabled(editor)) return;

        // 1. 获取当前选中的单元格
        const [cellEntry] = SlateEditor.nodes(editor, {
          match: (n) => DomEditor.checkNodeType(n, 'table-cell'),
          universal: true,
        });
        const [selectedCellNode, selectedCellPath] = cellEntry;

        // 2. 获取当前行和行路径
        const rowNode = DomEditor.getParentNode(editor, selectedCellNode);
        if (!rowNode) return;
        const rowPath = DomEditor.findPath(editor, rowNode);

        // 3. 获取表格节点
        const tableNode = DomEditor.getParentNode(editor, rowNode);
        if (!tableNode) return;
        const tablePath = DomEditor.findPath(editor, tableNode);

        // 4. 找出当前选中单元格是第几列（根据 path 的最后一个索引）
        const colIndex = selectedCellPath[selectedCellPath.length - 1];

        // 5. 遍历表格中的每一行，在当前列的右侧插入新单元格
        SlateEditor.withoutNormalizing(editor, () => {
          for (let i = 0; i < tableNode.children.length; i++) {
            const currentRow = tableNode.children[i];
            const currentRowPath = [...tablePath, i];

            // 创建新的单元格
            const newCell = {
              type: 'table-cell',
              children: [{ text: '' }],
            };

            // 在当前列右侧插入新单元格
            Transforms.insertNodes(editor, newCell, {
              at: [...currentRowPath, colIndex + 1],
            });
          }

          // 6. 移动光标到当前行、新列的第一个单元格内部
          // 确保使用的是原始选中的单元格所在行的路径
          const newRowPath = [...rowPath]; // 使用原始选中的单元格所在的行路径
          const newCellPath = [...newRowPath, colIndex + 1]; // 新插入的单元格路径
          const newTextNodePath = [...newCellPath, 0]; // 文本节点路径

          const range = {
            anchor: { path: newTextNodePath, offset: 0 },
            focus: { path: newTextNodePath, offset: 0 },
          };

          // 使用 Transforms.select 设置光标位置
          Transforms.select(editor as any, range);
        });
      }
    })();
  },
};
