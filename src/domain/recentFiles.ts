export interface RecentFile {
  path: string;
  openedAt: string;
}

export const MAX_RECENT_FILES = 10;

export function addRecentFile(_list: RecentFile[], _path: string, _now: Date): RecentFile[] {
  throw new Error("未実装");
}
export function removeRecentFile(_list: RecentFile[], _path: string): RecentFile[] {
  throw new Error("未実装");
}
export function serializeRecentFiles(_list: RecentFile[]): string {
  throw new Error("未実装");
}
export function parseRecentFiles(_text: string): RecentFile[] {
  throw new Error("未実装");
}
export function recentFileName(_path: string): string {
  throw new Error("未実装");
}
export function recentFileFolder(_path: string): string {
  throw new Error("未実装");
}
