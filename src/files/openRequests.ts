export async function takePendingOpenFiles(): Promise<string[]> {
  throw new Error("未実装");
}
export async function onOpenFileRequest(_handler: (path: string) => void): Promise<() => void> {
  throw new Error("未実装");
}
