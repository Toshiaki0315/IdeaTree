import { ask } from "@tauri-apps/plugin-dialog";

/** 未保存の変更を破棄して続けてよいか、確認ダイアログで尋ねる（キャンセルなら false） */
export function confirmDiscard(): Promise<boolean> {
  return ask("保存していない変更があります。破棄して続けますか？", {
    title: "IdeaTree",
    kind: "warning",
    okLabel: "破棄して続ける",
    cancelLabel: "キャンセル",
  });
}
