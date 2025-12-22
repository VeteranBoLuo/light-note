// table-menu-plugin.ts
import { Boot } from '@wangeditor/editor';
import {
  insertColumnLeftBtn,
  insertColumnRightBtn,
  insertRowAboveBtn,
  insertRowBelowBtn,
} from '@/config/wangEditor/menu/tableMenu.ts';

export default function TableMenuPlugin() {
  Boot.registerMenu(insertRowAboveBtn);
  Boot.registerMenu(insertRowBelowBtn);
  Boot.registerMenu(insertColumnLeftBtn);
  Boot.registerMenu(insertColumnRightBtn);
}
