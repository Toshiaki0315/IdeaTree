import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * ウィンドウを閉じる操作を監視し、未保存の変更があれば、確認してから閉じる。
 * 「キャンセル」を選んだとき、確認のダイアログが失敗したときは、変更を失わないよう、閉じるのを止める。
 * 戻り値は、監視を解除する関数。
 */
export function registerCloseGuard(
  isDirty: () => boolean,
  confirm: () => Promise<boolean>,
): Promise<() => void> {
  return getCurrentWindow().onCloseRequested(async (event) => {
    if (!isDirty()) return;
    const proceed = await confirm().catch(() => false);
    if (!proceed) event.preventDefault();
  });
}
