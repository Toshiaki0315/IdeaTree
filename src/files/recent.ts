import type { RecentFile } from "../domain/recentFiles";

export async function readRecentFiles(): Promise<RecentFile[]> {
  throw new Error("未実装");
}
export async function writeRecentFiles(_list: RecentFile[]): Promise<void> {
  throw new Error("未実装");
}
