import { ask } from "@tauri-apps/plugin-dialog";

const two = (n: number) => String(n).padStart(2, "0");

/** ローカルの時刻を、「2026/10/14 08:05」の形にする */
function formatTime(date: Date): string {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/**
 * 保存されずに残っていた、前回の編集内容を、復元するかを、確認ダイアログで尋ねる。
 * 「復元する」なら true、「破棄する」なら false。
 */
export function confirmRestore(savedAt: Date, filePath: string | undefined): Promise<boolean> {
  const detail = [formatTime(savedAt), filePath?.split("/").pop()].filter(Boolean).join("、");
  return ask(`保存されていない、前回の編集内容が残っています（${detail}）。復元しますか？`, {
    title: "IdeaTree",
    kind: "info",
    okLabel: "復元する",
    cancelLabel: "破棄する",
  });
}
