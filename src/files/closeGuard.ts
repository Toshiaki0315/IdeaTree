/** ウィンドウを閉じるときに、未保存の変更を確認する（未実装） */
export async function registerCloseGuard(
  _isDirty: () => boolean,
  _confirm: () => Promise<boolean>,
): Promise<() => void> {
  throw new Error("未実装");
}
