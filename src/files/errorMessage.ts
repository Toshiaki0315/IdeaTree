/** 失敗の原因を、表示できる文字列にする（Tauri のコマンドの失敗は、Error ではなく文字列で届く） */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
